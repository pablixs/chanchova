// Carta visual estilo casino: esquina con valor + palo y centro grande.

import type { Card as CardType } from "@chanchova/shared";

const SUIT_GLYPH: Record<string, string> = {
  oros: "♦",
  copas: "♥",
  espadas: "♠",
  bastos: "♣",
};

const SUIT_COLOR: Record<string, string> = {
  oros: "#d49b05",
  copas: "#c0392b",
  espadas: "#1c2c4a",
  bastos: "#1f8b4c",
};

interface Props {
  card: CardType;
  selected?: boolean;
  onClick?: () => void;
}

export function Card({ card, selected, onClick }: Props) {
  const color = SUIT_COLOR[card.suit] ?? "#333";
  const glyph = SUIT_GLYPH[card.suit] ?? card.suit;
  return (
    <button
      type="button"
      className={`big-card ${selected ? "big-card--selected" : ""}`}
      onClick={onClick}
      style={{ color }}
    >
      <span className="big-card__top">
        <span>{card.value}</span>
        <span>{glyph}</span>
      </span>
      <span className="big-card__center">{glyph}</span>
      <span className="big-card__bottom">
        <span>{card.value}</span>
        <span>{glyph}</span>
      </span>
    </button>
  );
}
