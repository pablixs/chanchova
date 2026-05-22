// Posicionamiento de jugadores alrededor de la mesa.
//
// "Yo" siempre estoy en la parte de abajo. Los demas se distribuyen en
// sentido horario empezando por mi izquierda. Esto refleja como nos
// sentariamos en una mesa real.

import type { Player } from "@chanchova/shared";

export type SeatPosition = "bottom" | "left" | "top" | "right" | "top-left" | "top-right";

export interface SeatedPlayer {
  player: Player;
  position: SeatPosition;
}

/**
 * Dado un array de jugadores y mi userId, devuelve una distribucion con
 * posiciones relativas a mi (yo en bottom). Soporta 2, 3 o 4 jugadores.
 */
export function distributeSeats(
  players: Player[],
  myUserId: string,
): SeatedPlayer[] {
  const sorted = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const myIdx = sorted.findIndex((p) => p.id === myUserId);
  const total = sorted.length;
  if (myIdx === -1) return sorted.map((p) => ({ player: p, position: "top" }));

  return sorted.map((p, i) => {
    const offset = (i - myIdx + total) % total;
    return { player: p, position: positionFor(offset, total) };
  });
}

function positionFor(offset: number, total: number): SeatPosition {
  if (offset === 0) return "bottom";
  if (total === 2) return "top";
  if (total === 3) {
    if (offset === 1) return "top-left";
    return "top-right";
  }
  // total === 4
  if (offset === 1) return "left";
  if (offset === 2) return "top";
  return "right";
}
