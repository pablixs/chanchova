// Mazo español tradicional (40 cartas).
// Valores: 1..7, 10..12 (sota=10, caballo=11, rey=12). 4 palos.

import type { DeckMeta } from "@chanchova/shared";

export const SPANISH_DECK_ID = "spanish_classic";

export const spanishDeck: DeckMeta = {
  id: SPANISH_DECK_ID,
  name: "Naipes españoles",
  values: ["1", "2", "3", "4", "5", "6", "7", "10", "11", "12"],
  suits: ["oros", "copas", "espadas", "bastos"],
};
