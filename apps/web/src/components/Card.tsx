// Visual de una carta. Para el MVP usamos texto simple con glifos de palo.

import type { Card as CardType } from "@chanchova/shared";

const SUIT_GLYPH: Record<string, string> = {
  oros: "♦",
  copas: "♥",
  espadas: "♠",
  bastos: "♣",
};

const SUIT_COLOR: Record<string, string> = {
  oros: "#d4a017",
  copas: "#c0392b",
  espadas: "#2c3e50",
  bastos: "#27ae60",
};

interface Props {
  card: CardType;
  selected?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
}

export function Card({ card, selected, onClick, faceDown }: Props) {
  if (faceDown) {
    return (
      <div className="card card--back" onClick={onClick}>
        <div className="card-back-pattern">🐷</div>
      </div>
    );
  }
  const color = SUIT_COLOR[card.suit] ?? "#333";
  const glyph = SUIT_GLYPH[card.suit] ?? card.suit;
  return (
    <button
      type="button"
      className={`card ${selected ? "card--selected" : ""}`}
      onClick={onClick}
      style={{ color }}
    >
      <span className="card-value">{card.value}</span>
      <span className="card-suit">{glyph}</span>
    </button>
  );
}
