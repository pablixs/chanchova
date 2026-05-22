import { describe, expect, it } from "vitest";
import type { Card, LetterScore } from "@chanchova/shared";
import { CHANCHO_LETTERS } from "@chanchova/shared";
import {
  addLetterTo,
  findGameWinner,
  hasChancho,
  initialScoreFor,
} from "../scoring";

function card(value: string, suit: string): Card {
  return { id: `t:${value}:${suit}`, deckId: "t", value, suit };
}

describe("hasChancho", () => {
  it("4 cartas mismo valor con palos distintos -> true", () => {
    const hand = [
      card("7", "oros"),
      card("7", "copas"),
      card("7", "espadas"),
      card("7", "bastos"),
    ];
    expect(hasChancho(hand)).toBe(true);
  });

  it("4 cartas con valores mezclados -> false", () => {
    const hand = [
      card("7", "oros"),
      card("7", "copas"),
      card("3", "espadas"),
      card("7", "bastos"),
    ];
    expect(hasChancho(hand)).toBe(false);
  });

  it("mano con menos de 4 cartas -> false", () => {
    expect(hasChancho([card("1", "oros"), card("1", "copas")])).toBe(false);
  });

  it("mano vacia -> false", () => {
    expect(hasChancho([])).toBe(false);
  });
});

describe("addLetterTo / initialScoreFor", () => {
  it("estado inicial: sin letras, no eliminado", () => {
    const s = initialScoreFor("p1");
    expect(s.letters).toBe("");
    expect(s.isEliminated).toBe(false);
  });

  it("acumula letras una por una sin eliminar al jugador", () => {
    let score = initialScoreFor("p1");
    const expected = ["C", "CH", "CHA", "CHAN", "CHANC", "CHANCH"];
    for (const exp of expected) {
      score = addLetterTo(score);
      expect(score.letters).toBe(exp);
      expect(score.isEliminated).toBe(false);
    }
  });

  it("al completar 'CHANCHO' el jugador queda eliminado", () => {
    let score = initialScoreFor("p1");
    for (let i = 0; i < CHANCHO_LETTERS.length; i++) {
      score = addLetterTo(score);
    }
    expect(score.letters).toBe(CHANCHO_LETTERS);
    expect(score.isEliminated).toBe(true);
  });

  it("una vez eliminado, no acumula mas letras", () => {
    let score = initialScoreFor("p1");
    for (let i = 0; i < CHANCHO_LETTERS.length; i++) {
      score = addLetterTo(score);
    }
    const before = score;
    const after = addLetterTo(score);
    expect(after).toBe(before);
  });
});

describe("findGameWinner", () => {
  function s(playerId: string, eliminated: boolean): LetterScore {
    return {
      playerId,
      letters: eliminated ? CHANCHO_LETTERS : "",
      isEliminated: eliminated,
      consecutiveSlapTimeouts: 0,
    };
  }

  it("varios activos -> sin ganador todavia", () => {
    expect(findGameWinner([s("a", false), s("b", false)])).toBeUndefined();
  });

  it("un solo activo -> ese es el ganador", () => {
    expect(findGameWinner([s("a", false), s("b", true), s("c", true)])).toBe(
      "a",
    );
  });

  it("todos eliminados -> sin ganador", () => {
    expect(findGameWinner([s("a", true), s("b", true)])).toBeUndefined();
  });
});
