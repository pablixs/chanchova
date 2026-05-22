// Interfaz para distintas "personalidades" de bot.
//
// Un BotStrategy decide, dado el estado actual y un jugador-bot, cual es la
// proxima accion (si corresponde) y con cuanto delay sintetico despacharla.
// Esto permite tener basicos hoy y agregar bots agresivos / amagueros / etc.
// en el futuro sin cambiar el orchestrator.

import type { EngineAction, EngineState } from "@chanchova/engine";
import type { Player } from "@chanchova/shared";

export interface BotDecision {
  action: EngineAction;
  /** Delay (ms) antes de despachar la accion. Imitamos tiempo de reaccion. */
  delayMs: number;
}

export interface BotStrategy {
  /** Identificador de la personalidad (basic, aggressive, etc.). */
  readonly id: string;

  /**
   * Decide que hacer dado el estado y el bot. Devuelve null si no le
   * corresponde actuar ahora.
   */
  decide(state: EngineState, bot: Player): BotDecision | null;
}
