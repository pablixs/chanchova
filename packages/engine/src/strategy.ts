// Patrón Strategy para los modos de juego.
// Cada modo (Chancho Dirigido, Chancho Va) implementará esta interfaz.
// La implementación concreta llega en la Fase 1.

import type { GameSession } from "@chanchova/shared";

export interface GameAction {
  type: string;
  playerId: string;
  payload?: unknown;
  timestamp: number;
}

export interface GameModeStrategy {
  /** Inicializa una nueva ronda dentro de la sesión */
  startRound(session: GameSession): GameSession;

  /** Aplica una acción y devuelve el nuevo estado */
  applyAction(session: GameSession, action: GameAction): GameSession;

  /** Determina si la ronda actual terminó */
  shouldEndRound(session: GameSession): boolean;
}
