import { beforeEach, describe, expect, it } from "vitest";
import type { Card, DeckMeta, Player } from "@chanchova/shared";
import { CHANCHO_LETTERS, HAND_SIZE } from "@chanchova/shared";

import { ChanchoDirigidoStrategy } from "../chancho-dirigido";
import { createGameSession } from "../factory";
import { createSeededRng } from "../rng";
import type { EngineAction, EngineDeps, EngineState } from "../types";

// ---------------------------------------------------------------------------
// Helpers de setup
// ---------------------------------------------------------------------------

const TEST_DECK: DeckMeta = {
  id: "test_deck",
  name: "Test",
  values: ["1", "2", "3", "4", "5", "6", "7", "10", "11", "12"],
  suits: ["oros", "copas", "espadas", "bastos"],
};

function makePlayers(): Player[] {
  return [
    { id: "a", isBot: false, displayName: "A", seatIndex: 0, status: "CONNECTED" },
    { id: "b", isBot: false, displayName: "B", seatIndex: 1, status: "CONNECTED" },
    { id: "c", isBot: false, displayName: "C", seatIndex: 2, status: "CONNECTED" },
    { id: "d", isBot: false, displayName: "D", seatIndex: 3, status: "CONNECTED" },
  ];
}

function makeCard(value: string, suit: string): Card {
  return { id: `${TEST_DECK.id}:${value}:${suit}`, deckId: TEST_DECK.id, value, suit };
}

/** Sustituye la mano del jugador por exactamente las cartas dadas. */
function withHand(state: EngineState, playerId: string, cards: Card[]): EngineState {
  return { ...state, hands: { ...state.hands, [playerId]: cards } };
}

interface Setup {
  state: EngineState;
  strategy: ChanchoDirigidoStrategy;
  deps: EngineDeps;
  // Helper para encadenar acciones; lanza si una accion devuelve error.
  apply: (action: EngineAction) => EngineState;
}

function setupGame(seed = 1): Setup {
  const players = makePlayers();
  const initial = createGameSession({
    id: "game-1",
    code: "TEST-1",
    mode: "CHANCHO_DIRIGIDO",
    deck: TEST_DECK,
    visibility: "PRIVATE",
    hostId: "a",
    players,
  });
  const strategy = new ChanchoDirigidoStrategy();
  const deps: EngineDeps = { rng: createSeededRng(seed) };

  let current = initial;
  const apply = (action: EngineAction): EngineState => {
    const result = strategy.applyAction(current, action, deps);
    if (result.error) {
      throw new Error(
        `[apply] action ${action.type} fallo: ${result.error.code} - ${result.error.message}`,
      );
    }
    current = result.state;
    return current;
  };
  return { state: initial, strategy, deps, apply };
}

/** Aplica START_ROUND y devuelve el estado resultante junto con el director elegido. */
function startedGame(seed = 1) {
  const ctx = setupGame(seed);
  const after = ctx.apply({ type: "START_ROUND", timestamp: 0 });
  return { ...ctx, state: after };
}

// ---------------------------------------------------------------------------
// START_ROUND
// ---------------------------------------------------------------------------

describe("ChanchoDirigido > START_ROUND", () => {
  it("primera ronda: asigna director, reparte 4 a cada uno, fase DIRECTOR_PICKING", () => {
    const { state } = startedGame();
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.currentRound?.phase).toBe("DIRECTOR_PICKING");
    expect(state.currentRound?.index).toBe(0);
    expect(state.currentRound?.directorId).toBeDefined();
    for (const p of state.players) {
      expect(state.hands[p.id]).toHaveLength(HAND_SIZE);
    }
  });

  it("rota el director clockwise en rondas siguientes", () => {
    const ctx = setupGame(7);
    const r0 = ctx.apply({ type: "START_ROUND", timestamp: 0 });
    const dir0 = r0.currentRound?.directorId as string;

    // Forzar llegar a RESOLVED simulando un Chancho valido del director.
    const handChancho = [
      makeCard("7", "oros"),
      makeCard("7", "copas"),
      makeCard("7", "espadas"),
      makeCard("7", "bastos"),
    ];
    const withChancho = withHand(r0, dir0, handChancho);
    // Re-asignar al ctx interno via apply de la siguiente accion no es trivial,
    // asi que aplicamos las acciones manualmente sobre el estado modificado.
    const strategy = ctx.strategy;
    const deps = ctx.deps;
    const callRes = strategy.applyAction(
      withChancho,
      { type: "PLAYER_CALLS_CHANCHO", playerId: dir0, timestamp: 100 },
      deps,
    );
    expect(callRes.error).toBeUndefined();
    const after = strategy.applyAction(
      callRes.state,
      { type: "CALL_TIMEOUT", timestamp: 5000 },
      deps,
    );
    expect(after.state.currentRound?.phase).toBe("RESOLVED");

    const r1 = strategy.applyAction(
      after.state,
      { type: "START_ROUND", timestamp: 6000 },
      deps,
    );
    const dir1 = r1.state.currentRound?.directorId as string;
    expect(dir1).not.toBe(dir0);
    // Debe ser el siguiente clockwise por seatIndex.
    const seatById: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };
    expect(seatById[dir1]).toBe((seatById[dir0]! + 1) % 4);
  });

  it("falla si quedan menos de 2 jugadores activos", () => {
    const players: Player[] = [
      { id: "solo", isBot: false, displayName: "Solo", seatIndex: 0, status: "CONNECTED" },
    ];
    const state = createGameSession({
      id: "g",
      code: "X",
      mode: "CHANCHO_DIRIGIDO",
      deck: TEST_DECK,
      visibility: "PRIVATE",
      hostId: "solo",
      players,
    });
    const strategy = new ChanchoDirigidoStrategy();
    const result = strategy.applyAction(
      state,
      { type: "START_ROUND", timestamp: 0 },
      { rng: createSeededRng(1) },
    );
    expect(result.error?.code).toBe("NOT_ENOUGH_PLAYERS");
  });
});

// ---------------------------------------------------------------------------
// DIRECTOR_INSTRUCTS_PASS
// ---------------------------------------------------------------------------

describe("ChanchoDirigido > DIRECTOR_INSTRUCTS_PASS", () => {
  it("LEFT 1: pasa a PASSING_LATERAL", () => {
    const { state, strategy, deps } = startedGame();
    const dir = state.currentRound!.directorId!;
    const r = strategy.applyAction(
      state,
      {
        type: "DIRECTOR_INSTRUCTS_PASS",
        playerId: dir,
        instruction: { count: 1, direction: "LEFT" },
        timestamp: 100,
      },
      deps,
    );
    expect(r.error).toBeUndefined();
    expect(r.state.currentRound?.phase).toBe("PASSING_LATERAL");
    expect(r.state.currentRound?.passQueue?.count).toBe(1);
  });

  it("CENTER 2: pasa a CENTER_DROP con pool vacio", () => {
    const { state, strategy, deps } = startedGame();
    const dir = state.currentRound!.directorId!;
    const r = strategy.applyAction(
      state,
      {
        type: "DIRECTOR_INSTRUCTS_PASS",
        playerId: dir,
        instruction: { count: 2, direction: "CENTER" },
        timestamp: 100,
      },
      deps,
    );
    expect(r.state.currentRound?.phase).toBe("CENTER_DROP");
    expect(r.state.currentRound?.centerPoolPrivate?.expectedDropPerPlayer).toBe(2);
  });

  it("rechaza si la accion la manda alguien que no es el director", () => {
    const { state, strategy, deps } = startedGame();
    const dir = state.currentRound!.directorId!;
    const notDir = ["a", "b", "c", "d"].find((id) => id !== dir)!;
    const r = strategy.applyAction(
      state,
      {
        type: "DIRECTOR_INSTRUCTS_PASS",
        playerId: notDir,
        instruction: { count: 1, direction: "LEFT" },
        timestamp: 100,
      },
      deps,
    );
    expect(r.error?.code).toBe("NOT_DIRECTOR");
  });

  it("rechaza count fuera de rango (0 o > HAND_SIZE)", () => {
    const { state, strategy, deps } = startedGame();
    const dir = state.currentRound!.directorId!;
    for (const count of [0, 5]) {
      const r = strategy.applyAction(
        state,
        {
          type: "DIRECTOR_INSTRUCTS_PASS",
          playerId: dir,
          instruction: { count, direction: "LEFT" },
          timestamp: 100,
        },
        deps,
      );
      expect(r.error?.code).toBe("INVALID_COUNT");
    }
  });
});

// ---------------------------------------------------------------------------
// Lateral pass completo
// ---------------------------------------------------------------------------

describe("ChanchoDirigido > pase lateral completo", () => {
  it("LEFT 1: cada jugador transfiere 1 carta al de la izquierda y vuelve a DIRECTOR_PICKING", () => {
    const { state, apply } = startedGame();
    const dir = state.currentRound!.directorId!;
    // Snapshot de manos previas al pase.
    const handsBefore: Record<string, Card[]> = JSON.parse(
      JSON.stringify(state.hands),
    );

    apply({
      type: "DIRECTOR_INSTRUCTS_PASS",
      playerId: dir,
      instruction: { count: 1, direction: "LEFT" },
      timestamp: 100,
    });

    // Cada jugador elige la primera carta de su mano.
    const order = ["a", "b", "c", "d"];
    let after: EngineState;
    for (const id of order) {
      after = apply({
        type: "PLAYER_SELECTS_LATERAL_PASS",
        playerId: id,
        cardIds: [handsBefore[id]![0]!.id],
        timestamp: 200,
      });
    }
    after = after!;
    expect(after.currentRound?.phase).toBe("DIRECTOR_PICKING");
    // La carta de A llego a B (su izquierda en seatIndex creciente).
    const aFirstCardId = handsBefore["a"]![0]!.id;
    expect(after.hands["b"]!.find((c) => c.id === aFirstCardId)).toBeDefined();
    // La de D fue al jugador A (wraparound).
    const dFirstCardId = handsBefore["d"]![0]!.id;
    expect(after.hands["a"]!.find((c) => c.id === dFirstCardId)).toBeDefined();
    // Cada uno sigue con HAND_SIZE.
    for (const id of order) expect(after.hands[id]).toHaveLength(HAND_SIZE);
  });

  it("rechaza cantidad de cartas distinta a la pedida", () => {
    const { state, apply } = startedGame();
    const dir = state.currentRound!.directorId!;
    apply({
      type: "DIRECTOR_INSTRUCTS_PASS",
      playerId: dir,
      instruction: { count: 2, direction: "LEFT" },
      timestamp: 100,
    });
    const handA = state.hands["a"]!;
    expect(() =>
      apply({
        type: "PLAYER_SELECTS_LATERAL_PASS",
        playerId: "a",
        cardIds: [handA[0]!.id],
        timestamp: 200,
      }),
    ).toThrow(/WRONG_CARD_COUNT/);
  });
});

// ---------------------------------------------------------------------------
// Pozo central completo
// ---------------------------------------------------------------------------

describe("ChanchoDirigido > pozo central completo", () => {
  it("CENTER 2: todos tiran 2, se abre el pool, y agarrando vuelve a HAND_SIZE", () => {
    const { state, apply } = startedGame(42);
    const dir = state.currentRound!.directorId!;
    apply({
      type: "DIRECTOR_INSTRUCTS_PASS",
      playerId: dir,
      instruction: { count: 2, direction: "CENTER" },
      timestamp: 100,
    });

    const handsBefore = state.hands;
    let after: EngineState;
    for (const id of ["a", "b", "c", "d"]) {
      after = apply({
        type: "PLAYER_DROPS_TO_CENTER",
        playerId: id,
        cardIds: handsBefore[id]!.slice(0, 2).map((c) => c.id),
        timestamp: 200,
      });
    }
    after = after!;
    expect(after.currentRound?.phase).toBe("CENTER_GRAB");
    expect(after.currentRound?.centerPoolPrivate?.cards).toHaveLength(8);
    for (const id of ["a", "b", "c", "d"]) {
      expect(after.hands[id]).toHaveLength(HAND_SIZE - 2);
    }

    // Cada uno agarra 2 cartas (sin saber que cartas son, agarramos las del pool por id).
    let cursor = after;
    for (let i = 0; i < 8; i++) {
      const next = cursor.currentRound!.centerPoolPrivate!.cards[0]!;
      const grabber = ["a", "b", "c", "d"][i % 4]!;
      cursor = apply({
        type: "PLAYER_GRABS_FROM_CENTER",
        playerId: grabber,
        cardId: next.id,
        timestamp: 300 + i,
      });
    }
    expect(cursor.currentRound?.phase).toBe("DIRECTOR_PICKING");
    for (const id of ["a", "b", "c", "d"]) {
      expect(cursor.hands[id]).toHaveLength(HAND_SIZE);
    }
  });

  it("CENTER_TIMEOUT: reparte cartas restantes a quienes les faltan", () => {
    const { state, apply, strategy, deps } = startedGame(42);
    const dir = state.currentRound!.directorId!;
    apply({
      type: "DIRECTOR_INSTRUCTS_PASS",
      playerId: dir,
      instruction: { count: 2, direction: "CENTER" },
      timestamp: 100,
    });
    const handsBefore = state.hands;
    let after: EngineState;
    for (const id of ["a", "b", "c", "d"]) {
      after = apply({
        type: "PLAYER_DROPS_TO_CENTER",
        playerId: id,
        cardIds: handsBefore[id]!.slice(0, 2).map((c) => c.id),
        timestamp: 200,
      });
    }
    after = after!;
    // Pool tiene 8 cartas. Disparar timeout sin grabbear.
    const r = strategy.applyAction(
      after,
      { type: "CENTER_TIMEOUT", timestamp: 999999 },
      deps,
    );
    expect(r.state.currentRound?.phase).toBe("DIRECTOR_PICKING");
    for (const id of ["a", "b", "c", "d"]) {
      expect(r.state.hands[id]).toHaveLength(HAND_SIZE);
    }
  });
});

// ---------------------------------------------------------------------------
// CHANCHO valido
// ---------------------------------------------------------------------------

describe("ChanchoDirigido > Chancho valido", () => {
  it("abre ventana de slaps con fase CHANCHO_RESOLVING", () => {
    const { state, strategy, deps } = startedGame();
    const handChancho = [
      makeCard("7", "oros"),
      makeCard("7", "copas"),
      makeCard("7", "espadas"),
      makeCard("7", "bastos"),
    ];
    const stateMod = withHand(state, "a", handChancho);
    const r = strategy.applyAction(
      stateMod,
      { type: "PLAYER_CALLS_CHANCHO", playerId: "a", timestamp: 1000 },
      deps,
    );
    expect(r.error).toBeUndefined();
    expect(r.state.currentRound?.phase).toBe("CHANCHO_RESOLVING");
    expect(r.state.currentRound?.activeCall?.type).toBe("CHANCHO");
    expect(r.state.currentRound?.activeCall?.callerId).toBe("a");
    expect(r.events?.[0]).toMatchObject({ type: "CHANCHO_CALLED", valid: true });
  });

  it("el ultimo en apoyar (mayor timestamp) recibe letra", () => {
    const { state, strategy, deps } = startedGame();
    const handChancho = [
      makeCard("7", "oros"),
      makeCard("7", "copas"),
      makeCard("7", "espadas"),
      makeCard("7", "bastos"),
    ];
    let s = strategy.applyAction(
      withHand(state, "a", handChancho),
      { type: "PLAYER_CALLS_CHANCHO", playerId: "a", timestamp: 1000 },
      deps,
    ).state;
    s = strategy.applyAction(
      s,
      { type: "PLAYER_SLAPS", playerId: "b", timestamp: 1100 },
      deps,
    ).state;
    s = strategy.applyAction(
      s,
      { type: "PLAYER_SLAPS", playerId: "c", timestamp: 1150 },
      deps,
    ).state;
    // d llega ultimo
    const last = strategy.applyAction(
      s,
      { type: "PLAYER_SLAPS", playerId: "d", timestamp: 1200 },
      deps,
    );
    s = last.state;
    expect(s.currentRound?.phase).toBe("RESOLVED");
    expect(s.scores.find((x) => x.playerId === "d")?.letters).toBe("C");
    expect(s.scores.find((x) => x.playerId === "b")?.letters).toBe("");
    expect(s.scores.find((x) => x.playerId === "c")?.letters).toBe("");
  });

  it("CALL_TIMEOUT auto-slapea a los faltantes y todos los empatados al final reciben letra", () => {
    const { state, strategy, deps } = startedGame();
    const handChancho = [
      makeCard("7", "oros"),
      makeCard("7", "copas"),
      makeCard("7", "espadas"),
      makeCard("7", "bastos"),
    ];
    let s = strategy.applyAction(
      withHand(state, "a", handChancho),
      { type: "PLAYER_CALLS_CHANCHO", playerId: "a", timestamp: 1000 },
      deps,
    ).state;
    s = strategy.applyAction(
      s,
      { type: "PLAYER_SLAPS", playerId: "b", timestamp: 1100 },
      deps,
    ).state;
    // c y d nunca apoyan, llega timeout en t=4000.
    const r = strategy.applyAction(
      s,
      { type: "CALL_TIMEOUT", timestamp: 4000 },
      deps,
    );
    expect(r.state.currentRound?.phase).toBe("RESOLVED");
    // c y d empataron al final -> ambos suman letra.
    expect(r.state.scores.find((x) => x.playerId === "c")?.letters).toBe("C");
    expect(r.state.scores.find((x) => x.playerId === "d")?.letters).toBe("C");
    expect(r.state.scores.find((x) => x.playerId === "b")?.letters).toBe("");
    // a (cantante) tampoco suma.
    expect(r.state.scores.find((x) => x.playerId === "a")?.letters).toBe("");
    // c y d son timeouts consecutivos = 1 cada uno.
    expect(r.state.scores.find((x) => x.playerId === "c")?.consecutiveSlapTimeouts).toBe(1);
    expect(r.state.scores.find((x) => x.playerId === "d")?.consecutiveSlapTimeouts).toBe(1);
    // b reseteo su contador (slap a tiempo).
    expect(r.state.scores.find((x) => x.playerId === "b")?.consecutiveSlapTimeouts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CHANCHO invalido
// ---------------------------------------------------------------------------

describe("ChanchoDirigido > Chancho invalido", () => {
  it("cantar Chancho sin tenerlo da letra al cantante y NO cambia fase", () => {
    const { state, strategy, deps } = startedGame();
    // Forzamos una mano sin 4 iguales.
    const messy = [
      makeCard("1", "oros"),
      makeCard("2", "copas"),
      makeCard("3", "espadas"),
      makeCard("4", "bastos"),
    ];
    const s0 = withHand(state, "a", messy);
    const r = strategy.applyAction(
      s0,
      { type: "PLAYER_CALLS_CHANCHO", playerId: "a", timestamp: 1000 },
      deps,
    );
    expect(r.error).toBeUndefined();
    expect(r.state.currentRound?.phase).toBe("DIRECTOR_PICKING");
    expect(r.state.scores.find((x) => x.playerId === "a")?.letters).toBe("C");
    expect(r.events?.[0]).toMatchObject({ type: "CHANCHO_CALLED", valid: false });
  });

  it("acumula hasta CHANCHO completo y elimina al jugador", () => {
    const { state, strategy, deps } = startedGame();
    const messy = [
      makeCard("1", "oros"),
      makeCard("2", "copas"),
      makeCard("3", "espadas"),
      makeCard("4", "bastos"),
    ];
    let s = withHand(state, "a", messy);
    // 7 invalid calls -> 7 letras -> CHANCHO -> eliminado.
    for (let i = 0; i < CHANCHO_LETTERS.length; i++) {
      const r = strategy.applyAction(
        s,
        { type: "PLAYER_CALLS_CHANCHO", playerId: "a", timestamp: 1000 + i },
        deps,
      );
      s = r.state;
    }
    const score = s.scores.find((x) => x.playerId === "a");
    expect(score?.letters).toBe(CHANCHO_LETTERS);
    expect(score?.isEliminated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CHANCHA (amague)
// ---------------------------------------------------------------------------

describe("ChanchoDirigido > Chancha", () => {
  it("abre ventana de amague sin terminar la ronda; los que slappean caen", () => {
    const { state, strategy, deps } = startedGame();
    let s = strategy.applyAction(
      state,
      { type: "PLAYER_CALLS_CHANCHA", playerId: "a", timestamp: 1000 },
      deps,
    ).state;
    expect(s.currentRound?.activeCall?.type).toBe("CHANCHA");
    // b cae en el amague.
    s = strategy.applyAction(
      s,
      { type: "PLAYER_SLAPS", playerId: "b", timestamp: 1100 },
      deps,
    ).state;
    // c y d aguantan; llega el timeout.
    const r = strategy.applyAction(
      s,
      { type: "CALL_TIMEOUT", timestamp: 4000 },
      deps,
    );
    expect(r.state.currentRound?.phase).toBe("DIRECTOR_PICKING");
    expect(r.state.currentRound?.activeCall).toBeUndefined();
    // Solo b (que apoyo) suma letra.
    expect(r.state.scores.find((x) => x.playerId === "b")?.letters).toBe("C");
    expect(r.state.scores.find((x) => x.playerId === "c")?.letters).toBe("");
    expect(r.state.scores.find((x) => x.playerId === "d")?.letters).toBe("");
    expect(r.state.scores.find((x) => x.playerId === "a")?.letters).toBe("");
  });

  it("rechaza una segunda Chancha del mismo jugador en la misma ronda", () => {
    const { state, strategy, deps } = startedGame();
    let s = strategy.applyAction(
      state,
      { type: "PLAYER_CALLS_CHANCHA", playerId: "a", timestamp: 1000 },
      deps,
    ).state;
    s = strategy.applyAction(
      s,
      { type: "CALL_TIMEOUT", timestamp: 4000 },
      deps,
    ).state;
    const r = strategy.applyAction(
      s,
      { type: "PLAYER_CALLS_CHANCHA", playerId: "a", timestamp: 5000 },
      deps,
    );
    expect(r.error?.code).toBe("CHANCHA_ALREADY_USED");
  });

  it("permite a otro jugador amagar mientras nadie haya cantado", () => {
    const { state, strategy, deps } = startedGame();
    let s = strategy.applyAction(
      state,
      { type: "PLAYER_CALLS_CHANCHA", playerId: "a", timestamp: 1000 },
      deps,
    ).state;
    s = strategy.applyAction(
      s,
      { type: "CALL_TIMEOUT", timestamp: 4000 },
      deps,
    ).state;
    const r = strategy.applyAction(
      s,
      { type: "PLAYER_CALLS_CHANCHA", playerId: "b", timestamp: 5000 },
      deps,
    );
    expect(r.error).toBeUndefined();
    expect(r.state.currentRound?.activeCall?.callerId).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// Fin de partida
// ---------------------------------------------------------------------------

describe("ChanchoDirigido > fin de partida", () => {
  it("cuando solo queda un jugador no eliminado, status = FINISHED y emite GAME_FINISHED", () => {
    const { state, strategy, deps } = startedGame();
    // Forzar a 'b', 'c', 'd' con 6 letras cada uno (a una sola de eliminarse).
    const sPre: EngineState = {
      ...state,
      scores: state.scores.map((s) =>
        s.playerId === "a"
          ? s
          : { ...s, letters: CHANCHO_LETTERS.slice(0, 6) },
      ),
    };
    // a canta Chancho valido. Como nadie de los rivales slappea -> auto-slap a todos
    // -> los tres empatan al final del timestamp -> suman letra -> CHANCHO -> eliminados.
    const handChancho = [
      makeCard("7", "oros"),
      makeCard("7", "copas"),
      makeCard("7", "espadas"),
      makeCard("7", "bastos"),
    ];
    const sWithHand = withHand(sPre, "a", handChancho);
    let s = strategy.applyAction(
      sWithHand,
      { type: "PLAYER_CALLS_CHANCHO", playerId: "a", timestamp: 1000 },
      deps,
    ).state;
    const r = strategy.applyAction(
      s,
      { type: "CALL_TIMEOUT", timestamp: 5000 },
      deps,
    );
    expect(r.state.status).toBe("FINISHED");
    const eliminations = r.events?.filter((e) => e.type === "PLAYER_ELIMINATED");
    expect(eliminations?.length).toBe(3);
    const finished = r.events?.find((e) => e.type === "GAME_FINISHED");
    expect(finished).toMatchObject({ type: "GAME_FINISHED", winnerId: "a" });
  });
});
