// Helpers reutilizables para el modo Chancho Dirigido.
//
// Funciones puras: no mutan el estado, devuelven valores derivados o
// resultados de validacion.

import type { Card, LetterScore, Player } from "@chanchova/shared";
import type { EngineState, SlapRecord } from "../types";

/** Devuelve el jugador con el id dado o undefined. */
export function findPlayer(
  state: EngineState,
  playerId: string,
): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

/** Devuelve el LetterScore de un jugador (asume que existe). */
export function getScore(
  state: EngineState,
  playerId: string,
): LetterScore | undefined {
  return state.scores.find((s) => s.playerId === playerId);
}

/** Set de ids de jugadores eliminados. */
export function eliminatedIds(state: EngineState): Set<string> {
  return new Set(
    state.scores.filter((s) => s.isEliminated).map((s) => s.playerId),
  );
}

/** Jugadores activos ordenados clockwise por seatIndex. */
export function activePlayers(state: EngineState): Player[] {
  const elim = eliminatedIds(state);
  return state.players
    .filter((p) => !elim.has(p.id))
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

/**
 * Vecino en la direccion dada (LEFT = clockwise, RIGHT = counter-clockwise),
 * saltando eliminados. Devuelve undefined si no hay otros activos.
 *
 * Asumimos: izquierda del jugador = el siguiente seatIndex (clockwise).
 */
export function getLateralNeighbor(
  state: EngineState,
  playerId: string,
  direction: "LEFT" | "RIGHT",
): Player | undefined {
  const ordered = activePlayers(state);
  const idx = ordered.findIndex((p) => p.id === playerId);
  if (idx === -1 || ordered.length < 2) return undefined;
  const delta = direction === "LEFT" ? 1 : -1;
  const nextIdx = (idx + delta + ordered.length) % ordered.length;
  return ordered[nextIdx];
}

/**
 * Devuelve true si todas las cartas con ids `cardIds` estan en la mano.
 * Cardinalidad importa: si hay duplicados en cardIds, todos deben estar.
 */
export function handContainsAll(hand: Card[], cardIds: string[]): boolean {
  const handIds = new Set(hand.map((c) => c.id));
  return cardIds.every((id) => handIds.has(id));
}

/** Saca las cartas con esos ids de la mano. Devuelve la nueva mano y las removidas. */
export function removeCardsFromHand(
  hand: Card[],
  cardIds: string[],
): { remaining: Card[]; removed: Card[] } {
  const ids = new Set(cardIds);
  const remaining: Card[] = [];
  const removed: Card[] = [];
  for (const card of hand) {
    if (ids.has(card.id)) removed.push(card);
    else remaining.push(card);
  }
  return { remaining, removed };
}

/**
 * Devuelve los slappers con el timestamp mas alto. En caso de empate exacto
 * (por ejemplo todos auto-slapeados al expirar) devuelve a todos los empatados.
 */
export function findLastSlappers(slaps: SlapRecord[]): string[] {
  if (slaps.length === 0) return [];
  let maxTs = -Infinity;
  for (const s of slaps) if (s.timestamp > maxTs) maxTs = s.timestamp;
  return slaps.filter((s) => s.timestamp === maxTs).map((s) => s.playerId);
}

/** Devuelve los ids de jugadores que NO estan en la lista provista (set difference). */
export function missingPlayers(
  expected: string[],
  present: string[],
): string[] {
  const presentSet = new Set(present);
  return expected.filter((id) => !presentSet.has(id));
}
