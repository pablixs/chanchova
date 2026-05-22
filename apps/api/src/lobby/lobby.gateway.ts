// Gateway WebSocket para todos los eventos del lobby.
//
// Cada cliente se conecta primero, manda `auth:identify` con su nombre de guest
// (la version completa con Google OAuth llega en una fase posterior), y a partir
// de ese momento puede crear/unirse/listar salas.

import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { customAlphabet } from "nanoid";

import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type AuthIdentifyPayload,
  type LobbyAddBotPayload,
  type LobbyCreatePayload,
  type LobbyJoinPayload,
} from "@chanchova/shared";

import { ConnectionRegistry } from "../connection/connection.registry";
import { GameService } from "../game/game.service";
import { LobbyService, type LobbyRoom } from "./lobby.service";

const userIdNanoid = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz0123456789",
  10,
);

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LobbyGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly registry: ConnectionRegistry,
    private readonly lobby: LobbyService,
    private readonly games: GameService,
  ) {}

  handleConnection(socket: Socket): void {
    this.logger.log(`socket connected ${socket.id}`);
  }

  handleDisconnect(socket: Socket): void {
    const info = this.registry.unregister(socket.id);
    this.logger.log(
      `socket disconnected ${socket.id} (user=${info?.userId ?? "-"} game=${info?.gameId ?? "-"})`,
    );
    if (info?.gameId) {
      // Si estaba en una sala todavia en LOBBY, lo sacamos. Si la partida ya
      // empezo, GameService maneja la desconexion (proxima fase: gracia 10s).
      const room = this.lobby.get(info.gameId);
      if (room?.status === "WAITING") {
        const updated = this.lobby.leave(info.gameId, info.userId);
        if (updated) this.broadcastLobbyState(updated);
      } else if (room?.status === "STARTED") {
        this.games.handlePlayerDisconnected(info.gameId, info.userId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // auth:identify
  // -------------------------------------------------------------------------
  @SubscribeMessage(CLIENT_EVENTS.AUTH_IDENTIFY)
  handleIdentify(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: AuthIdentifyPayload,
  ): void {
    const guestName = (payload.guestName ?? "").trim();
    if (!guestName) {
      socket.emit(SERVER_EVENTS.AUTH_ERROR, {
        code: "MISSING_NAME",
        message: "Debes indicar un nombre de invitado",
      });
      return;
    }
    const userId = `guest-${userIdNanoid()}`;
    this.registry.register(socket.id, {
      userId,
      displayName: guestName,
      isGuest: true,
    });
    socket.emit(SERVER_EVENTS.AUTH_OK, {
      userId,
      displayName: guestName,
      isGuest: true,
    });
    this.logger.log(`identified ${socket.id} -> ${userId} (${guestName})`);
  }

  // -------------------------------------------------------------------------
  // lobby:create
  // -------------------------------------------------------------------------
  @SubscribeMessage(CLIENT_EVENTS.LOBBY_CREATE)
  handleCreate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: LobbyCreatePayload,
  ): void {
    const conn = this.registry.get(socket.id);
    if (!conn) return this.emitError(socket, "NOT_AUTHENTICATED");
    const room = this.lobby.create({
      hostUserId: conn.userId,
      hostDisplayName: conn.displayName,
      mode: payload.mode,
      visibility: payload.visibility,
      deckId: payload.deckId,
    });
    void socket.join(this.roomChannel(room.gameId));
    this.registry.setGameId(socket.id, room.gameId);
    this.broadcastLobbyState(room);
  }

  // -------------------------------------------------------------------------
  // lobby:join
  // -------------------------------------------------------------------------
  @SubscribeMessage(CLIENT_EVENTS.LOBBY_JOIN)
  handleJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: LobbyJoinPayload,
  ): void {
    const conn = this.registry.get(socket.id);
    if (!conn) return this.emitError(socket, "NOT_AUTHENTICATED");
    try {
      const room = this.lobby.join(
        payload.code.toUpperCase(),
        conn.userId,
        conn.displayName,
      );
      void socket.join(this.roomChannel(room.gameId));
      this.registry.setGameId(socket.id, room.gameId);
      this.broadcastLobbyState(room);
    } catch (err) {
      this.emitError(socket, "JOIN_FAILED", (err as Error).message);
    }
  }

  // -------------------------------------------------------------------------
  // lobby:leave
  // -------------------------------------------------------------------------
  @SubscribeMessage(CLIENT_EVENTS.LOBBY_LEAVE)
  handleLeave(@ConnectedSocket() socket: Socket): void {
    const conn = this.registry.get(socket.id);
    if (!conn?.gameId) return;
    const updated = this.lobby.leave(conn.gameId, conn.userId);
    void socket.leave(this.roomChannel(conn.gameId));
    this.registry.setGameId(socket.id, undefined);
    if (updated) this.broadcastLobbyState(updated);
  }

  // -------------------------------------------------------------------------
  // lobby:list_public
  // -------------------------------------------------------------------------
  @SubscribeMessage(CLIENT_EVENTS.LOBBY_LIST_PUBLIC)
  handleListPublic(@ConnectedSocket() socket: Socket): void {
    const rooms = this.lobby.listPublic().map((r) => ({
      gameId: r.gameId,
      code: r.code,
      mode: r.mode,
      hostId: r.hostUserId,
      players: r.players.length,
      maxPlayers: 4,
    }));
    socket.emit(SERVER_EVENTS.LOBBY_PUBLIC_LIST, rooms);
  }

  // -------------------------------------------------------------------------
  // lobby:add_bot
  // -------------------------------------------------------------------------
  @SubscribeMessage(CLIENT_EVENTS.LOBBY_ADD_BOT)
  handleAddBot(
    @ConnectedSocket() socket: Socket,
    @MessageBody() _payload: LobbyAddBotPayload,
  ): void {
    const conn = this.registry.get(socket.id);
    if (!conn?.gameId) return this.emitError(socket, "NOT_IN_GAME");
    try {
      const room = this.lobby.addBot(conn.gameId, conn.userId);
      this.broadcastLobbyState(room);
    } catch (err) {
      this.emitError(socket, "ADD_BOT_FAILED", (err as Error).message);
    }
  }

  // -------------------------------------------------------------------------
  // lobby:start
  // -------------------------------------------------------------------------
  @SubscribeMessage(CLIENT_EVENTS.LOBBY_START)
  handleStart(@ConnectedSocket() socket: Socket): void {
    const conn = this.registry.get(socket.id);
    if (!conn?.gameId) return this.emitError(socket, "NOT_IN_GAME");
    try {
      const room = this.lobby.markStarted(conn.gameId, conn.userId);
      this.games.startGame(room, this.server);
    } catch (err) {
      this.emitError(socket, "START_FAILED", (err as Error).message);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private roomChannel(gameId: string): string {
    return `room:${gameId}`;
  }

  private broadcastLobbyState(room: LobbyRoom): void {
    this.server.to(this.roomChannel(room.gameId)).emit(SERVER_EVENTS.LOBBY_STATE, {
      gameId: room.gameId,
      code: room.code,
      mode: room.mode,
      visibility: room.visibility,
      deckId: room.deckId,
      status: room.status,
      hostUserId: room.hostUserId,
      players: room.players,
    });
  }

  private emitError(socket: Socket, code: string, message?: string): void {
    socket.emit(SERVER_EVENTS.ERROR, {
      code,
      message: message ?? code,
    });
  }
}
