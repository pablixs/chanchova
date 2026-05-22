// Lobby: gestion de salas en memoria.
//
// Cada sala tiene un `gameId` (uuid corto), un `code` legible para invitar y
// la lista de jugadores. Mientras la sala esta en estado LOBBY los jugadores
// pueden entrar/salir; cuando arranca el juego se delega al GameService que
// crea el EngineState.

import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { customAlphabet, nanoid } from "nanoid";
import type {
  GameMode,
  Player,
  SessionVisibility,
} from "@chanchova/shared";
import { MAX_PLAYERS, MIN_PLAYERS } from "@chanchova/shared";

// Codigo de sala: 6 caracteres alfanumericos legibles (sin 0/O ni 1/I).
const codeNanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export interface LobbyRoom {
  gameId: string;
  code: string;
  mode: GameMode;
  visibility: SessionVisibility;
  deckId: string;
  hostUserId: string;
  players: Player[];
  status: "WAITING" | "STARTED";
}

export interface CreateLobbyInput {
  hostUserId: string;
  hostDisplayName: string;
  mode: GameMode;
  visibility: SessionVisibility;
  deckId: string;
}

@Injectable()
export class LobbyService {
  // gameId -> room
  private readonly rooms = new Map<string, LobbyRoom>();
  // code -> gameId (para join por codigo)
  private readonly codeIndex = new Map<string, string>();

  create(input: CreateLobbyInput): LobbyRoom {
    const gameId = nanoid(10);
    const code = this.generateUniqueCode();
    const host: Player = {
      id: input.hostUserId,
      userId: input.hostUserId,
      isBot: false,
      displayName: input.hostDisplayName,
      seatIndex: 0,
      status: "CONNECTED",
    };
    const room: LobbyRoom = {
      gameId,
      code,
      mode: input.mode,
      visibility: input.visibility,
      deckId: input.deckId,
      hostUserId: input.hostUserId,
      players: [host],
      status: "WAITING",
    };
    this.rooms.set(gameId, room);
    this.codeIndex.set(code, gameId);
    return room;
  }

  /** Une un jugador humano a la sala identificada por `code`. */
  join(code: string, userId: string, displayName: string): LobbyRoom {
    const gameId = this.codeIndex.get(code);
    if (!gameId) throw new NotFoundException(`Sala con codigo ${code} no existe`);
    const room = this.rooms.get(gameId);
    if (!room) throw new NotFoundException(`Sala ${gameId} no existe`);
    if (room.status !== "WAITING") {
      throw new ConflictException("La partida ya empezo");
    }
    if (room.players.find((p) => p.id === userId)) {
      // Ya estaba en la sala (reconexion sencilla en lobby): devolverla tal cual.
      return room;
    }
    if (room.players.length >= MAX_PLAYERS) {
      throw new ConflictException("Sala llena");
    }
    const seatIndex = room.players.length;
    room.players.push({
      id: userId,
      userId,
      isBot: false,
      displayName,
      seatIndex,
      status: "CONNECTED",
    });
    return room;
  }

  /** Agrega un bot a la sala. Solo el host puede invocarlo. */
  addBot(gameId: string, requesterUserId: string): LobbyRoom {
    const room = this.requireWaitingRoom(gameId);
    if (room.hostUserId !== requesterUserId) {
      throw new ConflictException("Solo el host puede agregar bots");
    }
    if (room.players.length >= MAX_PLAYERS) {
      throw new ConflictException("Sala llena");
    }
    const idx = room.players.filter((p) => p.isBot).length + 1;
    const seatIndex = room.players.length;
    const botId = `bot-${gameId.slice(0, 4)}-${idx}`;
    room.players.push({
      id: botId,
      isBot: true,
      displayName: `Bot ${idx}`,
      seatIndex,
      status: "CONNECTED",
    });
    return room;
  }

  /** Remueve a un jugador de la sala. Si era el host, transfiere el host al siguiente. */
  leave(gameId: string, userId: string): LobbyRoom | undefined {
    const room = this.rooms.get(gameId);
    if (!room) return undefined;
    const idx = room.players.findIndex((p) => p.id === userId);
    if (idx === -1) return room;
    room.players.splice(idx, 1);
    // Reasignar seatIndex consecutivos.
    room.players.forEach((p, i) => (p.seatIndex = i));
    if (room.players.length === 0) {
      this.codeIndex.delete(room.code);
      this.rooms.delete(gameId);
      return undefined;
    }
    if (room.hostUserId === userId) {
      const nextHuman = room.players.find((p) => !p.isBot);
      if (nextHuman) room.hostUserId = nextHuman.id;
    }
    return room;
  }

  /** Lista las salas publicas en estado WAITING. */
  listPublic(): LobbyRoom[] {
    const result: LobbyRoom[] = [];
    for (const room of this.rooms.values()) {
      if (room.visibility === "PUBLIC" && room.status === "WAITING") {
        result.push(room);
      }
    }
    return result;
  }

  get(gameId: string): LobbyRoom | undefined {
    return this.rooms.get(gameId);
  }

  /**
   * Marca la sala como STARTED. La logica del motor de juego vive en
   * GameService; aqui solo registramos el cambio de estado.
   */
  markStarted(gameId: string, requesterUserId: string): LobbyRoom {
    const room = this.requireWaitingRoom(gameId);
    if (room.hostUserId !== requesterUserId) {
      throw new ConflictException("Solo el host puede iniciar la partida");
    }
    if (room.players.length < MIN_PLAYERS) {
      throw new ConflictException(
        `Se necesitan al menos ${MIN_PLAYERS} jugadores para arrancar`,
      );
    }
    room.status = "STARTED";
    return room;
  }

  /** Genera un codigo unico de 6 caracteres reintentando si colisiona. */
  private generateUniqueCode(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = codeNanoid();
      if (!this.codeIndex.has(candidate)) return candidate;
    }
    throw new Error("No se pudo generar un codigo de sala unico");
  }

  private requireWaitingRoom(gameId: string): LobbyRoom {
    const room = this.rooms.get(gameId);
    if (!room) throw new NotFoundException(`Sala ${gameId} no existe`);
    if (room.status !== "WAITING") {
      throw new ConflictException("La partida ya empezo");
    }
    return room;
  }
}
