// Gateway WebSocket para los eventos de juego (in-game).
//
// Cada handler:
//   1. Resuelve la conexion (registry) -> userId, gameId
//   2. Genera el timestamp en el server (anti-trampa: el cliente no decide
//      cuando "apoyo")
//   3. Arma la EngineAction y se la pasa al GameService.
//   4. Si hay error logico, lo emite al socket que lo origino.

import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { Socket } from "socket.io";

import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type DirectorPassPayload,
  type DropToCenterPayload,
  type GrabFromCenterPayload,
} from "@chanchova/shared";
import type { EngineAction } from "@chanchova/engine";

import { ConnectionRegistry } from "../connection/connection.registry";
import { GameService } from "./game.service";

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class GameGateway {
  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly registry: ConnectionRegistry,
    private readonly games: GameService,
  ) {}

  @SubscribeMessage(CLIENT_EVENTS.GAME_DIRECTOR_PASS)
  handleDirectorPass(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: DirectorPassPayload,
  ): void {
    this.dispatchPlayerAction(socket, (playerId, timestamp) => ({
      type: "DIRECTOR_INSTRUCTS_PASS",
      playerId,
      instruction: payload,
      timestamp,
    }));
  }

  @SubscribeMessage(CLIENT_EVENTS.GAME_PASS_CARD)
  handleSelectLateral(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { cardIds: string[] },
  ): void {
    this.dispatchPlayerAction(socket, (playerId, timestamp) => ({
      type: "PLAYER_SELECTS_LATERAL_PASS",
      playerId,
      cardIds: payload.cardIds,
      timestamp,
    }));
  }

  @SubscribeMessage(CLIENT_EVENTS.GAME_DROP_TO_CENTER)
  handleDropToCenter(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: DropToCenterPayload,
  ): void {
    this.dispatchPlayerAction(socket, (playerId, timestamp) => ({
      type: "PLAYER_DROPS_TO_CENTER",
      playerId,
      cardIds: payload.cardIds,
      timestamp,
    }));
  }

  @SubscribeMessage(CLIENT_EVENTS.GAME_GRAB_FROM_CENTER)
  handleGrabFromCenter(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: GrabFromCenterPayload,
  ): void {
    this.dispatchPlayerAction(socket, (playerId, timestamp) => ({
      type: "PLAYER_GRABS_FROM_CENTER",
      playerId,
      cardId: payload.cardId,
      timestamp,
    }));
  }

  @SubscribeMessage(CLIENT_EVENTS.GAME_CALL_CHANCHO)
  handleCallChancho(@ConnectedSocket() socket: Socket): void {
    this.dispatchPlayerAction(socket, (playerId, timestamp) => ({
      type: "PLAYER_CALLS_CHANCHO",
      playerId,
      timestamp,
    }));
  }

  @SubscribeMessage(CLIENT_EVENTS.GAME_CALL_CHANCHA)
  handleCallChancha(@ConnectedSocket() socket: Socket): void {
    this.dispatchPlayerAction(socket, (playerId, timestamp) => ({
      type: "PLAYER_CALLS_CHANCHA",
      playerId,
      timestamp,
    }));
  }

  @SubscribeMessage(CLIENT_EVENTS.GAME_SLAP)
  handleSlap(@ConnectedSocket() socket: Socket): void {
    // El timestamp del slap lo genera el server (Date.now()) para evitar trampas.
    this.dispatchPlayerAction(socket, (playerId, timestamp) => ({
      type: "PLAYER_SLAPS",
      playerId,
      timestamp,
    }));
  }

  // -------------------------------------------------------------------------
  // Helper compartido
  // -------------------------------------------------------------------------
  private dispatchPlayerAction(
    socket: Socket,
    build: (playerId: string, timestamp: number) => EngineAction,
  ): void {
    const conn = this.registry.get(socket.id);
    if (!conn?.gameId) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "NOT_IN_GAME",
        message: "No estas en una partida",
      });
      return;
    }
    const action = build(conn.userId, Date.now());
    const result = this.games.submitAction(conn.gameId, action);
    if (result.error) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "ACTION_REJECTED",
        message: result.error,
      });
      this.logger.debug(
        `action rejected for ${conn.userId} in ${conn.gameId}: ${result.error}`,
      );
    }
  }
}
