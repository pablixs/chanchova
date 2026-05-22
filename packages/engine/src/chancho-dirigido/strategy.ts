// Implementacion del modo "Chancho Dirigido".
//
// Este modo agrega un director rotativo que cada ronda decide el patron de
// pase de las cartas: cantidad y direccion (LEFT, RIGHT o CENTER). Cuando es
// CENTER se forma un pozo comun y los jugadores agarran del mismo en una
// fase free-for-all.
//
// El reducer `applyAction` es puro: recibe estado + accion + deps y devuelve
// un nuevo estado mas eventos derivados. No hace I/O ni se acuerda de nada
// fuera del estado.

import type {
  Card,
  LetterScore,
  PassDirection,
  Player,
  Round,
} from "@chanchova/shared";
import { GROUP_SIZE, HAND_SIZE } from "@chanchova/shared";

import { buildGameDeck, dealHands, shuffle } from "../deck";
import {
  advanceDirector,
  buildInitialDirectorRotation,
} from "../director";
import { addLetterTo, findGameWinner, hasChancho } from "../scoring";
import type { GameModeStrategy } from "../strategy";
import type {
  ActiveCall,
  ApplyResult,
  CenterPoolEngineState,
  EngineAction,
  EngineDeps,
  EngineEmittedEvent,
  EngineRound,
  EngineState,
  LateralPassQueue,
  PenaltyReason,
  SlapRecord,
} from "../types";

import {
  activePlayers,
  eliminatedIds,
  findLastSlappers,
  findPlayer,
  getLateralNeighbor,
  getScore,
  handContainsAll,
  missingPlayers,
  removeCardsFromHand,
} from "./helpers";

// Helper para construir resultados con error sin tocar el estado.
function fail(state: EngineState, code: string, message: string): ApplyResult {
  return { state, error: { code, message } };
}

// Helper: actualiza el LetterScore de un jugador y devuelve la lista nueva.
function withUpdatedScore(
  scores: LetterScore[],
  playerId: string,
  fn: (s: LetterScore) => LetterScore,
): LetterScore[] {
  return scores.map((s) => (s.playerId === playerId ? fn(s) : s));
}

// Helper: aplica multiples penalizaciones (sumar letra) y devuelve nuevos scores
// junto con eventos de eliminacion.
function applyPenalties(
  scores: LetterScore[],
  penalties: { playerId: string; reason: PenaltyReason }[],
): { scores: LetterScore[]; eliminated: string[] } {
  let updated = scores;
  const eliminated: string[] = [];
  for (const pen of penalties) {
    updated = withUpdatedScore(updated, pen.playerId, (s) => {
      const next = addLetterTo(s);
      if (!s.isEliminated && next.isEliminated) eliminated.push(pen.playerId);
      return next;
    });
  }
  return { scores: updated, eliminated };
}

export class ChanchoDirigidoStrategy implements GameModeStrategy {
  applyAction(
    state: EngineState,
    action: EngineAction,
    deps: EngineDeps,
  ): ApplyResult {
    switch (action.type) {
      case "START_ROUND":
        return this.startRound(state, action.timestamp, deps);
      case "DIRECTOR_INSTRUCTS_PASS":
        return this.directorInstructsPass(state, action);
      case "PLAYER_SELECTS_LATERAL_PASS":
        return this.playerSelectsLateralPass(state, action);
      case "PLAYER_DROPS_TO_CENTER":
        return this.playerDropsToCenter(state, action, deps);
      case "PLAYER_GRABS_FROM_CENTER":
        return this.playerGrabsFromCenter(state, action);
      case "CENTER_TIMEOUT":
        return this.centerTimeout(state, action.timestamp, deps);
      case "PLAYER_CALLS_CHANCHO":
        return this.playerCallsChancho(state, action);
      case "PLAYER_CALLS_CHANCHA":
        return this.playerCallsChancha(state, action);
      case "PLAYER_SLAPS":
        return this.playerSlaps(state, action);
      case "CALL_TIMEOUT":
        return this.callTimeout(state, action.timestamp);
    }
  }

  // ----------------------------------------------------------------------
  // START_ROUND
  // ----------------------------------------------------------------------
  private startRound(
    state: EngineState,
    timestamp: number,
    deps: EngineDeps,
  ): ApplyResult {
    if (state.status === "FINISHED") {
      return fail(state, "GAME_FINISHED", "La partida ya termino.");
    }

    const elim = eliminatedIds(state);
    const active = state.players
      .filter((p) => !elim.has(p.id))
      .sort((a, b) => a.seatIndex - b.seatIndex);

    if (active.length < 2) {
      return fail(
        state,
        "NOT_ENOUGH_PLAYERS",
        "Se necesitan al menos 2 jugadores activos para arrancar.",
      );
    }

    // Rotacion de director: si es la primera ronda, elegir random; sino avanzar.
    let directorRotation = state.directorRotation;
    let currentDirectorIndex = state.currentDirectorIndex;
    if (state.roundIndex < 0 || directorRotation.length === 0) {
      const init = buildInitialDirectorRotation(active, deps.rng);
      directorRotation = init.rotation;
      currentDirectorIndex = init.startIndex;
    } else {
      // Reconstruir rotacion solo con activos (puede haber eliminados nuevos).
      const stillActive = directorRotation.filter((id) => !elim.has(id));
      if (stillActive.length !== directorRotation.length) {
        directorRotation = stillActive;
        currentDirectorIndex = Math.min(
          currentDirectorIndex,
          directorRotation.length - 1,
        );
      }
      currentDirectorIndex = advanceDirector(
        directorRotation,
        currentDirectorIndex,
        elim,
      );
    }
    const directorId = directorRotation[currentDirectorIndex];

    // Construir mazo y repartir manos con la cantidad de jugadores activos.
    const cards = buildGameDeck(state.deck, active.length, deps.rng);
    const hands = dealHands(cards, active, deps.rng);

    const round: EngineRound = {
      index: state.roundIndex + 1,
      mode: "CHANCHO_DIRIGIDO",
      directorId,
      phase: "DIRECTOR_PICKING",
      chanchasUsedBy: [],
    };

    const events: EngineEmittedEvent[] = [
      { type: "ROUND_STARTED", roundIndex: round.index, directorId },
    ];

    return {
      state: {
        ...state,
        status: "IN_PROGRESS",
        hands,
        directorRotation,
        currentDirectorIndex,
        roundIndex: round.index,
        currentRound: round,
      },
      events,
    };
  }

  // ----------------------------------------------------------------------
  // DIRECTOR_INSTRUCTS_PASS
  // ----------------------------------------------------------------------
  private directorInstructsPass(
    state: EngineState,
    action: Extract<EngineAction, { type: "DIRECTOR_INSTRUCTS_PASS" }>,
  ): ApplyResult {
    const round = state.currentRound;
    if (!round || round.phase !== "DIRECTOR_PICKING") {
      return fail(state, "WRONG_PHASE", "El director no puede instruir ahora.");
    }
    if (round.directorId !== action.playerId) {
      return fail(state, "NOT_DIRECTOR", "Solo el director puede instruir.");
    }
    const { count, direction } = action.instruction;
    if (count < 1 || count > HAND_SIZE) {
      return fail(
        state,
        "INVALID_COUNT",
        `Cantidad invalida (${count}). Esperado entre 1 y ${HAND_SIZE}.`,
      );
    }

    const events: EngineEmittedEvent[] = [
      { type: "DIRECTOR_INSTRUCTION", instruction: action.instruction },
    ];

    if (direction === "LEFT" || direction === "RIGHT") {
      const queue: LateralPassQueue = {
        count,
        direction,
        selectionsByPlayer: {},
      };
      return {
        state: {
          ...state,
          currentRound: {
            ...round,
            phase: "PASSING_LATERAL",
            pendingPass: action.instruction,
            passQueue: queue,
          },
        },
        events,
      };
    }

    // direction === "CENTER"
    const pool: CenterPoolEngineState = {
      cards: [],
      expectedDropPerPlayer: count,
      expiresAt: 0,
      grabsByPlayer: {},
    };
    return {
      state: {
        ...state,
        currentRound: {
          ...round,
          phase: "CENTER_DROP",
          pendingPass: action.instruction,
          centerPoolPrivate: pool,
        },
      },
      events,
    };
  }

  // ----------------------------------------------------------------------
  // PLAYER_SELECTS_LATERAL_PASS
  // ----------------------------------------------------------------------
  private playerSelectsLateralPass(
    state: EngineState,
    action: Extract<EngineAction, { type: "PLAYER_SELECTS_LATERAL_PASS" }>,
  ): ApplyResult {
    const round = state.currentRound;
    if (!round || round.phase !== "PASSING_LATERAL" || !round.passQueue) {
      return fail(state, "WRONG_PHASE", "No hay fase de pase lateral activa.");
    }
    const queue = round.passQueue;
    if (action.cardIds.length !== queue.count) {
      return fail(
        state,
        "WRONG_CARD_COUNT",
        `Se esperan ${queue.count} cartas, llegaron ${action.cardIds.length}.`,
      );
    }
    const hand = state.hands[action.playerId];
    if (!hand) {
      return fail(state, "PLAYER_NOT_IN_GAME", "Jugador desconocido.");
    }
    if (queue.selectionsByPlayer[action.playerId]) {
      return fail(state, "ALREADY_SELECTED", "Ya seleccionaste tus cartas.");
    }
    if (!handContainsAll(hand, action.cardIds)) {
      return fail(state, "CARDS_NOT_IN_HAND", "No tenes esas cartas en mano.");
    }

    const selectedCards = action.cardIds
      .map((id) => hand.find((c) => c.id === id))
      .filter((c): c is Card => Boolean(c));

    const newSelections = {
      ...queue.selectionsByPlayer,
      [action.playerId]: selectedCards,
    };

    const active = activePlayers(state);
    const everybodySelected = active.every((p) => newSelections[p.id]);

    if (!everybodySelected) {
      // Solo registrar la seleccion, esperar a los demas.
      return {
        state: {
          ...state,
          currentRound: {
            ...round,
            passQueue: { ...queue, selectionsByPlayer: newSelections },
          },
        },
      };
    }

    // Todos seleccionaron: ejecutar el pase simultaneo.
    return this.executeLateralPass(state, round, queue, newSelections);
  }

  /** Ejecuta el pase: cada jugador recibe las cartas de su vecino. */
  private executeLateralPass(
    state: EngineState,
    round: EngineRound,
    queue: LateralPassQueue,
    selections: Record<string, Card[]>,
  ): ApplyResult {
    const newHands: Record<string, Card[]> = { ...state.hands };
    // Primero remover las cartas seleccionadas de cada mano del que las paso.
    for (const [playerId, cards] of Object.entries(selections)) {
      const hand = newHands[playerId] ?? [];
      const ids = cards.map((c) => c.id);
      const { remaining } = removeCardsFromHand(hand, ids);
      newHands[playerId] = remaining;
    }
    // Despues entregar las cartas a los vecinos correspondientes.
    for (const [playerId, cards] of Object.entries(selections)) {
      const neighbor = getLateralNeighbor(state, playerId, queue.direction);
      if (!neighbor) continue;
      newHands[neighbor.id] = [...(newHands[neighbor.id] ?? []), ...cards];
    }

    const events: EngineEmittedEvent[] = [
      {
        type: "PASS_RESOLVED",
        instruction: { count: queue.count, direction: queue.direction },
      },
    ];

    const nextRound: EngineRound = {
      ...round,
      phase: "DIRECTOR_PICKING",
      pendingPass: undefined,
      passQueue: undefined,
    };
    return {
      state: { ...state, hands: newHands, currentRound: nextRound },
      events,
    };
  }

  // ----------------------------------------------------------------------
  // PLAYER_DROPS_TO_CENTER
  // ----------------------------------------------------------------------
  private playerDropsToCenter(
    state: EngineState,
    action: Extract<EngineAction, { type: "PLAYER_DROPS_TO_CENTER" }>,
    deps: EngineDeps,
  ): ApplyResult {
    const round = state.currentRound;
    if (
      !round ||
      round.phase !== "CENTER_DROP" ||
      !round.centerPoolPrivate
    ) {
      return fail(state, "WRONG_PHASE", "No hay pozo central abierto.");
    }
    const pool = round.centerPoolPrivate;
    if (action.cardIds.length !== pool.expectedDropPerPlayer) {
      return fail(
        state,
        "WRONG_CARD_COUNT",
        `Se esperan ${pool.expectedDropPerPlayer} cartas, llegaron ${action.cardIds.length}.`,
      );
    }
    const hand = state.hands[action.playerId];
    if (!hand) {
      return fail(state, "PLAYER_NOT_IN_GAME", "Jugador desconocido.");
    }
    // Una vez que el jugador soltó, ya no esta en su mano. Detectamos doble drop
    // por un marker: si su mano tiene HAND_SIZE - count restantes ya tiro.
    const expectedRemaining = HAND_SIZE - pool.expectedDropPerPlayer;
    if (hand.length === expectedRemaining) {
      // Ya solto este round (o no tiene esa cantidad).
      return fail(state, "ALREADY_DROPPED", "Ya tiraste tus cartas al pozo.");
    }
    if (!handContainsAll(hand, action.cardIds)) {
      return fail(state, "CARDS_NOT_IN_HAND", "No tenes esas cartas en mano.");
    }

    const { remaining, removed } = removeCardsFromHand(hand, action.cardIds);

    const newHands = { ...state.hands, [action.playerId]: remaining };
    const newPoolCards = [...pool.cards, ...removed];

    const active = activePlayers(state);
    const allDropped = active.every(
      (p) => (newHands[p.id]?.length ?? 0) === expectedRemaining,
    );

    let nextRound: EngineRound;
    const events: EngineEmittedEvent[] = [];
    if (allDropped) {
      // Mezclar el pozo y abrirlo para el grab.
      const shuffled = shuffle([...newPoolCards], deps.rng);
      const expiresAt = action.timestamp + state.config.centerGrabTimeoutMs;
      nextRound = {
        ...round,
        phase: "CENTER_GRAB",
        centerPoolPrivate: {
          cards: shuffled,
          expectedDropPerPlayer: pool.expectedDropPerPlayer,
          expiresAt,
          grabsByPlayer: {},
        },
      };
      events.push({ type: "CENTER_OPENED", cardCount: shuffled.length });
    } else {
      nextRound = {
        ...round,
        centerPoolPrivate: { ...pool, cards: newPoolCards },
      };
    }

    return {
      state: { ...state, hands: newHands, currentRound: nextRound },
      events,
    };
  }

  // ----------------------------------------------------------------------
  // PLAYER_GRABS_FROM_CENTER
  // ----------------------------------------------------------------------
  private playerGrabsFromCenter(
    state: EngineState,
    action: Extract<EngineAction, { type: "PLAYER_GRABS_FROM_CENTER" }>,
  ): ApplyResult {
    const round = state.currentRound;
    if (
      !round ||
      round.phase !== "CENTER_GRAB" ||
      !round.centerPoolPrivate
    ) {
      return fail(state, "WRONG_PHASE", "El pozo central no esta abierto.");
    }
    const pool = round.centerPoolPrivate;
    const hand = state.hands[action.playerId] ?? [];
    if (hand.length >= HAND_SIZE) {
      return fail(state, "HAND_FULL", "Ya tenes la mano completa.");
    }
    const cardIdx = pool.cards.findIndex((c) => c.id === action.cardId);
    if (cardIdx === -1) {
      return fail(state, "CARD_NOT_IN_POOL", "Esa carta no esta en el pozo.");
    }
    const card = pool.cards[cardIdx] as Card;

    const newPool: CenterPoolEngineState = {
      ...pool,
      cards: pool.cards.filter((_, i) => i !== cardIdx),
      grabsByPlayer: {
        ...pool.grabsByPlayer,
        [action.playerId]: (pool.grabsByPlayer[action.playerId] ?? 0) + 1,
      },
    };
    const newHands = { ...state.hands, [action.playerId]: [...hand, card] };

    // Cerrar el pozo si todos los activos llegaron a HAND_SIZE o no quedan cartas.
    const active = activePlayers(state);
    const everyoneFull = active.every(
      (p) => (newHands[p.id]?.length ?? 0) === HAND_SIZE,
    );
    const empty = newPool.cards.length === 0;

    const events: EngineEmittedEvent[] = [];
    let nextRound: EngineRound;
    if (everyoneFull || empty) {
      events.push({ type: "CENTER_CLOSED" });
      nextRound = {
        ...round,
        phase: "DIRECTOR_PICKING",
        centerPoolPrivate: undefined,
        pendingPass: undefined,
      };
    } else {
      nextRound = { ...round, centerPoolPrivate: newPool };
    }

    return {
      state: { ...state, hands: newHands, currentRound: nextRound },
      events,
    };
  }

  // ----------------------------------------------------------------------
  // CENTER_TIMEOUT
  // ----------------------------------------------------------------------
  private centerTimeout(
    state: EngineState,
    timestamp: number,
    deps: EngineDeps,
  ): ApplyResult {
    const round = state.currentRound;
    if (
      !round ||
      round.phase !== "CENTER_GRAB" ||
      !round.centerPoolPrivate
    ) {
      return fail(state, "WRONG_PHASE", "No hay pozo central que vencer.");
    }
    void timestamp;
    const pool = round.centerPoolPrivate;
    // Repartir aleatoriamente las cartas que quedan a los jugadores incompletos.
    const newHands = { ...state.hands };
    const remaining = shuffle([...pool.cards], deps.rng);
    const active = activePlayers(state);
    let i = 0;
    while (remaining.length > 0 && i < active.length * HAND_SIZE) {
      const player = active[i % active.length] as Player;
      const hand = newHands[player.id] ?? [];
      if (hand.length < HAND_SIZE) {
        const card = remaining.shift() as Card;
        newHands[player.id] = [...hand, card];
      }
      i++;
    }
    const events: EngineEmittedEvent[] = [{ type: "CENTER_CLOSED" }];
    return {
      state: {
        ...state,
        hands: newHands,
        currentRound: {
          ...round,
          phase: "DIRECTOR_PICKING",
          centerPoolPrivate: undefined,
          pendingPass: undefined,
        },
      },
      events,
    };
  }

  // ----------------------------------------------------------------------
  // PLAYER_CALLS_CHANCHO
  // ----------------------------------------------------------------------
  private playerCallsChancho(
    state: EngineState,
    action: Extract<EngineAction, { type: "PLAYER_CALLS_CHANCHO" }>,
  ): ApplyResult {
    const round = state.currentRound;
    if (!round || round.phase === "RESOLVED") {
      return fail(state, "WRONG_PHASE", "No hay ronda activa.");
    }
    if (round.activeCall) {
      return fail(state, "CALL_IN_PROGRESS", "Ya hay un llamado activo.");
    }
    if (!findPlayer(state, action.playerId)) {
      return fail(state, "PLAYER_NOT_IN_GAME", "Jugador desconocido.");
    }
    const hand = state.hands[action.playerId] ?? [];
    const valid = hasChancho(hand);

    if (!valid) {
      // Cantar Chancho sin tenerlo: penalidad inmediata, ronda continua.
      const { scores: newScores, eliminated } = applyPenalties(state.scores, [
        { playerId: action.playerId, reason: "INVALID_CHANCHO_CALL" },
      ]);
      const events: EngineEmittedEvent[] = [
        { type: "CHANCHO_CALLED", callerId: action.playerId, valid: false, expiresAt: action.timestamp },
      ];
      for (const id of eliminated) {
        events.push({ type: "PLAYER_ELIMINATED", playerId: id });
      }
      const winner = findGameWinner(newScores);
      let newStatus = state.status;
      if (winner) {
        events.push({ type: "GAME_FINISHED", winnerId: winner });
        newStatus = "FINISHED";
      }
      return {
        state: { ...state, status: newStatus, scores: newScores },
        events,
      };
    }

    // Chancho valido: abrir ventana de slaps, ronda termina cuando se resuelve.
    const expiresAt = action.timestamp + state.config.slapTimeoutMs;
    const activeCall: ActiveCall = {
      type: "CHANCHO",
      callerId: action.playerId,
      callerHadValidChancho: true,
      startedAt: action.timestamp,
      expiresAt,
      slaps: [],
    };
    return {
      state: {
        ...state,
        currentRound: {
          ...round,
          phase: "CHANCHO_RESOLVING",
          activeCall,
        },
      },
      events: [
        { type: "CHANCHO_CALLED", callerId: action.playerId, valid: true, expiresAt },
      ],
    };
  }

  // ----------------------------------------------------------------------
  // PLAYER_CALLS_CHANCHA
  // ----------------------------------------------------------------------
  private playerCallsChancha(
    state: EngineState,
    action: Extract<EngineAction, { type: "PLAYER_CALLS_CHANCHA" }>,
  ): ApplyResult {
    const round = state.currentRound;
    if (!round || round.phase === "RESOLVED") {
      return fail(state, "WRONG_PHASE", "No hay ronda activa.");
    }
    if (round.activeCall) {
      return fail(state, "CALL_IN_PROGRESS", "Ya hay un llamado activo.");
    }
    if (!findPlayer(state, action.playerId)) {
      return fail(state, "PLAYER_NOT_IN_GAME", "Jugador desconocido.");
    }
    if (round.chanchasUsedBy.includes(action.playerId)) {
      return fail(
        state,
        "CHANCHA_ALREADY_USED",
        "Ya usaste tu Chancha en esta ronda.",
      );
    }

    const expiresAt = action.timestamp + state.config.slapTimeoutMs;
    const activeCall: ActiveCall = {
      type: "CHANCHA",
      callerId: action.playerId,
      callerHadValidChancho: false, // no aplica
      startedAt: action.timestamp,
      expiresAt,
      slaps: [],
      resumePhase: round.phase,
    };

    return {
      state: {
        ...state,
        currentRound: {
          ...round,
          activeCall,
          chanchasUsedBy: [...round.chanchasUsedBy, action.playerId],
        },
      },
      events: [{ type: "CHANCHA_CALLED", callerId: action.playerId, expiresAt }],
    };
  }

  // ----------------------------------------------------------------------
  // PLAYER_SLAPS
  // ----------------------------------------------------------------------
  private playerSlaps(
    state: EngineState,
    action: Extract<EngineAction, { type: "PLAYER_SLAPS" }>,
  ): ApplyResult {
    const round = state.currentRound;
    if (!round?.activeCall) {
      return fail(state, "NO_ACTIVE_CALL", "No hay un llamado para apoyar.");
    }
    const call = round.activeCall;
    // El cantante (o quien amago) no compite en los slaps.
    if (call.callerId === action.playerId) {
      return fail(
        state,
        "CALLER_CANT_SLAP",
        "El que canta/amaga no participa de la apoyada.",
      );
    }
    if (call.slaps.find((s) => s.playerId === action.playerId)) {
      return fail(state, "ALREADY_SLAPPED", "Ya apoyaste tu mano.");
    }

    const newSlaps: SlapRecord[] = [
      ...call.slaps,
      { playerId: action.playerId, timestamp: action.timestamp },
    ];

    const events: EngineEmittedEvent[] = [
      { type: "SLAP_REGISTERED", playerId: action.playerId, timestamp: action.timestamp },
    ];

    // Si todos los activos (excepto el cantante) ya apoyaron, podemos resolver
    // la llamada antes del timeout.
    const active = activePlayers(state);
    const expectedSlappers = active
      .filter((p) => p.id !== call.callerId)
      .map((p) => p.id);
    const everybodySlapped = expectedSlappers.every((id) =>
      newSlaps.some((s) => s.playerId === id),
    );

    if (!everybodySlapped) {
      return {
        state: {
          ...state,
          currentRound: {
            ...round,
            activeCall: { ...call, slaps: newSlaps },
          },
        },
        events,
      };
    }

    // Resolver ya, sin esperar timeout. Usar el ultimo timestamp de los slaps.
    const lastTs = Math.max(...newSlaps.map((s) => s.timestamp));
    const resolved = this.resolveActiveCall(
      { ...state, currentRound: { ...round, activeCall: { ...call, slaps: newSlaps } } },
      lastTs,
    );
    return { ...resolved, events: [...events, ...(resolved.events ?? [])] };
  }

  // ----------------------------------------------------------------------
  // CALL_TIMEOUT (vencimiento de la ventana de slap)
  // ----------------------------------------------------------------------
  private callTimeout(state: EngineState, timestamp: number): ApplyResult {
    const round = state.currentRound;
    if (!round?.activeCall) {
      return fail(state, "NO_ACTIVE_CALL", "No hay un llamado por vencer.");
    }
    return this.resolveActiveCall(state, timestamp);
  }

  /**
   * Resuelve el llamado activo (CHANCHO o CHANCHA). Auto-slapea a los faltantes
   * con el timestamp dado, computa penalidades, eliminaciones y ganador.
   */
  private resolveActiveCall(state: EngineState, timestamp: number): ApplyResult {
    const round = state.currentRound;
    if (!round?.activeCall) {
      return fail(state, "NO_ACTIVE_CALL", "No hay llamado para resolver.");
    }
    const call = round.activeCall;

    // Auto-slap a los activos que no apoyaron.
    const active = activePlayers(state);
    const expected = active
      .filter((p) => p.id !== call.callerId)
      .map((p) => p.id);
    const present = call.slaps.map((s) => s.playerId);
    const missing = missingPlayers(expected, present);
    const allSlaps: SlapRecord[] = [
      ...call.slaps,
      ...missing.map((id) => ({ playerId: id, timestamp })),
    ];

    const penalties: { playerId: string; reason: PenaltyReason }[] = [];

    if (call.type === "CHANCHO") {
      // El ultimo en apoyar (mayor timestamp) recibe letra. Empate -> todos.
      const losers = findLastSlappers(allSlaps);
      for (const id of losers) {
        const reason: PenaltyReason = missing.includes(id)
          ? "SLAP_TIMEOUT"
          : "LAST_TO_SLAP";
        penalties.push({ playerId: id, reason });
      }
    } else {
      // CHANCHA: el que cae (apoyo manual antes del timeout) recibe letra.
      // Los que NO apoyaron (auto-slap por timeout) no caen, no suman letra.
      for (const slap of call.slaps) {
        penalties.push({ playerId: slap.playerId, reason: "FELL_FOR_CHANCHA" });
      }
    }

    // Aplicar penalizaciones y actualizar contadores de timeout consecutivo.
    let { scores: newScores, eliminated } = applyPenalties(state.scores, penalties);
    newScores = newScores.map((s) => {
      if (call.type !== "CHANCHO") return s;
      if (missing.includes(s.playerId)) {
        return { ...s, consecutiveSlapTimeouts: s.consecutiveSlapTimeouts + 1 };
      }
      // Slap a tiempo resetea el contador.
      if (present.includes(s.playerId)) {
        return { ...s, consecutiveSlapTimeouts: 0 };
      }
      return s;
    });

    const events: EngineEmittedEvent[] = [];

    if (call.type === "CHANCHO") {
      // Ronda termina.
      events.push({
        type: "ROUND_RESOLVED",
        penalties,
      });
      for (const id of eliminated) {
        events.push({ type: "PLAYER_ELIMINATED", playerId: id });
      }
      const winner = findGameWinner(newScores);
      let newStatus = state.status;
      const newRound: EngineRound = {
        ...round,
        phase: "RESOLVED",
        activeCall: undefined,
      };
      if (winner) {
        events.push({ type: "GAME_FINISHED", winnerId: winner });
        newStatus = "FINISHED";
      }
      return {
        state: {
          ...state,
          status: newStatus,
          scores: newScores,
          currentRound: newRound,
        },
        events,
      };
    }

    // CHANCHA: ronda no termina, volver a la fase previa.
    events.push({ type: "ROUND_RESOLVED", penalties });
    for (const id of eliminated) {
      events.push({ type: "PLAYER_ELIMINATED", playerId: id });
    }
    const winner = findGameWinner(newScores);
    let newStatus = state.status;
    if (winner) {
      events.push({ type: "GAME_FINISHED", winnerId: winner });
      newStatus = "FINISHED";
    }
    const restoredPhase = call.resumePhase ?? "DIRECTOR_PICKING";
    return {
      state: {
        ...state,
        status: newStatus,
        scores: newScores,
        currentRound: {
          ...round,
          phase: restoredPhase,
          activeCall: undefined,
        },
      },
      events,
    };
  }
}

// Re-exports utiles.
export { ChanchoDirigidoStrategy as default };
