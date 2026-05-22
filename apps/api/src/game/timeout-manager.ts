// Manager de timers asociados a una partida.
//
// Cuando el motor entra en una fase con vencimiento (CHANCHO_RESOLVING,
// CHANCHA activa, CENTER_GRAB) o se desconecta un jugador (gracia de
// reconexion), el GameService programa aqui un timer que dispara la accion
// correspondiente. Si una accion del cliente resuelve la fase antes (por
// ejemplo todos slappean), el GameService cancela el timer.
//
// La granularidad es por (gameId, key). La key es libre (string) para
// soportar multiples timers concurrentes con identificadores arbitrarios
// (ej: `reconnect:userId`). Cancelar siempre antes de programar uno nuevo
// con la misma key para evitar timers fantasma.

import { Injectable } from "@nestjs/common";

@Injectable()
export class TimeoutManager {
  // gameId -> key -> handle
  private readonly timers = new Map<string, Map<string, NodeJS.Timeout>>();

  schedule(
    gameId: string,
    key: string,
    delayMs: number,
    callback: () => void,
  ): void {
    this.cancel(gameId, key);
    const handle = setTimeout(() => {
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

  cancel(gameId: string, key: string): void {
    const perGame = this.timers.get(gameId);
    if (!perGame) return;
    const handle = perGame.get(key);
    if (handle) {
      clearTimeout(handle);
      perGame.delete(key);
    }
  }

  cancelAll(gameId: string): void {
    const perGame = this.timers.get(gameId);
    if (!perGame) return;
    for (const handle of perGame.values()) clearTimeout(handle);
    perGame.clear();
    this.timers.delete(gameId);
  }
}
