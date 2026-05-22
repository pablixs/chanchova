// Asiento de un jugador alrededor de la mesa.
// Muestra avatar (con corona si es director), nombre, letras y un stack
// de cartas-back que representa cuantas cartas tiene en la mano.

import type { LetterScore, Player } from "@chanchova/shared";
import { CHANCHO_LETTERS, HAND_SIZE } from "@chanchova/shared";

import type { SeatPosition } from "../lib/seating";

interface Props {
  player: Player;
  position: SeatPosition;
  score?: LetterScore;
  isDirector: boolean;
  /** Cuantas cartas tiene en mano (para el stack visual). */
  handSize?: number;
}

export function PlayerSeat({
  player,
  position,
  score,
  isDirector,
  handSize = HAND_SIZE,
}: Props) {
  const initial = player.displayName.charAt(0).toUpperCase();
  const elim = score?.isEliminated ?? false;
  const letters = score?.letters ?? "";
  const lettersFull = letters.length === CHANCHO_LETTERS.length;
  const disconnected = player.status === "DISCONNECTED";

  return (
    <div className={`seat seat--${position} ${elim ? "seat--elim" : ""}`}>
      <div
        className={`seat__avatar ${player.isBot ? "seat__avatar--bot" : ""} ${
          isDirector ? "seat__avatar--director" : ""
        }`}
      >
        {isDirector && <span className="seat__crown">👑</span>}
        {player.isBot ? "🤖" : initial}
      </div>
      <div className="seat__name">{player.displayName}</div>
      <div className={`seat__letters ${lettersFull ? "seat__letters--full" : ""}`}>
        {letters || "—"}
      </div>
      {disconnected && <div className="seat__status">📡 desc.</div>}
      {!elim && handSize > 0 && (
        <div className="seat__hand-back">
          {Array.from({ length: Math.min(handSize, HAND_SIZE) }).map((_, i) => (
            <div className="mini-card" key={i}>
              🐷
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
