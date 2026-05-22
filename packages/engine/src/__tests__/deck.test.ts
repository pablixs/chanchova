import { describe, expect, it } from "vitest";
import type { DeckMeta, Player } from "@chanchova/shared";
import { HAND_SIZE } from "@chanchova/shared";
import { buildGameDeck, dealHands, shuffle } from "../deck";
import { createSeededRng } from "../rng";

const spanishLike: DeckMeta = {
  id: "test_deck",
  name: "Test",
  values: ["1", "2", "3", "4", "5", "6", "7", "10", "11", "12"],
  suits: ["oros", "copas", "espadas", "bastos"],
};

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    isBot: false,
    displayName: `P${i + 1}`,
    seatIndex: i,
    status: "CONNECTED",
  }));
}

describe("shuffle", () => {
  it("preserva todos los elementos", () => {
    const rng = createSeededRng(7);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle([...arr], rng);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it("es deterministico con la misma seed", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], createSeededRng(99));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], createSeededRng(99));
    expect(a).toEqual(b);
  });
});

describe("buildGameDeck", () => {
  it("para N jugadores produce N grupos de 4 (N*4 cartas)", () => {
    for (const n of [2, 3, 4]) {
      const cards = buildGameDeck(spanishLike, n, createSeededRng(1));
      expect(cards).toHaveLength(n * HAND_SIZE);
    }
  });

  it("cada grupo de 4 tiene los 4 palos", () => {
    const cards = buildGameDeck(spanishLike, 4, createSeededRng(2));
    const byValue: Record<string, Set<string>> = {};
    for (const c of cards) {
      byValue[c.value] ??= new Set();
      byValue[c.value]!.add(c.suit);
    }
    for (const [value, suits] of Object.entries(byValue)) {
      expect(suits.size, `valor ${value} deberia tener 4 palos`).toBe(4);
    }
  });

  it("todas las cartas son unicas (ids distintos)", () => {
    const cards = buildGameDeck(spanishLike, 4, createSeededRng(3));
    const ids = new Set(cards.map((c) => c.id));
    expect(ids.size).toBe(cards.length);
  });

  it("distintas seeds suelen elegir distintos valores", () => {
    const a = buildGameDeck(spanishLike, 3, createSeededRng(1));
    const b = buildGameDeck(spanishLike, 3, createSeededRng(99));
    const valuesA = new Set(a.map((c) => c.value));
    const valuesB = new Set(b.map((c) => c.value));
    // No es estrictamente garantizable pero con seeds tan distintas suele diferir.
    expect(valuesA).not.toEqual(valuesB);
  });

  it("falla si el mazo no tiene exactamente 4 palos", () => {
    expect(() =>
      buildGameDeck(
        { ...spanishLike, suits: ["a", "b", "c"] },
        2,
        createSeededRng(1),
      ),
    ).toThrow();
  });

  it("falla si pide mas valores de los disponibles", () => {
    expect(() =>
      buildGameDeck(
        { ...spanishLike, values: ["1", "2"] },
        4,
        createSeededRng(1),
      ),
    ).toThrow();
  });
});

describe("dealHands", () => {
  it("reparte HAND_SIZE cartas a cada jugador", () => {
    const players = makePlayers(4);
    const cards = buildGameDeck(spanishLike, 4, createSeededRng(5));
    const hands = dealHands(cards, players, createSeededRng(5));
    for (const player of players) {
      expect(hands[player.id]).toHaveLength(HAND_SIZE);
    }
  });

  it("la union de todas las manos es el mazo completo (sin duplicados)", () => {
    const players = makePlayers(3);
    const cards = buildGameDeck(spanishLike, 3, createSeededRng(8));
    const hands = dealHands(cards, players, createSeededRng(8));
    const allDealt = Object.values(hands).flat();
    expect(allDealt).toHaveLength(cards.length);
    const ids = new Set(allDealt.map((c) => c.id));
    expect(ids.size).toBe(cards.length);
  });

  it("falla si la cantidad de cartas no coincide con jugadores * HAND_SIZE", () => {
    const players = makePlayers(4);
    const cards = buildGameDeck(spanishLike, 3, createSeededRng(1));
    expect(() => dealHands(cards, players, createSeededRng(1))).toThrow();
  });
});
