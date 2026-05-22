// Construccion del mazo de partida y reparto inicial.
//
// Reglas del Chancho:
// - Antes de jugar, se eligen N valores del mazo (donde N = cantidad de
//   jugadores) y se toman los 4 palos de cada uno.
// - Para 4 jugadores, eso da 4 grupos de 4 = 16 cartas en juego.
// - Las cartas se mezclan y se reparten 4 por jugador.

import type { Card, DeckMeta, Player } from "@chanchova/shared";
import { HAND_SIZE } from "@chanchova/shared";
import type { Rng } from "./rng";

/** Mezcla in-place usando Fisher-Yates con el RNG provisto. Devuelve el mismo array. */
export function shuffle<T>(array: T[], rng: Rng): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i] as T;
    array[i] = array[j] as T;
    array[j] = tmp;
  }
  return array;
}

/**
 * Construye el conjunto de cartas que entran en juego segun la cantidad de
 * jugadores y el mazo elegido. Toma `numPlayers` valores al azar y arma 4
 * cartas (una por palo) por cada valor.
 *
 * Lanza error si el mazo no tiene suficientes valores o si la cantidad de
 * palos no coincide con el tamanio de grupo (4).
 */
export function buildGameDeck(
  deck: DeckMeta,
  numPlayers: number,
  rng: Rng,
): Card[] {
  if (deck.suits.length !== HAND_SIZE) {
    throw new Error(
      `Mazo invalido: se esperan ${HAND_SIZE} palos, el mazo tiene ${deck.suits.length}`,
    );
  }
  if (deck.values.length < numPlayers) {
    throw new Error(
      `Mazo insuficiente: ${deck.values.length} valores para ${numPlayers} jugadores`,
    );
  }

  const valuesPool = [...deck.values];
  shuffle(valuesPool, rng);
  const chosenValues = valuesPool.slice(0, numPlayers);

  const cards: Card[] = [];
  for (const value of chosenValues) {
    for (const suit of deck.suits) {
      cards.push({
        id: `${deck.id}:${value}:${suit}`,
        deckId: deck.id,
        value,
        suit,
      });
    }
  }
  return cards;
}

/**
 * Reparte HAND_SIZE cartas a cada jugador a partir del mazo de partida ya
 * construido. Mezcla las cartas antes de repartir. Devuelve un map playerId -> cartas.
 *
 * Asume `cards.length === players.length * HAND_SIZE` (chequeado con error si no).
 */
export function dealHands(
  cards: Card[],
  players: Player[],
  rng: Rng,
): Record<string, Card[]> {
  const expected = players.length * HAND_SIZE;
  if (cards.length !== expected) {
    throw new Error(
      `Cantidad de cartas no coincide: ${cards.length} vs ${expected} esperadas`,
    );
  }
  const pool = shuffle([...cards], rng);
  const hands: Record<string, Card[]> = {};
  for (let i = 0; i < players.length; i++) {
    const player = players[i] as Player;
    hands[player.id] = pool.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE);
  }
  return hands;
}
