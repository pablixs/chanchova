// Mesa de juego.
//
// Renderiza el estado actual y muestra los controles segun la fase y rol del
// jugador. Los componentes auxiliares (Hand, PlayerStrip, Card) viven en
// `../components`. La logica de seleccion de cartas para pasar/dropear vive
// localmente en este componente: el resto solo despacha acciones al server.

import { useEffect, useMemo, useState } from "react";

import type { CenterPoolState, Round } from "@chanchova/shared";
import { HAND_SIZE } from "@chanchova/shared";

import { Card } from "../components/Card";
import { Hand } from "../components/Hand";
import { PlayerStrip } from "../components/PlayerStrip";
import { useApp } from "../state/AppContext";

export function GamePage() {
  const {
    user,
    game,
    myHand,
    flash,
    error,
    directorPass,
    passCards,
    dropToCenter,
    grabFromCenter,
    callChancho,
    callChancha,
    slap,
  } = useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Cuando cambia la fase, limpiamos la seleccion (cartas viejas pueden no estar).
  useEffect(() => {
    setSelected(new Set());
  }, [game?.currentRound?.phase, game?.currentRound?.index]);

  if (!user || !game) return <p>Cargando partida...</p>;
  const round = game.currentRound;
  const isDirector = round?.directorId === user.userId;
  const myScore = game.scores.find((s) => s.playerId === user.userId);
  const iAmEliminated = myScore?.isEliminated ?? false;

  const toggleSelected = (cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  return (
    <div className="screen game-screen">
      <header className="screen-header">
        <h1>🐷 Mesa {game.code}</h1>
        <span className="round-info">
          Ronda {round?.index ?? "-"} · {round?.phase ?? game.status}
        </span>
      </header>

      <PlayerStrip game={game} myUserId={user.userId} />

      {flash && <div className="flash">{flash}</div>}

      <section className="table-center">
        {round && <CenterArea round={round} onGrab={grabFromCenter} />}
      </section>

      <section className="my-area">
        <div className="my-info">
          <strong>{user.displayName}</strong>
          {iAmEliminated && <span className="eliminated"> ✗ ELIMINADO</span>}
          <span className="my-letters"> letras: {myScore?.letters || "—"}</span>
        </div>
        <Hand cards={myHand} selectedIds={selected} onToggle={toggleSelected} />
      </section>

      <section className="action-bar">
        {round && !iAmEliminated && (
          <ActionPanel
            round={round}
            isDirector={isDirector}
            selected={selected}
            handSize={myHand.length}
            onDirectorPass={directorPass}
            onPass={() => passCards([...selected])}
            onDrop={() => dropToCenter([...selected])}
          />
        )}
        {round && !iAmEliminated && (
          <CallPanel
            round={round}
            myUserId={user.userId}
            onChancho={callChancho}
            onChancha={callChancha}
            onSlap={slap}
          />
        )}
      </section>

      {error && <p className="error">{error.message}</p>}

      {game.status === "FINISHED" && (
        <div className="game-finished">
          <h2>🏆 Partida terminada</h2>
          <p>Ganador: {game.scores.find((s) => !s.isEliminated)?.playerId ?? "?"}</p>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Centro de la mesa
// -------------------------------------------------------------------------
function CenterArea({
  round,
  onGrab,
}: {
  round: Round;
  onGrab: (cardId: string) => void;
}) {
  if (round.phase === "CENTER_GRAB" && round.centerPool) {
    return <CenterPool pool={round.centerPool} onGrab={onGrab} />;
  }
  if (round.phase === "CENTER_DROP") {
    return (
      <div className="center-info">
        Esperando que todos tiren al pozo (
        {round.centerPool?.expectedDropPerPlayer ?? "?"} cartas c/u)
      </div>
    );
  }
  if (round.phase === "PASSING_LATERAL" && round.pendingPass) {
    return (
      <div className="center-info">
        Pase: {round.pendingPass.count} carta(s) a la {round.pendingPass.direction}
      </div>
    );
  }
  if (round.phase === "DIRECTOR_PICKING") {
    return (
      <div className="center-info">
        Esperando instrucción del director ({round.directorId ?? "?"})
      </div>
    );
  }
  return null;
}

function CenterPool({
  pool,
  onGrab,
}: {
  pool: CenterPoolState;
  onGrab: (cardId: string) => void;
}) {
  // En esta vista no conocemos los cardIds reales (el server no los manda
  // boca abajo por seguridad). Para el MVP, mostramos N "cartas dadas vuelta"
  // y al clickear no enviamos un id (el server tendria que aceptar "any").
  // Como mejora, el server podria mandar id-anonimos. Por ahora, los bots
  // grabbean todo y los humanos casi no llegan a ver esta pantalla.
  return (
    <div className="center-pool">
      <p className="muted">Pozo central — {pool.cardCount} cartas (boca abajo)</p>
      <div className="pool-cards">
        {Array.from({ length: pool.cardCount }).map((_, i) => (
          <Card
            key={i}
            faceDown
            // sin id real: deshabilitado por ahora
            onClick={() => onGrab(`pool-anon-${i}`)}
            card={{ id: "?", deckId: "?", value: "?", suit: "?" }}
          />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Panel de acciones de fase (director, pase, drop)
// -------------------------------------------------------------------------
function ActionPanel({
  round,
  isDirector,
  selected,
  handSize,
  onDirectorPass,
  onPass,
  onDrop,
}: {
  round: Round;
  isDirector: boolean;
  selected: Set<string>;
  handSize: number;
  onDirectorPass: (count: number, direction: "LEFT" | "RIGHT" | "CENTER") => void;
  onPass: () => void;
  onDrop: () => void;
}) {
  if (round.phase === "DIRECTOR_PICKING" && isDirector) {
    return <DirectorControls onPass={onDirectorPass} maxCount={handSize} />;
  }
  if (round.phase === "PASSING_LATERAL") {
    const need = round.pendingPass?.count ?? 0;
    return (
      <div className="action-panel">
        <span>
          Seleccioná {need} carta{need === 1 ? "" : "s"} para pasar
        </span>
        <button type="button" onClick={onPass} disabled={selected.size !== need}>
          Pasar {selected.size}/{need}
        </button>
      </div>
    );
  }
  if (round.phase === "CENTER_DROP") {
    const need = round.centerPool?.expectedDropPerPlayer ?? 0;
    return (
      <div className="action-panel">
        <span>
          Seleccioná {need} carta{need === 1 ? "" : "s"} para tirar al centro
        </span>
        <button type="button" onClick={onDrop} disabled={selected.size !== need}>
          Tirar {selected.size}/{need}
        </button>
      </div>
    );
  }
  return null;
}

function DirectorControls({
  onPass,
  maxCount,
}: {
  onPass: (count: number, direction: "LEFT" | "RIGHT" | "CENTER") => void;
  maxCount: number;
}) {
  const [count, setCount] = useState(1);
  const max = Math.max(1, Math.min(HAND_SIZE, maxCount));
  const counts = useMemo(
    () => Array.from({ length: max }, (_, i) => i + 1),
    [max],
  );
  return (
    <div className="director-controls">
      <p>Sos el director. Decidí cuántas cartas y a dónde van:</p>
      <div className="counts">
        {counts.map((c) => (
          <button
            key={c}
            type="button"
            className={c === count ? "selected" : ""}
            onClick={() => setCount(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="directions">
        <button type="button" onClick={() => onPass(count, "LEFT")}>
          ⬅ {count} a la izquierda
        </button>
        <button type="button" onClick={() => onPass(count, "CENTER")}>
          ⬇ {count} al centro
        </button>
        <button type="button" onClick={() => onPass(count, "RIGHT")}>
          {count} a la derecha ➡
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Panel de llamadas (Chancho / Chancha / Slap)
// -------------------------------------------------------------------------
function CallPanel({
  round,
  myUserId,
  onChancho,
  onChancha,
  onSlap,
}: {
  round: Round;
  myUserId: string;
  onChancho: () => void;
  onChancha: () => void;
  onSlap: () => void;
}) {
  const activeCall = round.activeCall;
  const usedChancha = round.chanchasUsedBy.includes(myUserId);

  if (activeCall && activeCall.callerId !== myUserId) {
    // Hay un llamado activo y no fui yo: gran botón para apoyar.
    const ahead = activeCall.slaps.find((s) => s.playerId === myUserId);
    return (
      <div className="call-panel slap-active">
        <h2>
          {activeCall.callerId} cantó {activeCall.type === "CHANCHO" ? "¡CHANCHO!" : "¡CHAN-...!"}
        </h2>
        <button
          type="button"
          className="slap-btn"
          onClick={onSlap}
          disabled={Boolean(ahead)}
        >
          {ahead ? "✓ Apoyaste" : "✋ APOYAR LA MANO"}
        </button>
      </div>
    );
  }

  if (activeCall && activeCall.callerId === myUserId) {
    return (
      <div className="call-panel">
        <p>Esperando que los demás apoyen…</p>
      </div>
    );
  }

  // Sin llamado: botones para cantar/amaguar.
  return (
    <div className="call-panel">
      <button type="button" className="chancho-btn" onClick={onChancho}>
        🐷 ¡CHANCHO!
      </button>
      <button
        type="button"
        className="chancha-btn"
        onClick={onChancha}
        disabled={usedChancha}
        title={usedChancha ? "Ya usaste tu chancha esta ronda" : ""}
      >
        🤥 ¡CHAN-...! (amague)
      </button>
    </div>
  );
}
