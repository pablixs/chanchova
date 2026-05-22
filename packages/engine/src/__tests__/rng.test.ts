import { describe, expect, it } from "vitest";
import { createSeededRng } from "../rng";

describe("createSeededRng", () => {
  it("misma seed produce la misma secuencia", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("seeds distintas producen secuencias distintas", () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a()).not.toBe(b());
  });

  it("siempre devuelve un numero en [0, 1)", () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 100; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});
