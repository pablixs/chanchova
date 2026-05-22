// Simulador interactivo del motor Chancho Dirigido.
//
// Corre un escenario scripteado mostrando paso a paso cada accion, el estado
// resultante y los eventos emitidos. Sirve para verificar a ojo el flujo del
// motor antes de envolverlo con WebSockets.
//
// Como ejecutar: `pnpm sim` desde la raiz del monorepo.

import { spanishDeck } from "@chanchova/decks";
import type { Card, Player } from "@chanchova/shared";

import { ChanchoDirigidoStrategy } from "../chancho-dirigido";
import { createGameSession } from "../factory";
import { createSeededRng } from "../rng";
import type {
  EngineAction,
  EngineDeps,
  EngineEmittedEvent,
  EngineState,
} from "../types";

// ---------------------------------------------------------------------------
// Pretty printers
// ---------------------------------------------------------------------------

const SUIT_GLYPH: Record<string, string> = {
  oros: "♦",
  copas: "♥",
  espadas: "♠",
  bastos: "♣",
};

const fmtCard = (c: Card): string =>
  `${c.value}${SUIT_GLYPH[c.suit] ?? c.suit}`;

const fmtHand = (cards: Card[]): string =>
  cards.length === 0 ? "(vacía)" : cards.map(fmtCard).join(" ");

const fmtScores = (state: EngineState): string =>
  state.scores
    .map(
      (s) =>
        `${s.playerId.padEnd(5)}=${(s.letters || "-").padEnd(7)}${
          s.isEliminated ? "✗" : " "
        }`,
    )
    .join("  ");

function header(title: string): void {
  console.log("\n" + "═".repeat(72));
  console.log(`  ${title}`);
  console.log("═".repeat(72));
}

function step(msg: string): void {
  console.log(`\n→ ${msg}`);
}

function showPhase(state: EngineState): void {
  const r = state.currentRound;
  if (!r) {
    console.log(`  [STATUS=${state.status}, sin ronda]`);
    return;
  }
  console.log(
    `  [Ronda ${r.index} | fase=${r.phase} | director=${r.directorId ?? "-"}]`,
  );
}

function showHands(state: EngineState): void {
  console.log("  Manos:");
  for (const p of state.players) {
    const hand = state.hands[p.id] ?? [];
    console.log(`    ${p.displayName.padEnd(6)}: ${fmtHand(hand)}`);
  }
}

function showScores(state: EngineState): void {
  console.log(`  Puntaje:  ${fmtScores(state)}`);
}

function fmtEvent(e: EngineEmittedEvent): string {
  switch (e.type) {
    case "ROUND_STARTED":
      return `ROUND_STARTED (round=${e.roundIndex}, director=${e.directorId})`;
    case "DIRECTOR_INSTRUCTION":
      return `DIRECTOR_INSTRUCTION (${e.instruction.count} ${e.instruction.direction})`;
    case "PASS_RESOLVED":
      return `PASS_RESOLVED (${e.instruction.count} ${e.instruction.direction})`;
    case "CENTER_OPENED":
      return `CENTER_OPENED (${e.cardCount} cartas en pozo)`;
    case "CENTER_CLOSED":
      return `CENTER_CLOSED`;
    case "CHANCHO_CALLED":
      return `CHANCHO_CALLED (caller=${e.callerId}, valido=${e.valid})`;
    case "CHANCHA_CALLED":
      return `CHANCHA_CALLED (caller=${e.callerId})`;
    case "SLAP_REGISTERED":
      return `SLAP_REGISTERED (${e.playerId} @ ${e.timestamp})`;
    case "ROUND_RESOLVED": {
      const pen =
        e.penalties.length === 0
          ? "ninguna"
          : e.penalties.map((p) => `${p.playerId}:${p.reason}`).join(", ");
      return `ROUND_RESOLVED (penalidades: ${pen})`;
    }
    case "PLAYER_ELIMINATED":
      return `PLAYER_ELIMINATED (${e.playerId})`;
    case "GAME_FINISHED":
      return `GAME_FINISHED (winner=${e.winnerId})`;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const players: Player[] = [
  { id: "Ana", isBot: false, displayName: "Ana", seatIndex: 0, status: "CONNECTED" },
  { id: "Beto", isBot: false, displayName: "Beto", seatIndex: 1, status: "CONNECTED" },
  { id: "Caro", isBot: false, displayName: "Caro", seatIndex: 2, status: "CONNECTED" },
  { id: "Diego", isBot: false, displayName: "Diego", seatIndex: 3, status: "CONNECTED" },
];

const strategy = new ChanchoDirigidoStrategy();
const deps: EngineDeps = { rng: createSeededRng(2025) };

let state = createGameSession({
  id: "sim-1",
  code: "SIMULATION",
  mode: "CHANCHO_DIRIGIDO",
  deck: spanishDeck,
  visibility: "PRIVATE",
  hostId: "Ana",
  players,
});

function apply(action: EngineAction, label?: string): boolean {
  if (label) step(label);
  const result = strategy.applyAction(state, action, deps);
  if (result.error) {
    console.log(`  ✗ ERROR: ${result.error.code} — ${result.error.message}`);
    return false;
  }
  state = result.state;
  if (result.events?.length) {
    for (const e of result.events) console.log(`    · ${fmtEvent(e)}`);
  }
  showPhase(state);
  return true;
}

// ---------------------------------------------------------------------------
// Escenario
// ---------------------------------------------------------------------------

header("CHANCHOVA — Simulación del Chancho Dirigido");
console.log(`  Jugadores: ${players.map((p) => p.displayName).join(", ")}`);
console.log(`  Mazo:      ${spanishDeck.name}`);
console.log(`  Seed:      2025 (deterministico)`);

// ===========================================================================
// PARTE 1: Pase lateral
// ===========================================================================

header("PARTE 1 — Arranque y pase lateral");
apply({ type: "START_ROUND", timestamp: 0 }, "Comienza la partida (START_ROUND)");
showHands(state);
showScores(state);

const dir1 = state.currentRound!.directorId!;
apply(
  {
    type: "DIRECTOR_INSTRUCTS_PASS",
    playerId: dir1,
    instruction: { count: 1, direction: "LEFT" },
    timestamp: 100,
  },
  `${dir1} (director) dicta: 1 carta a la IZQUIERDA`,
);

step("Cada jugador selecciona la primera carta de su mano para pasar");
for (const p of players) {
  const first = state.hands[p.id]?.[0];
  if (!first) continue;
  console.log(`  ${p.displayName} elige pasar: ${fmtCard(first)}`);
  apply({
    type: "PLAYER_SELECTS_LATERAL_PASS",
    playerId: p.id,
    cardIds: [first.id],
    timestamp: 200,
  });
}
console.log("\n  --- después del pase ---");
showHands(state);

// ===========================================================================
// PARTE 2: Pozo central
// ===========================================================================

header("PARTE 2 — Pozo central");
apply(
  {
    type: "DIRECTOR_INSTRUCTS_PASS",
    playerId: dir1,
    instruction: { count: 2, direction: "CENTER" },
    timestamp: 300,
  },
  `${dir1} dicta: 2 al CENTRO`,
);

step("Cada jugador tira sus 2 primeras cartas al pozo (boca abajo)");
for (const p of players) {
  const cards = state.hands[p.id]?.slice(0, 2) ?? [];
  console.log(`  ${p.displayName} tira: ${cards.map(fmtCard).join(" ")}`);
  apply({
    type: "PLAYER_DROPS_TO_CENTER",
    playerId: p.id,
    cardIds: cards.map((c) => c.id),
    timestamp: 400,
  });
}

const poolSize = state.currentRound?.centerPoolPrivate?.cards.length ?? 0;
step(`Pool abierto con ${poolSize} cartas — todos a agarrar`);

// Free-for-all simulado: nos turnamos en orden hasta que todos llenen mano.
let i = 0;
const maxIters = 50;
while (state.currentRound?.phase === "CENTER_GRAB" && i < maxIters) {
  const grabber = players[i % players.length]!;
  i++;
  const handLen = state.hands[grabber.id]?.length ?? 0;
  if (handLen >= 4) continue;
  const next = state.currentRound.centerPoolPrivate?.cards[0];
  if (!next) break;
  console.log(`  ${grabber.displayName} agarra una carta del pozo`);
  apply({
    type: "PLAYER_GRABS_FROM_CENTER",
    playerId: grabber.id,
    cardId: next.id,
    timestamp: 500 + i,
  });
}
console.log("\n  --- después del pozo ---");
showHands(state);

// ===========================================================================
// PARTE 3: Chancho válido (forzamos la mano para mostrar el flujo)
// ===========================================================================

header("PARTE 3 — ¡CHANCHO! (ronda termina)");
step("Forzamos a Ana a tener 4 sietes (para mostrar el flujo del slap)");
const fakeChanchoHand: Card[] = [
  { id: "spanish_classic:7:oros", deckId: "spanish_classic", value: "7", suit: "oros" },
  { id: "spanish_classic:7:copas", deckId: "spanish_classic", value: "7", suit: "copas" },
  { id: "spanish_classic:7:espadas", deckId: "spanish_classic", value: "7", suit: "espadas" },
  { id: "spanish_classic:7:bastos", deckId: "spanish_classic", value: "7", suit: "bastos" },
];
state = { ...state, hands: { ...state.hands, Ana: fakeChanchoHand } };
console.log(`  Ana ahora: ${fmtHand(fakeChanchoHand)}`);

apply(
  { type: "PLAYER_CALLS_CHANCHO", playerId: "Ana", timestamp: 1000 },
  "Ana grita: ¡CHANCHOOOO!",
);

step("Beto reacciona muy rápido y apoya");
apply({ type: "PLAYER_SLAPS", playerId: "Beto", timestamp: 1050 });

step("Caro reacciona después");
apply({ type: "PLAYER_SLAPS", playerId: "Caro", timestamp: 1150 });

step("Diego es el último en reaccionar (auto-resolución al completarse los slaps)");
apply({ type: "PLAYER_SLAPS", playerId: "Diego", timestamp: 1300 });

console.log();
showScores(state);

// ===========================================================================
// PARTE 4: Nueva ronda + Chancha (amague)
// ===========================================================================

header("PARTE 4 — Nueva ronda y CHANCHA (amague)");
apply({ type: "START_ROUND", timestamp: 2000 }, "Comienza la ronda 1 (rotó el director)");
showHands(state);

apply(
  { type: "PLAYER_CALLS_CHANCHA", playerId: "Beto", timestamp: 2100 },
  "Beto amaga: ¡CHAN-...! (no tiene chancho real)",
);

step("Caro cae en el amague y apoya por error");
apply({ type: "PLAYER_SLAPS", playerId: "Caro", timestamp: 2150 });

step("Ana y Diego aguantan, llega el timeout (se cierra la chancha)");
apply({ type: "CALL_TIMEOUT", timestamp: 2400 });

console.log();
showScores(state);

// ===========================================================================
// PARTE 5: Chancho inválido (cantar sin tener)
// ===========================================================================

header("PARTE 5 — CHANCHO inválido (mentira → letra inmediata)");
step("Diego canta Chancho sin tener las 4 cartas iguales");
apply({ type: "PLAYER_CALLS_CHANCHO", playerId: "Diego", timestamp: 3000 });

console.log();
showScores(state);

// ===========================================================================
// PARTE 6: Chancha repetida en la misma ronda (debe rechazarse)
// ===========================================================================

header("PARTE 6 — Reglas: 1 chancha por jugador por ronda");
step("Beto intenta amagar de nuevo en la misma ronda (debe rechazarse)");
apply({ type: "PLAYER_CALLS_CHANCHA", playerId: "Beto", timestamp: 3500 });

step("Caro intenta amagar (es su primera vez en esta ronda, debería poder)");
apply({ type: "PLAYER_CALLS_CHANCHA", playerId: "Caro", timestamp: 3600 });

step("Cerramos esa chancha sin que nadie caiga (timeout)");
apply({ type: "CALL_TIMEOUT", timestamp: 3900 });

// ===========================================================================
// FINAL
// ===========================================================================

header("RESUMEN FINAL");
console.log(`  Status:        ${state.status}`);
console.log(
  `  Ronda actual:  ${state.currentRound?.index ?? "-"} (fase=${state.currentRound?.phase ?? "-"})`,
);
showScores(state);
console.log();
