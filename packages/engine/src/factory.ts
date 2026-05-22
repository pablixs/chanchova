// Factory mode-agnostico para crear una sesion de juego nueva.
//
// El motor crea el EngineState inicial en estado LOBBY, sin ronda activa.
// Despues de esto, el server debe despachar { type: "START_ROUND" } para
// arrancar la primera ronda (que es responsabilidad del strategy del modo).

import type {
  DeckMeta,
  GameConfig,
  GameMode,
  Player,
  SessionVisibility,
} from "@chanchova/shared";
import {
  CENTER_GRAB_TIMEOUT_MS,
  CONFIRM_CONTINUE_TIMEOUT_MS,
  MAX_PLAYERS,
  RECONNECT_GRACE_MS,
  SLAP_TIMEOUT_MS,
} from "@chanchova/shared";
import { initialScoreFor } from "./scoring";
import type { EngineState } from "./types";

export interface CreateSessionInput {
  id: string;
  code: string;
  mode: GameMode;
  deck: DeckMeta;
  visibility: SessionVisibility;
  hostId: string;
  players: Player[];
  config?: Partial<GameConfig>;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  maxPlayers: MAX_PLAYERS,
  reconnectGraceMs: RECONNECT_GRACE_MS,
  centerGrabTimeoutMs: CENTER_GRAB_TIMEOUT_MS,
  slapTimeoutMs: SLAP_TIMEOUT_MS,
  confirmContinueTimeoutMs: CONFIRM_CONTINUE_TIMEOUT_MS,
};

/**
 * Crea un EngineState nuevo en estado LOBBY. Inicializa los scores en cero
 * para todos los jugadores. No arma todavia ni mazo ni mano: eso ocurre al
 * dispachar la primera accion START_ROUND.
 */
export function createGameSession(input: CreateSessionInput): EngineState {
  const config: GameConfig = {
    ...DEFAULT_GAME_CONFIG,
    ...(input.config ?? {}),
  };

  return {
    id: input.id,
    code: input.code,
    visibility: input.visibility,
    mode: input.mode,
    deck: input.deck,
    status: "LOBBY",
    hostId: input.hostId,
    players: [...input.players],
    scores: input.players.map((p) => initialScoreFor(p.id)),
    config,
    hands: {},
    directorRotation: [],
    currentDirectorIndex: -1,
    roundIndex: -1,
  };
}
