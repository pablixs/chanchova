// Eleccion y rotacion del director del Chancho Dirigido.
//
// Reglas:
// - El primer director se elige al azar entre los jugadores activos.
// - Las rondas siguientes rotan en sentido horario (por seatIndex creciente).
// - Si un jugador es eliminado, queda fuera de la rotacion.

import type { Player } from "@chanchova/shared";
import type { Rng } from "./rng";

/** Devuelve los jugadores activos ordenados por seatIndex (clockwise). */
export function activePlayersClockwise(
  players: Player[],
  eliminatedIds: Set<string>,
): Player[] {
  return players
    .filter((p) => !eliminatedIds.has(p.id))
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

/** Construye la rotacion inicial: empieza por un director random y sigue clockwise. */
export function buildInitialDirectorRotation(
  players: Player[],
  rng: Rng,
): { rotation: string[]; startIndex: number } {
  const ordered = activePlayersClockwise(players, new Set());
  if (ordered.length === 0) {
    return { rotation: [], startIndex: 0 };
  }
  const startIndex = Math.floor(rng() * ordered.length);
  return { rotation: ordered.map((p) => p.id), startIndex };
}

/**
 * Avanza al siguiente director en la rotacion. Salta jugadores eliminados.
 * Devuelve el nuevo indice. Si no quedan jugadores activos devuelve -1.
 */
export function advanceDirector(
  rotation: string[],
  currentIndex: number,
  eliminatedIds: Set<string>,
): number {
  if (rotation.length === 0) return -1;
  const total = rotation.length;
  for (let step = 1; step <= total; step++) {
    const next = (currentIndex + step) % total;
    const candidate = rotation[next];
    if (candidate && !eliminatedIds.has(candidate)) {
      return next;
    }
  }
  return -1;
}
