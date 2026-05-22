// Patron Strategy para los modos de juego.
//
// Cada modo (Chancho Dirigido, Chancho Va) implementa esta interfaz consumiendo
// EngineAction y devolviendo un nuevo EngineState (reducer puro). El motor es
// la unica fuente de verdad sobre el estado de la partida; el server lo envuelve
// y hace I/O (WebSockets, persistencia).

import type { ApplyResult, EngineAction, EngineDeps, EngineState } from "./types";

export interface GameModeStrategy {
  /**
   * Aplica una accion sobre el estado actual y devuelve el nuevo estado
   * mas eventos derivados. Funcion pura: no muta `state` ni `action`.
   */
  applyAction(
    state: EngineState,
    action: EngineAction,
    deps: EngineDeps,
  ): ApplyResult;
}
