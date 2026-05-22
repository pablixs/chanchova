// Renderiza la mano del usuario actual con cartas seleccionables.

import type { Card as CardType } from "@chanchova/shared";
import { Card } from "./Card";

interface Props {
  cards: CardType[];
  selectedIds: Set<string>;
  onToggle: (cardId: string) => void;
}

export function Hand({ cards, selectedIds, onToggle }: Props) {
  if (cards.length === 0) {
    return <div className="hand hand--empty">(sin cartas)</div>;
  }
  return (
    <div className="hand">
      {cards.map((c) => (
        <Card
          key={c.id}
          card={c}
          selected={selectedIds.has(c.id)}
          onClick={() => onToggle(c.id)}
        />
      ))}
    </div>
  );
}
