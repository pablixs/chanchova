// Almacenamiento en memoria de las partidas activas (EngineState por gameId).
//
// Cuando escalemos a multiples instancias se reemplaza esta clase por un
// store compartido (Redis u otro) que respete la misma interfaz.

import { Injectable } from "@nestjs/common";
import type { EngineState } from "@chanchova/engine";

@Injectable()
export class GameStore {
  private readonly games = new Map<string, EngineState>();

  set(gameId: string, state: EngineState): void {
    this.games.set(gameId, state);
  }

  get(gameId: string): EngineState | undefined {
    return this.games.get(gameId);
  }

  delete(gameId: string): void {
    this.games.delete(gameId);
  }
}
