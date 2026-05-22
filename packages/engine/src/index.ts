// Punto de entrada publico del motor de juego.
//
// El motor es codigo TypeScript puro: sin red, sin DB, sin UI. Recibe acciones
// y devuelve un nuevo estado. Lo consume el server para arbitrar partidas y se
// puede usar tambien para simular partidas en tests o jugar contra bots.

export * from "./strategy";
export * from "./types";
export * from "./rng";
export * from "./deck";
export * from "./scoring";
export * from "./director";
export * from "./factory";
export * from "./chancho-dirigido";
