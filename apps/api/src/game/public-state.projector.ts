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

import type { PoolAnonymizer } from "./pool-anonymizer";

/**
 * Devuelve el estado publico de una partida: jugadores, fase, scores, etc.
 * NO incluye las manos de los jugadores ni los ids reales de las cartas del
 * pozo central. Para el pozo, traducimos cada id real a un id anonimo via
 * PoolAnonymizer (el cliente clickea el id anonimo, el server lo resuelve).
 */
export function projectPublicState(
  state: EngineState,
  anonymizer: PoolAnonymizer,
): GameSession {
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
      ? projectRound(state.id, state.currentRound, anonymizer)
      : undefined,
    config: state.config,
  };
}

function projectRound(
  gameId: string,
  round: EngineRound,
  anonymizer: PoolAnonymizer,
): Round {
  let centerPool: CenterPoolState | undefined;
  if (round.centerPoolPrivate) {
    // Solo durante CENTER_GRAB usamos anon ids para que el cliente pueda
    // clickear cartas. En CENTER_DROP el pozo va creciendo pero todavia no
    // se ve; mandamos lista vacia para evitar leak (cardCount queda 0).
    if (round.phase === "CENTER_GRAB") {
      const realIds = round.centerPoolPrivate.cards.map((c) => c.id);
      const anonIds = anonymizer.ensureMapping(gameId, realIds);
      centerPool = {
        cardIds: anonIds,
        expectedDropPerPlayer: round.centerPoolPrivate.expectedDropPerPlayer,
        expiresAt: round.centerPoolPrivate.expiresAt,
        grabsByPlayer: round.centerPoolPrivate.grabsByPlayer,
      };
    } else {
      // En CENTER_DROP el cliente solo necesita saber cuantas cartas esperar.
      centerPool = {
        cardIds: [],
        expectedDropPerPlayer: round.centerPoolPrivate.expectedDropPerPlayer,
        expiresAt: round.centerPoolPrivate.expiresAt,
        grabsByPlayer: round.centerPoolPrivate.grabsByPlayer,
      };
    }
  } else {
    // Pozo no abierto: limpiar cualquier mapping anterior asociado al juego.
    anonymizer.clear(gameId);
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
