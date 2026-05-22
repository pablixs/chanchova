// Manager de timers asociados a una partida.
//
// Cuando el motor entra en una fase con vencimiento (CHANCHO_RESOLVING,
// CHANCHA activa, CENTER_GRAB) el GameService programa aqui un timer que
// dispara la accion de timeout correspondiente. Si una accion del cliente
// resuelve la fase antes (por ejemplo todos slappean), el GameService cancela
// el timer.
//
// La granularidad es por (gameId, key). Cancelar siempre antes de programar
// uno nuevo de la misma key para evitar timers fantasma.

import { Injectable } from "@nestjs/common";

type TimerKey = "slap" | "center";

@Injectable()
export class TimeoutManager {
  // gameId -> key -> handle
  private readonly timers = new Map<string, Map<TimerKey, NodeJS.Timeout>>();

  /** Programa (o reemplaza) un timer asociado a (gameId, key). */
  schedule(
    gameId: string,
    key: TimerKey,
    delayMs: number,
    callback: () => void,
  ): void {
    this.cancel(gameId, key);
    const handle = setTimeout(() => {
      // Quitar de la tabla antes de invocar para evitar refs colgadas.
      this.timers.get(gameId)?.delete(key);
      callback();
    }, Math.max(0, delayMs));
    let perGame = this.timers.get(gameId);
    if (!perGame) {
      perGame = new Map();
      this.timers.set(gameId, perGame);
    }
    perGame.set(key, handle);
  }

  cancel(gameId: string, key: TimerKey): void {
    const perGame = this.timers.get(gameId);
    if (!perGame) return;
    const handle = perGame.get(key);
    if (handle) {
      clearTimeout(handle);
      perGame.delete(key);
    }
  }

  /** Cancela todos los timers de una partida (al terminar o cleanup). */
  cancelAll(gameId: string): void {
    const perGame = this.timers.get(gameId);
    if (!perGame) return;
    for (const handle of perGame.values()) clearTimeout(handle);
    perGame.clear();
    this.timers.delete(gameId);
  }
}
