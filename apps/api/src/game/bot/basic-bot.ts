// Bot basico: juega correctamente sin estrategia avanzada.
//
// Prioridad de acciones (de mayor a menor):
//   1. Si tiene Chancho real, lo canta (con delay).
//   2. Si hay activeCall (alguien canto Chancho/Chancha), apoya con delay.
//   3. Si es el director y la fase es DIRECTOR_PICKING, dicta una instruccion.
//   4. Si la fase es PASSING_LATERAL y no selecciono, selecciona N cartas.
//   5. Si la fase es CENTER_DROP y no tiro, tira N cartas al pozo.
//   6. Si la fase es CENTER_GRAB y le faltan cartas, agarra una del pozo.
//
// Reglas del basic bot (por simplicidad y "honesto"):
//   - Nunca canta Chancho invalido.
//   - Cae en Chancha la mitad de las veces (configurable).
//   - Nunca canta Chancha el mismo (no amaga).

import { hasChancho, type EngineAction, type EngineState } from "@chanchova/engine";
import { HAND_SIZE } from "@chanchova/shared";
import type { Player } from "@chanchova/shared";

import type { BotDecision, BotStrategy } from "./bot-strategy";

const REACTION_MIN_MS = 250;
const REACTION_MAX_MS = 1200;

function randomDelay(min = REACTION_MIN_MS, max = REACTION_MAX_MS): number {
  return Math.floor(min + Math.random() * (max - min));
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

function pickN<T>(items: T[], n: number): T[] {
  const copy = [...items];
  const picked: T[] = [];
  while (picked.length < n && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0] as T);
  }
  return picked;
}

export class BasicBot implements BotStrategy {
  readonly id = "basic";
  private readonly chanchaFallProbability: number;

  constructor(opts?: { chanchaFallProbability?: number }) {
    this.chanchaFallProbability = opts?.chanchaFallProbability ?? 0.5;
  }

  decide(state: EngineState, bot: Player): BotDecision | null {
    const round = state.currentRound;
    if (!round) return null;
    const score = state.scores.find((s) => s.playerId === bot.id);
    if (score?.isEliminated) return null;

    const hand = state.hands[bot.id] ?? [];

    // 1) Tengo Chancho? Lo canto.
    if (!round.activeCall && hasChancho(hand)) {
      return {
        action: { type: "PLAYER_CALLS_CHANCHO", playerId: bot.id, timestamp: 0 },
        delayMs: randomDelay(400, 1500),
      };
    }

    // 2) Hay activeCall? Decidir si apoyar.
    if (round.activeCall) {
      // El cantante no apoya.
      if (round.activeCall.callerId === bot.id) return null;
      // Ya apoyo en esta llamada -> nada.
      const alreadySlapped = round.activeCall.slaps.some((s) => s.playerId === bot.id);
      if (alreadySlapped) return null;

      if (round.activeCall.type === "CHANCHO") {
        // Siempre apoyar lo mas rapido posible (entre 200-1000ms).
        return {
          action: { type: "PLAYER_SLAPS", playerId: bot.id, timestamp: 0 },
          delayMs: randomDelay(200, 1000),
        };
      }
      // CHANCHA: solo cae con probabilidad chanchaFallProbability.
      if (Math.random() < this.chanchaFallProbability) {
        return {
          action: { type: "PLAYER_SLAPS", playerId: bot.id, timestamp: 0 },
          delayMs: randomDelay(150, 700),
        };
      }
      return null; // aguanta el amague
    }

    // 3) Director en DIRECTOR_PICKING.
    if (round.phase === "DIRECTOR_PICKING" && round.directorId === bot.id) {
      const count = 1 + Math.floor(Math.random() * Math.min(2, HAND_SIZE)); // 1 o 2
      const directions: Array<"LEFT" | "RIGHT" | "CENTER"> = [
        "LEFT",
        "LEFT",
        "RIGHT",
        "RIGHT",
        "CENTER",
      ];
      const direction = pickRandom(directions) ?? "LEFT";
      return {
        action: {
          type: "DIRECTOR_INSTRUCTS_PASS",
          playerId: bot.id,
          instruction: { count, direction },
          timestamp: 0,
        },
        delayMs: randomDelay(800, 2000),
      };
    }

    // 4) PASSING_LATERAL: seleccionar cartas si no lo hizo.
    if (round.phase === "PASSING_LATERAL" && round.passQueue) {
      const already = round.passQueue.selectionsByPlayer[bot.id];
      if (!already && hand.length > 0) {
        const cardIds = pickN(hand, round.passQueue.count).map((c) => c.id);
        return {
          action: {
            type: "PLAYER_SELECTS_LATERAL_PASS",
            playerId: bot.id,
            cardIds,
            timestamp: 0,
          },
          delayMs: randomDelay(),
        };
      }
    }

    // 5) CENTER_DROP: tirar al pozo si no lo hizo.
    if (round.phase === "CENTER_DROP" && round.centerPoolPrivate) {
      const expectedRemaining = HAND_SIZE - round.centerPoolPrivate.expectedDropPerPlayer;
      if (hand.length > expectedRemaining) {
        const cardIds = pickN(hand, round.centerPoolPrivate.expectedDropPerPlayer).map(
          (c) => c.id,
        );
        return {
          action: {
            type: "PLAYER_DROPS_TO_CENTER",
            playerId: bot.id,
            cardIds,
            timestamp: 0,
          },
          delayMs: randomDelay(),
        };
      }
    }

    // 6) CENTER_GRAB: agarrar si me faltan.
    if (round.phase === "CENTER_GRAB" && round.centerPoolPrivate) {
      if (hand.length < HAND_SIZE && round.centerPoolPrivate.cards.length > 0) {
        const card = pickRandom(round.centerPoolPrivate.cards);
        if (card) {
          return {
            action: {
              type: "PLAYER_GRABS_FROM_CENTER",
              playerId: bot.id,
              cardId: card.id,
              timestamp: 0,
            },
            // Mas rapido en el grab para crear sensacion de urgencia.
            delayMs: randomDelay(100, 500),
          };
        }
      }
    }

    return null;
  }
}
