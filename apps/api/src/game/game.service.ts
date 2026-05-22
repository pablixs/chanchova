// Servicio que orquesta la partida.
//
// Es el unico punto donde se aplica el motor de juego: recibe acciones del
// gateway (que vienen del WebSocket), las despacha al ChanchoDirigidoStrategy,
// guarda el nuevo estado y se encarga de:
//   1. Broadcastear estado publico a todos los jugadores de la sala
//   2. Enviar la mano privada a cada cliente (segun cambie)
//   3. Programar / cancelar los timers de slap, pozo central, etc.
//   4. Reaccionar a eventos especiales (eliminacion, fin de partida).
//
// Es la pieza grande pero todas las reglas viven en el motor; aca solo hay
// pegamento entre motor, timers y red.

import { Injectable, Logger } from "@nestjs/common";
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
import { GameStore } from "./game-store";
import {
  projectPrivateHand,
  projectPublicState,
} from "./public-state.projector";
import { TimeoutManager } from "./timeout-manager";

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private readonly strategy = new ChanchoDirigidoStrategy();
  private readonly deps: EngineDeps = { rng: defaultRng };

  // El servidor IO se inyecta diferido (lo recibe el lobby gateway al startGame).
  private io?: Server;

  constructor(
    private readonly store: GameStore,
    private readonly registry: ConnectionRegistry,
    private readonly timeouts: TimeoutManager,
  ) {}

  // -------------------------------------------------------------------------
  // Arranque de partida (lo invoca el LobbyGateway al recibir lobby:start).
  // -------------------------------------------------------------------------
  startGame(room: LobbyRoom, io: Server): void {
    this.io = io;
    const deck = getDeck(room.deckId);
    if (!deck) {
      throw new Error(`Mazo desconocido: ${room.deckId}`);
    }
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

    // Disparar la primera ronda inmediatamente.
    this.dispatch(room.gameId, { type: "START_ROUND", timestamp: Date.now() });
    this.broadcastGameStarted(room.gameId);
  }

  // -------------------------------------------------------------------------
  // Despacho de acciones desde el GameGateway.
  // El gateway hace algunas validaciones (auth, sala) y luego llama a
  // submitAction con el playerId ya resuelto.
  // -------------------------------------------------------------------------
  submitAction(gameId: string, action: EngineAction): { error?: string } {
    return this.dispatch(gameId, action);
  }

  // -------------------------------------------------------------------------
  // Hook desde LobbyGateway cuando un socket se desconecta y estaba en una
  // partida en curso. En esta fase 2 solo logueamos; la gracia de 10s y la
  // re-redistribucion de cartas llega en una iteracion siguiente.
  // -------------------------------------------------------------------------
  handlePlayerDisconnected(gameId: string, userId: string): void {
    this.logger.warn(
      `player ${userId} disconnected from game ${gameId} - reconnect grace TBD`,
    );
  }

  // -------------------------------------------------------------------------
  // Dispatch: aplica accion, guarda estado, broadcastea y maneja timers.
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
    }
    return {};
  }

  // -------------------------------------------------------------------------
  // Programacion de timers segun la fase actual del estado.
  // -------------------------------------------------------------------------
  private scheduleTimersForState(gameId: string, state: EngineState): void {
    const round = state.currentRound;
    if (!round) return;

    // Slap timeout: si hay activeCall, programar su vencimiento.
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

    // Center grab timeout: solo si estamos en CENTER_GRAB.
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
  // Broadcasts
  // -------------------------------------------------------------------------
  private broadcastGameStarted(gameId: string): void {
    if (!this.io) return;
    this.io.to(this.channel(gameId)).emit(SERVER_EVENTS.GAME_STARTED, { gameId });
  }

  private broadcastPublicState(gameId: string, state: EngineState): void {
    if (!this.io) return;
    const publicState: GameSession = projectPublicState(state);
    this.io.to(this.channel(gameId)).emit(SERVER_EVENTS.GAME_PUBLIC_STATE, {
      session: publicState,
    });
  }

  /**
   * Para cada jugador humano cuya mano cambio entre `prev` y `next`, le envia
   * su mano privada via su socket. Asi nunca un cliente recibe la mano de otro.
   */
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

  // Helpers ---------------------------------------------------------------
  private channel(gameId: string): string {
    return `room:${gameId}`;
  }

  /** Devuelve los jugadores activos de una partida (uso del gateway). */
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

/** Mapea un evento del motor al evento WS publico equivalente. */
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
    case "GAME_FINISHED":
      return {
        type: SERVER_EVENTS.GAME_FINISHED,
        payload: { winnerId: event.winnerId },
      };
    default:
      // PASS_RESOLVED y CENTER_DROP_REQUESTED se reflejan via game:public_state.
      return undefined;
  }
}
