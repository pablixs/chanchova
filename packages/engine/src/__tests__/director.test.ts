import { describe, expect, it } from "vitest";
import type { Player } from "@chanchova/shared";
import {
  activePlayersClockwise,
  advanceDirector,
  buildInitialDirectorRotation,
} from "../director";
import { createSeededRng } from "../rng";

function makePlayers(): Player[] {
  return [
    { id: "a", isBot: false, displayName: "A", seatIndex: 0, status: "CONNECTED" },
    { id: "b", isBot: false, displayName: "B", seatIndex: 1, status: "CONNECTED" },
    { id: "c", isBot: false, displayName: "C", seatIndex: 2, status: "CONNECTED" },
    { id: "d", isBot: false, displayName: "D", seatIndex: 3, status: "CONNECTED" },
  ];
}

describe("activePlayersClockwise", () => {
  it("ordena por seatIndex ascendente", () => {
    const reversed = makePlayers().reverse();
    const ordered = activePlayersClockwise(reversed, new Set());
    expect(ordered.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("excluye jugadores eliminados", () => {
    const ordered = activePlayersClockwise(makePlayers(), new Set(["b"]));
    expect(ordered.map((p) => p.id)).toEqual(["a", "c", "d"]);
  });
});

describe("buildInitialDirectorRotation", () => {
  it("incluye a todos los jugadores en orden clockwise", () => {
    const { rotation } = buildInitialDirectorRotation(
      makePlayers(),
      createSeededRng(1),
    );
    expect(rotation).toEqual(["a", "b", "c", "d"]);
  });

  it("startIndex es deterministico con la misma seed", () => {
    const r1 = buildInitialDirectorRotation(makePlayers(), createSeededRng(7));
    const r2 = buildInitialDirectorRotation(makePlayers(), createSeededRng(7));
    expect(r1.startIndex).toBe(r2.startIndex);
  });
});

describe("advanceDirector", () => {
  const rotation = ["a", "b", "c", "d"];

  it("rota clockwise una posicion sin eliminados", () => {
    expect(advanceDirector(rotation, 0, new Set())).toBe(1);
    expect(advanceDirector(rotation, 3, new Set())).toBe(0);
  });

  it("salta jugadores eliminados", () => {
    // current = a (0). b esta eliminado -> proximo deberia ser c (2).
    expect(advanceDirector(rotation, 0, new Set(["b"]))).toBe(2);
  });

  it("salta varios eliminados consecutivos", () => {
    // current = a (0). b y c eliminados -> proximo es d (3).
    expect(advanceDirector(rotation, 0, new Set(["b", "c"]))).toBe(3);
  });

  it("si todos los demas estan eliminados, avanza al unico jugador restante", () => {
    // current = a, todos los demas eliminados. La rotacion 'avanza' pero
    // termina cayendo en a porque es el unico activo. Devolvemos su indice.
    expect(advanceDirector(rotation, 0, new Set(["b", "c", "d"]))).toBe(0);
  });

  it("si no quedan jugadores activos devuelve -1", () => {
    expect(advanceDirector(rotation, 0, new Set(["a", "b", "c", "d"]))).toBe(-1);
  });
});
