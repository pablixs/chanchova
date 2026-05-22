// Logica de puntaje (letras de "CHANCHO") y deteccion de ganador del juego.

import type { Card, LetterScore } from "@chanchova/shared";
import { CHANCHO_LETTERS, GROUP_SIZE } from "@chanchova/shared";

/**
 * Devuelve true si la mano forma un Chancho valido: GROUP_SIZE cartas con el
 * mismo `value`. La regla siempre evalua por valor (los palos solo importan
 * para que cada carta sea unica dentro del mazo).
 */
export function hasChancho(hand: Card[]): boolean {
  if (hand.length !== GROUP_SIZE) return false;
  const first = hand[0];
  if (!first) return false;
  const value = first.value;
  return hand.every((card) => card.value === value);
}

/**
 * Suma una letra al puntaje del jugador. Si al sumarla forma "CHANCHO" queda
 * eliminado. Es funcion pura: devuelve un nuevo LetterScore.
 *
 * Si el jugador ya estaba eliminado se devuelve igual (no acumula mas).
 */
export function addLetterTo(score: LetterScore): LetterScore {
  if (score.isEliminated) return score;
  const nextLength = score.letters.length + 1;
  if (nextLength > CHANCHO_LETTERS.length) return score;
  const newLetters = CHANCHO_LETTERS.slice(0, nextLength);
  return {
    ...score,
    letters: newLetters,
    isEliminated: newLetters === CHANCHO_LETTERS,
  };
}

/**
 * Devuelve el LetterScore inicial para un jugador (sin letras, no eliminado).
 */
export function initialScoreFor(playerId: string): LetterScore {
  return {
    playerId,
    letters: "",
    isEliminated: false,
    consecutiveSlapTimeouts: 0,
  };
}

/**
 * Si solo queda un jugador no eliminado, devuelve su id. Sino undefined.
 */
export function findGameWinner(scores: LetterScore[]): string | undefined {
  const alive = scores.filter((s) => !s.isEliminated);
  if (alive.length === 1) {
    return alive[0]?.playerId;
  }
  return undefined;
}
