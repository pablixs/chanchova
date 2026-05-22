// Tipos del dominio del juego.
// El motor de juego (`@chanchova/engine`) opera sobre estos tipos.

export type GameMode = "CHANCHO_DIRIGIDO" | "CHANCHO_VA";

// Mazo abstracto: las reglas siempre comparan por `value`.
// Cada combinación (value, suit) es única dentro del mazo.
export interface DeckMeta {
  id: string;
  name: string;
  values: string[];
  suits: string[];
}

export interface Card {
  id: string;
  deckId: string;
  value: string;
  suit: string;
}

export type PlayerStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "PAUSED"
  | "ELIMINATED";

export interface Player {
  id: string; // session id (no necesariamente userId)
  userId?: string; // null para invitados
  isBot: boolean;
  displayName: string;
  seatIndex: number;
  status: PlayerStatus;
}

export interface LetterScore {
  playerId: string;
  letters: string; // "" -> "C" -> "CH" -> ... -> "CHANCHO"
  isEliminated: boolean;
  consecutiveSlapTimeouts: number;
}

export type PassDirection = "LEFT" | "RIGHT" | "CENTER";

export interface PassInstruction {
  count: number;
  direction: PassDirection;
}

export type RoundPhase =
  | "DIRECTOR_PICKING"
  | "PASSING_LATERAL"
  | "CENTER_DROP"
  | "CENTER_GRAB"
  | "CHANCHO_RESOLVING"
  | "RESOLVED";

/**
 * Vista publica del pozo central. Cada carta tiene un id ANONIMO generado
 * por el server (los reales filtrarian valor/palo). El cliente clickea uno,
 * el server lo traduce al id real antes de procesar.
 */
export interface CenterPoolState {
  /** ids anonimos boca abajo, en el orden visible por el cliente */
  cardIds: string[];
  expectedDropPerPlayer: number;
  expiresAt: number;
  grabsByPlayer: Record<string, number>;
}

/** Vista publica de un slap (sin info que permita gaming del sistema). */
export interface PublicSlap {
  playerId: string;
  timestamp: number;
}

/** Vista publica de la llamada activa (Chancho o Chancha) durante el slap window. */
export interface PublicActiveCall {
  type: "CHANCHO" | "CHANCHA";
  callerId: string;
  startedAt: number;
  expiresAt: number;
  slaps: PublicSlap[];
}

export interface Round {
  index: number;
  mode: GameMode;
  directorId?: string; // null en Chancho Va
  phase: RoundPhase;
  pendingPass?: PassInstruction;
  centerPool?: CenterPoolState;
  activeCall?: PublicActiveCall;
  chanchasUsedBy: string[]; // ids de jugadores que ya amagaron en esta ronda
}

export type SessionStatus = "LOBBY" | "IN_PROGRESS" | "PAUSED" | "FINISHED";
export type SessionVisibility = "PUBLIC" | "PRIVATE";

export interface GameConfig {
  maxPlayers: number;
  reconnectGraceMs: number;
  centerGrabTimeoutMs: number;
  slapTimeoutMs: number;
  confirmContinueTimeoutMs: number;
}

export interface GameSession {
  id: string;
  code: string;
  visibility: SessionVisibility;
  mode: GameMode;
  deckId: string;
  status: SessionStatus;
  hostId: string;
  players: Player[];
  scores: LetterScore[];
  currentRound?: Round;
  config: GameConfig;
}
