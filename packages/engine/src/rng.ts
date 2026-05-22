// Generador de numeros pseudo-aleatorios deterministico.
//
// Usamos el algoritmo "mulberry32": rapido, sin dependencias y reproducible
// dado un seed. El motor recibe un `Rng` inyectable para que los tests puedan
// fijar la semilla y obtener resultados reproducibles.

export type Rng = () => number;

/** Crea un RNG seedeable. Mismo seed -> misma secuencia de numeros. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG basado en Math.random (NO determinista). Util para produccion. */
export const defaultRng: Rng = Math.random;
