// Servicio que orquesta la partida.
//
// Es el unico punto donde se aplica el motor de juego: recibe acciones del
// gateway (que vienen del WebSocket), las despacha al ChanchoDirigidoStrategy,
// guarda el nuevo estado y se encarga de:
//   1. Broadcastear estado publico (con ids anonimos del pozo).
//   2. Enviar la mano privada a cada cliente (segun cambie).
//   3. Programar / cancelar timers de slap, pozo, gracia de reconexion y la
//      pausa entre rondas.
//   4. Reaccionar a fin de ronda (auto START_ROUND tras una breve pausa) y
//      fin de partida.
//   5. Gatillar al BotOrchestrator para que los bots actuen.

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Server } from "socket.io";

import {
  ChanchoDirigidoStrategy,
  createGameSession,
  defaultRng,
  type EngineAction,
  type EngineDeps,
  type EngineEmittedEvent,
  type EngineState,
} from "@chanchova/engine";
import { getDeck } from "@chanchova/decks";
import {
  SERVER_EVENTS,
  type GameSession,
  type Player,
} from "@chanchova/shared";

import { ConnectionRegistry } from "../connection/connection.registry";
import type { LobbyRoom } from "../lobby/lobby.service";
import { BotOrchestrator } from "./bot/bot-orchestrator";
import { GameStore } from "./game-store";
import { PoolAnonymizer } from "./pool-anonymizer";
import {
  projectPrivateHand,
  projectPublicState,
} from "./public-state.projector";
import { TimeoutManager } from "./timeout-manager";

/** Pausa antes de auto-arrancar la siguiente ronda tras un Chancho. */
const NEXT_ROUND_DELAY_MS = 3_500;

@Injectable()
export class GameService implements OnModuleInit {
  private readonly logger = new Logger(GameService.name);
  private readonly strategy = new ChanchoDirigidoStrategy();
  private readonly deps: EngineDeps = { rng: defaultRng };

  private io?: Server;

  constructor(
    private readonly store: GameStore,
    private readonly registry: ConnectionRegistry,
    private readonly timeouts: TimeoutManager,
    private readonly bots: BotOrchestrator,
    private readonly anonymizer: PoolAnonymizer,
  ) {}

  onModuleInit(): void {
    this.bots.setDispatcher((gameId, action) =>
      this.submitAction(gameId, action),
    );
  }

  // -------------------------------------------------------------------------
  // Arranque de partida.
  // -------------------------------------------------------------------------
  startGame(room: LobbyRoom, io: Server): void {
    this.io = io;
    const deck = getDeck(room.deckId);
    if (!deck) throw new Error(`Mazo desconocido: ${room.deckId}`);
    const initial = createGameSession({
      id: room.gameId,
      code: room.code,
      mode: room.mode,
      deck,
      visibility: room.visibility,
      hostId: room.hostUserId,
      players: room.players,
    });
    this.store.set(room.gameId, initial);
    this.dispatch(room.gameId, { type: "START_ROUND", timestamp: Date.now() });
    this.broadcastGameStarted(room.gameId);
  }

  // -------------------------------------------------------------------------
  // Despacho de acciones.
  // -------------------------------------------------------------------------
  submitAction(gameId: string, action: EngineAction): { error?: string } {
    return this.dispatch(gameId, action);
  }

  /**
   * Variante para acciones que necesitan traduccion de id anonimo del pozo
   * a id real (PLAYER_GRABS_FROM_CENTER). Si no se puede resolver, devuelve
   * error y no toca el motor.
   */
  submitGrab(gameId: string, playerId: string, anonCardId: string): { error?: string } {
    const realId = this.anonymizer.resolveAnonId(gameId, anonCardId);
    if (!realId) {
      return { error: "CARD_NOT_IN_POOL: id desconocido" };
    }
    return this.dispatch(gameId, {
      type: "PLAYER_GRABS_FROM_CENTER",
      playerId,
      cardId: realId,
      timestamp: Date.now(),
    });
  }

  // -------------------------------------------------------------------------
  // Hooks de conexion.
  // -------------------------------------------------------------------------
  handlePlayerDisconnected(gameId: string, userId: string): void {
    const state = this.store.get(gameId);
    if (!state || state.status !== "IN_PROGRESS") return;
    const newPlayers = state.players.map((p) =>
      p.id === userId ? { ...p, status: "DISCONNECTED" as const } : p,
    );
    const newState: EngineState = { ...state, players: newPlayers };
    this.store.set(gameId, newState);
    this.broadcastPublicState(gameId, newState);
    this.broadcastDisconnected(gameId, userId, state.config.reconnectGraceMs);

    this.timeouts.schedule(
      gameId,
      `reconnect:${userId}`,
      state.config.reconnectGraceMs,
      () => this.handleAbandonExpired(gameId, userId),
    );
  }

  handlePlayerReconnected(gameId: string, userId: string): void {
    this.timeouts.cancel(gameId, `reconnect:${userId}`);
    const state = this.store.get(gameId);
    if (!state) return;
    const newPlayers = state.players.map((p) =>
      p.id === userId ? { ...p, status: "CONNECTED" as const } : p,
    );
    const newState: EngineState = { ...state, players: newPlayers };
    this.store.set(gameId, newState);
    this.broadcastPublicState(gameId, newState);
    this.broadcastReconnected(gameId, userId);
    this.sendPrivateHand(userId, projectPrivateHand(newState, userId));
  }

  private handleAbandonExpired(gameId: string, userId: string): void {
    this.logger.warn(`abandon: ${userId} en game ${gameId}`);
    const result = this.dispatch(gameId, {
      type: "PLAYER_ABANDONED",
      playerId: userId,
      timestamp: Date.now(),
    });
    if (result.error) return;
    const state = this.store.get(gameId);
    if (state && state.status === "IN_PROGRESS") {
      this.dispatch(gameId, {
        type: "START_ROUND",
        timestamp: Date.now(),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Dispatch principal.
  // -------------------------------------------------------------------------
  private dispatch(gameId: string, action: EngineAction): { error?: string } {
    const state = this.store.get(gameId);
    if (!state) return { error: "GAME_NOT_FOUND" };

    const result = this.strategy.applyAction(state, action, this.deps);
    if (result.error) {
      return { error: `${result.error.code}: ${result.error.message}` };
    }
    this.store.set(gameId, result.state);
    this.broadcastPublicState(gameId, result.state);
    this.broadcastHandsIfChanged(gameId, state, result.state);
    this.broadcastEvents(gameId, result.events ?? []);
    this.scheduleTimersForState(gameId, result.state);

    if (result.state.status === "FINISHED") {
      this.timeouts.cancelAll(gameId);
      this.bots.cancelGame(gameId);
      this.anonymizer.clear(gameId);
      return {};
    }

    // Si la ronda quedo en RESOLVED, programar arranque de la siguiente
    // tras una pausa para que los jugadores vean el resultado. Pausamos los
    // bots hasta entonces (no tienen nada que hacer en RESOLVED).
    if (result.state.currentRound?.phase === "RESOLVED") {
      this.bots.cancelGame(gameId);
      this.timeouts.schedule(gameId, "next-round", NEXT_ROUND_DELAY_MS, () => {
        this.dispatch(gameId, { type: "START_ROUND", timestamp: Date.now() });
      });
      return {};
    }

    // Estado normal: que los bots evaluen.
    this.bots.evaluate(gameId);
    return {};
  }

  // -------------------------------------------------------------------------
  // Programacion de timers segun la fase.
  // -------------------------------------------------------------------------
  private scheduleTimersForState(gameId: string, state: EngineState): void {
    const round = state.currentRound;
    if (!round) return;

    if (round.activeCall) {
      const remaining = round.activeCall.expiresAt - Date.now();
      this.timeouts.schedule(gameId, "slap", remaining, () => {
        this.dispatch(gameId, {
          type: "CALL_TIMEOUT",
          timestamp: Date.now(),
        });
      });
    } else {
      this.timeouts.cancel(gameId, "slap");
    }

    if (round.phase === "CENTER_GRAB" && round.centerPoolPrivate) {
      const remaining = round.centerPoolPrivate.expiresAt - Date.now();
      this.timeouts.schedule(gameId, "center", remaining, () => {
        this.dispatch(gameId, {
          type: "CENTER_TIMEOUT",
          timestamp: Date.now(),
        });
      });
    } else {
      this.timeouts.cancel(gameId, "center");
    }
  }

  // -------------------------------------------------------------------------
  // Broadcasts.
  // -------------------------------------------------------------------------
  private broadcastGameStarted(gameId: string): void {
    if (!this.io) return;
    this.io.to(this.channel(gameId)).emit(SERVER_EVENTS.GAME_STARTED, { gameId });
  }

  private broadcastPublicState(gameId: string, state: EngineState): void {
    if (!this.io) return;
    const publicState: GameSession = projectPublicState(state, this.anonymizer);
    this.io.to(this.channel(gameId)).emit(SERVER_EVENTS.GAME_PUBLIC_STATE, {
      session: publicState,
    });
  }

  private broadcastDisconnected(
    gameId: string,
    playerId: string,
    timeoutMs: number,
  ): void {
    if (!this.io) return;
    this.io
      .to(this.channel(gameId))
      .emit(SERVER_EVENTS.GAME_PLAYER_DISCONNECTED, { playerId, timeoutMs });
  }

  private broadcastReconnected(gameId: string, playerId: string): void {
    if (!this.io) return;
    this.io
      .to(this.channel(gameId))
      .emit(SERVER_EVENTS.GAME_PLAYER_RECONNECTED, { playerId });
  }

  private broadcastHandsIfChanged(
    gameId: string,
    prev: EngineState,
    next: EngineState,
  ): void {
    if (!this.io) return;
    for (const player of next.players) {
      if (player.isBot) continue;
      const before = prev.hands[player.id];
      const after = next.hands[player.id];
      if (handsEqual(before, after)) continue;
      this.sendPrivateHand(player.id, projectPrivateHand(next, player.id));
    }
  }

  private sendPrivateHand(userId: string, cards: unknown): void {
    if (!this.io) return;
    const sockets = this.registry.socketsForUser(userId);
    for (const socketId of sockets) {
      this.io.to(socketId).emit(SERVER_EVENTS.GAME_HAND_DEALT, { cards });
    }
  }

  private broadcastEvents(
    gameId: string,
    events: EngineEmittedEvent[],
  ): void {
    if (!this.io || events.length === 0) return;
    for (const event of events) {
      const wsEvent = mapEngineEventToWsEvent(event);
      if (wsEvent) {
        this.io
          .to(this.channel(gameId))
          .emit(wsEvent.type, wsEvent.payload as Record<string, unknown>);
      }
    }
  }

  private channel(gameId: string): string {
    return `room:${gameId}`;
  }

  getPlayers(gameId: string): Player[] | undefined {
    return this.store.get(gameId)?.players;
  }
}

function handsEqual(
  a: { id: string }[] | undefined,
  b: { id: string }[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id) return false;
  }
  return true;
}

function mapEngineEventToWsEvent(
  event: EngineEmittedEvent,
): { type: string; payload: unknown } | undefined {
  switch (event.type) {
    case "ROUND_STARTED":
      return {
        type: SERVER_EVENTS.GAME_ROUND_STARTED,
        payload: { roundIndex: event.roundIndex, directorId: event.directorId },
      };
    case "DIRECTOR_INSTRUCTION":
      return {
        type: SERVER_EVENTS.GAME_DIRECTOR_PASS_REQUESTED,
        payload: { instruction: event.instruction },
      };
    case "CENTER_OPENED":
      // El cardCount real lo van a recibir via game:public_state. Aqui solo
      // notificamos el evento.
      return {
        type: SERVER_EVENTS.GAME_CENTER_OPEN,
        payload: { cardCount: event.cardCount },
      };
    case "CENTER_CLOSED":
      return { type: SERVER_EVENTS.GAME_CENTER_CLOSED, payload: {} };
    case "CHANCHO_CALLED":
      return {
        type: SERVER_EVENTS.GAME_CHANCHO_CALLED,
        payload: {
          callerId: event.callerId,
          valid: event.valid,
          expiresAt: event.expiresAt,
        },
      };
    case "CHANCHA_CALLED":
      return {
        type: SERVER_EVENTS.GAME_CHANCHA_CALLED,
        payload: { callerId: event.callerId, expiresAt: event.expiresAt },
      };
    case "SLAP_REGISTERED":
      return {
        type: SERVER_EVENTS.GAME_SLAP_REGISTERED,
        payload: { playerId: event.playerId, timestamp: event.timestamp },
      };
    case "ROUND_RESOLVED":
      return {
        type: SERVER_EVENTS.GAME_ROUND_RESOLVED,
        payload: { penalties: event.penalties, winnerId: event.winnerId },
      };
    case "PLAYER_ELIMINATED":
      return {
        type: SERVER_EVENTS.GAME_PLAYER_ELIMINATED,
        payload: { playerId: event.playerId },
      };
    case "PLAYER_ABANDONED":
      return {
        type: SERVER_EVENTS.GAME_PLAYER_ELIMINATED,
        payload: { playerId: event.playerId, reason: "ABANDONED" },
      };
    case "GAME_FINISHED":
      return {
        type: SERVER_EVENTS.GAME_FINISHED,
        payload: { winnerId: event.winnerId },
      };
    default:
      return undefined;
  }
}
