// Orquestador de bots.
//
// Despues de cada accion del motor el GameService nos llama a `evaluate(gameId)`.
// Buscamos cada bot activo, le pedimos al BotStrategy una decision, y si hay
// una accion programada con setTimeout. El timestamp de la accion se reescribe
// al momento del despacho (Date.now()), igual que para humanos.
//
// Cada vez que se vuelve a evaluar cancelamos los timers anteriores: si el
// estado cambio, una decision vieja ya no aplica.
//
// El despacho de la accion lo recibimos via callback inyectable para evitar
// dependencia circular con GameService.

import { Injectable, Logger } from "@nestjs/common";
import type { EngineAction, EngineState } from "@chanchova/engine";

import { GameStore } from "../game-store";
import { BasicBot } from "./basic-bot";
import type { BotStrategy } from "./bot-strategy";

type Dispatcher = (gameId: string, action: EngineAction) => void;

@Injectable()
export class BotOrchestrator {
  private readonly logger = new Logger(BotOrchestrator.name);
  private readonly strategy: BotStrategy = new BasicBot();
  // Timers programados por (gameId, botId).
  private readonly timers = new Map<string, Map<string, NodeJS.Timeout>>();
  private dispatcher?: Dispatcher;

  constructor(private readonly store: GameStore) {}

  /** El GameService inyecta su submitAction al boot. */
  setDispatcher(fn: Dispatcher): void {
    this.dispatcher = fn;
  }

  /** Se invoca despues de cada accion procesada por el motor. */
  evaluate(gameId: string): void {
    this.cancelGame(gameId);
    if (!this.dispatcher) return;
    const state = this.store.get(gameId);
    if (!state || state.status !== "IN_PROGRESS") return;

    for (const player of state.players) {
      if (!player.isBot) continue;
      const decision = this.strategy.decide(state, player);
      if (!decision) continue;
      this.scheduleBot(gameId, player.id, decision.delayMs, () => {
        // Reescribimos el timestamp al despachar.
        const final: EngineAction = {
          ...decision.action,
          timestamp: Date.now(),
        } as EngineAction;
        this.dispatcher!(gameId, final);
      });
    }
  }

  /** Cancela cualquier timer pendiente para una partida. */
  cancelGame(gameId: string): void {
    const perGame = this.timers.get(gameId);
    if (!perGame) return;
    for (const handle of perGame.values()) clearTimeout(handle);
    perGame.clear();
    this.timers.delete(gameId);
  }

  private scheduleBot(
    gameId: string,
    botId: string,
    delayMs: number,
    fn: () => void,
  ): void {
    const handle = setTimeout(() => {
      this.timers.get(gameId)?.delete(botId);
      try {
        fn();
      } catch (err) {
        this.logger.error(
          `bot ${botId} action failed in game ${gameId}: ${(err as Error).message}`,
        );
      }
    }, Math.max(0, delayMs));

    let perGame = this.timers.get(gameId);
    if (!perGame) {
      perGame = new Map();
      this.timers.set(gameId, perGame);
    }
    perGame.set(botId, handle);
  }
}
