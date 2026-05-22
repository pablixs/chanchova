// Proyector de estado: convierte el EngineState (que tiene info privada como
// las manos completas y las cartas reales del pozo) en una "vista publica"
// segura para enviar a TODOS los clientes via WebSocket.
//
// Tambien expone helpers para obtener la mano privada de un jugador especifico
// (que se manda solo a ese cliente).

import type {
  Card,
  CenterPoolState,
  GameSession,
  PublicActiveCall,
  Round,
} from "@chanchova/shared";
import type { EngineRound, EngineState } from "@chanchova/engine";

/**
 * Devuelve el estado publico de una partida: jugadores, fase, scores, etc.
 * NO incluye las manos de los jugadores ni las cartas reales del pozo central.
 */
export function projectPublicState(state: EngineState): GameSession {
  return {
    id: state.id,
    code: state.code,
    visibility: state.visibility,
    mode: state.mode,
    deckId: state.deck.id,
    status: state.status,
    hostId: state.hostId,
    players: state.players,
    scores: state.scores,
    currentRound: state.currentRound
      ? projectRound(state.currentRound)
      : undefined,
    config: state.config,
  };
}

function projectRound(round: EngineRound): Round {
  let centerPool: CenterPoolState | undefined;
  if (round.centerPoolPrivate) {
    centerPool = {
      cardCount: round.centerPoolPrivate.cards.length,
      expectedDropPerPlayer: round.centerPoolPrivate.expectedDropPerPlayer,
      expiresAt: round.centerPoolPrivate.expiresAt,
      grabsByPlayer: round.centerPoolPrivate.grabsByPlayer,
    };
  }

  let activeCall: PublicActiveCall | undefined;
  if (round.activeCall) {
    activeCall = {
      type: round.activeCall.type,
      callerId: round.activeCall.callerId,
      startedAt: round.activeCall.startedAt,
      expiresAt: round.activeCall.expiresAt,
      slaps: round.activeCall.slaps.map((s) => ({
        playerId: s.playerId,
        timestamp: s.timestamp,
      })),
    };
  }

  return {
    index: round.index,
    mode: round.mode,
    directorId: round.directorId,
    phase: round.phase,
    pendingPass: round.pendingPass,
    centerPool,
    activeCall,
    chanchasUsedBy: round.chanchasUsedBy,
  };
}

/** Devuelve la mano privada de un jugador (lo que ese cliente ve). */
export function projectPrivateHand(
  state: EngineState,
  playerId: string,
): Card[] {
  return state.hands[playerId] ?? [];
}
