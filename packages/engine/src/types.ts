// Tipos internos del motor.
//
// El motor opera sobre un EngineState que extiende GameSession (publico) con
// informacion privada (manos por jugador) y estructuras auxiliares de la ronda
// (cola de pases, estado del slap, etc.) que no se exponen al cliente.
//
// Las acciones (EngineAction) son tipadas y discriminadas por `type`. El reducer
// del modo (GameModeStrategy) consume una accion y devuelve un nuevo EngineState.

import type {
  Card,
  DeckMeta,
  GameConfig,
  GameMode,
  LetterScore,
  PassDirection,
  PassInstruction,
  Player,
  Round,
  RoundPhase,
  SessionStatus,
  SessionVisibility,
} from "@chanchova/shared";

// Estado privado adicional del centro de la mesa.
// `cards` es la fuente de verdad del server: lista mutable que se vacia a medida
// que los jugadores agarran cartas. El cliente solo ve la cantidad restante.
export interface CenterPoolEngineState {
  cards: Card[];
  expectedDropPerPlayer: number;
  expiresAt: number;
  grabsByPlayer: Record<string, number>;
}

// Slap registrado durante la ventana de un Chancho/Chancha.
export interface SlapRecord {
  playerId: string;
  timestamp: number;
}

// Estado del llamado activo (Chancho o Chancha) durante su ventana de slaps.
export interface ActiveCall {
  type: "CHANCHO" | "CHANCHA";
  callerId: string;
  // Solo valido para CHANCHO: indica si el cantor realmente tenia 4 iguales.
  callerHadValidChancho: boolean;
  startedAt: number;
  expiresAt: number;
  slaps: SlapRecord[];
  // Para CHANCHA: fase a la que volver despues de resolver el amague.
  resumePhase?: RoundPhase;
}

// Snapshot de pases pendientes durante PASSING_LATERAL.
// Cada jugador elige `count` cartas y las deposita aqui hasta que todos tiraron.
export interface LateralPassQueue {
  count: number;
  direction: "LEFT" | "RIGHT";
  selectionsByPlayer: Record<string, Card[]>;
}

export interface EngineRound extends Round {
  // Cuando phase === PASSING_LATERAL.
  passQueue?: LateralPassQueue;
  // Cuando phase === CENTER_DROP o CENTER_GRAB.
  centerPoolPrivate?: CenterPoolEngineState;
  // Cuando hay una llamada activa (CHANCHO o CHANCHA en ventana de slaps).
  activeCall?: ActiveCall;
}

// Estado completo del motor para una partida en curso.
// Mezcla campos publicos (espejo de GameSession) con privados (hands, rotacion).
export interface EngineState {
  // ---- Espejo publico (proyectable a GameSession) ----
  id: string;
  code: string;
  visibility: SessionVisibility;
  mode: GameMode;
  deck: DeckMeta;
  status: SessionStatus;
  hostId: string;
  players: Player[];
  scores: LetterScore[];
  currentRound?: EngineRound;
  config: GameConfig;
  // ---- Privado del motor ----
  // Mano de cada jugador. Solo el server conoce la mano completa de todos.
  hands: Record<string, Card[]>;
  // Orden en que rotan los directores (clockwise por seatIndex). Se reordena
  // si hay eliminados.
  directorRotation: string[];
  // Indice del director actual dentro de directorRotation.
  currentDirectorIndex: number;
  // Indice de ronda (incrementa con cada nueva ronda).
  roundIndex: number;
}

// Acciones del motor. Discriminadas por `type`.
// Todas las acciones llevan `timestamp` (ms epoch) provisto por el caller
// (el server). El motor es puro: no llama a Date.now() internamente.
export type EngineAction =
  | { type: "START_ROUND"; timestamp: number }
  | {
      type: "DIRECTOR_INSTRUCTS_PASS";
      playerId: string;
      instruction: PassInstruction;
      timestamp: number;
    }
  | {
      type: "PLAYER_SELECTS_LATERAL_PASS";
      playerId: string;
      cardIds: string[];
      timestamp: number;
    }
  | {
      type: "PLAYER_DROPS_TO_CENTER";
      playerId: string;
      cardIds: string[];
      timestamp: number;
    }
  | {
      type: "PLAYER_GRABS_FROM_CENTER";
      playerId: string;
      cardId: string;
      timestamp: number;
    }
  | { type: "CENTER_TIMEOUT"; timestamp: number }
  | { type: "PLAYER_CALLS_CHANCHO"; playerId: string; timestamp: number }
  | { type: "PLAYER_CALLS_CHANCHA"; playerId: string; timestamp: number }
  | { type: "PLAYER_SLAPS"; playerId: string; timestamp: number }
  | { type: "CALL_TIMEOUT"; timestamp: number }
  | { type: "PLAYER_ABANDONED"; playerId: string; timestamp: number };

// Dependencias del motor (RNG inyectable para tests deterministicos).
export interface EngineDeps {
  rng: () => number;
}

// Re-export para no obligar a importar DeckMeta desde shared al usar el factory.
export type { DeckMeta };

// Resultado de aplicar una accion. Si la accion es invalida, se devuelve el
// estado sin cambios + un `error` describiendo el motivo.
export interface ApplyResult {
  state: EngineState;
  error?: { code: string; message: string };
  events?: EngineEmittedEvent[];
}

// Eventos que el motor emite hacia el caller (server) al aplicar una accion.
// El server traduce estos eventos a eventos WebSocket para los clientes.
export type EngineEmittedEvent =
  | { type: "ROUND_STARTED"; roundIndex: number; directorId: string | undefined }
  | { type: "DIRECTOR_INSTRUCTION"; instruction: PassInstruction }
  | { type: "PASS_RESOLVED"; instruction: PassInstruction }
  | { type: "CENTER_OPENED"; cardCount: number }
  | { type: "CENTER_CLOSED" }
  | {
      type: "CHANCHO_CALLED";
      callerId: string;
      valid: boolean;
      expiresAt: number;
    }
  | { type: "CHANCHA_CALLED"; callerId: string; expiresAt: number }
  | { type: "SLAP_REGISTERED"; playerId: string; timestamp: number }
  | {
      type: "ROUND_RESOLVED";
      // Lista de jugadores que reciben letra esta ronda y por que motivo.
      penalties: { playerId: string; reason: PenaltyReason }[];
      winnerId?: string;
    }
  | { type: "PLAYER_ELIMINATED"; playerId: string }
  | { type: "PLAYER_ABANDONED"; playerId: string }
  | { type: "GAME_FINISHED"; winnerId: string };

export type PenaltyReason =
  | "FELL_FOR_CHANCHA"
  | "LAST_TO_SLAP"
  | "SLAP_TIMEOUT"
  | "INVALID_CHANCHO_CALL";
