// Registro central de mazos. En el futuro se agregarán más entradas.

import type { DeckMeta } from "@chanchova/shared";
import { spanishDeck } from "./spanish";

const DECKS: Record<string, DeckMeta> = {
  [spanishDeck.id]: spanishDeck,
};

export function getDeck(id: string): DeckMeta | undefined {
  return DECKS[id];
}

export function listDecks(): DeckMeta[] {
  return Object.values(DECKS);
}
