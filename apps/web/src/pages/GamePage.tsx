// Mesa de juego: paño verde con jugadores alrededor, mi mano abajo, y el
// centro con el contexto de la fase actual (o el pozo, o el slap overlay).

import { useEffect, useMemo, useState } from "react";

import { HAND_SIZE } from "@chanchova/shared";
import type { Round } from "@chanchova/shared";

import { Card } from "../components/Card";
import { PlayerSeat } from "../components/PlayerSeat";
import { TableCenter } from "../components/TableCenter";
import { distributeSeats } from "../lib/seating";
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

  // Cuando cambia la fase o el id de ronda, limpiamos la seleccion.
  useEffect(() => {
    setSelected(new Set());
  }, [game?.currentRound?.phase, game?.currentRound?.index]);

  if (!user || !game) {
    return <p style={{ padding: "2rem" }}>Cargando partida…</p>;
  }

  const round = game.currentRound;
  const myScore = game.scores.find((s) => s.playerId === user.userId);
  const iAmEliminated = myScore?.isEliminated ?? false;
  const isDirector = round?.directorId === user.userId;
  const seated = useMemoSeats(game.players, user.userId);
  const others = seated.filter((s) => s.player.id !== user.userId);

  const directorName = round?.directorId
    ? game.players.find((p) => p.id === round.directorId)?.displayName
    : undefined;

  const toggleSelected = (cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const activeCall = round?.activeCall;
  const showSlap = activeCall && activeCall.callerId !== user.userId && !iAmEliminated;
  const callerName = activeCall
    ? game.players.find((p) => p.id === activeCall.callerId)?.displayName
    : undefined;
  const alreadySlapped = activeCall?.slaps.some((s) => s.playerId === user.userId);

  return (
    <div className="game-table">
      <div className="table-topbar">
        <div className="table-topbar__round">
          Sala {game.code} · Ronda {round?.index ?? "-"} · {labelPhase(round?.phase)}
        </div>
        <div>
          {user.displayName} · {myScore?.letters || "—"}
        </div>
      </div>

      <div className="table-arena">
        {/* Asientos de los demás jugadores */}
        {others.map(({ player, position }) => (
          <PlayerSeat
            key={player.id}
            player={player}
            position={position}
            score={game.scores.find((s) => s.playerId === player.id)}
            isDirector={round?.directorId === player.id}
            handSize={HAND_SIZE} // simplificacion: asumimos mano completa
          />
        ))}

        {/* Centro de la mesa */}
        {round && !showSlap && (
          <div className="table-center">
            <TableCenter
              round={round}
              directorName={directorName}
              onGrab={grabFromCenter}
            />
          </div>
        )}

        {/* Slap overlay tapando el centro cuando hay activeCall */}
        {showSlap && activeCall && (
          <div className="slap-overlay">
            <div className="slap-overlay__content">
              <h2 className="slap-overlay__title">
                {activeCall.type === "CHANCHO" ? "¡CHANCHO!" : "¡CHAN-...!"}
              </h2>
              <p className="slap-overlay__caller">
                {callerName ?? activeCall.callerId} apoyó la mano primero
              </p>
              <button
                type="button"
                className="slap-btn"
                onClick={slap}
                disabled={alreadySlapped}
              >
                {alreadySlapped ? "✓ Apoyaste" : "✋ Apoyar mi mano"}
              </button>
            </div>
          </div>
        )}

        {/* Flash messages */}
        {flash && <div className="table-flash">{flash}</div>}

        {/* Mi area inferior */}
        <div className="my-area">
          <div className="my-meta">
            <span>{user.displayName}</span>
            <span className="my-meta__letters">{myScore?.letters || "—"}</span>
            {iAmEliminated && <span style={{ color: "salmon" }}>✗ ELIMINADO</span>}
          </div>

          {!iAmEliminated && (
            <>
              {/* Action panel especifico de la fase */}
              {round && (
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

              <div className="my-hand">
                {myHand.map((c) => (
                  <Card
                    key={c.id}
                    card={c}
                    selected={selected.has(c.id)}
                    onClick={() => toggleSelected(c.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Botones flotantes para Chancho/Chancha (siempre visibles si no hay call activo) */}
        {round && !iAmEliminated && !activeCall && (
          <div className="call-floats">
            <button
              type="button"
              className="float-btn float-btn--chancho"
              onClick={callChancho}
            >
              🐷 Chancho
            </button>
            <button
              type="button"
              className="float-btn float-btn--chancha"
              onClick={callChancha}
              disabled={round.chanchasUsedBy.includes(user.userId)}
            >
              🤥 Chan-...
            </button>
          </div>
        )}

        {error && <div className="error-toast">⚠ {error.message}</div>}

        {/* Pantalla de fin de partida */}
        {game.status === "FINISHED" && (
          <div className="game-finished-overlay">
            <div className="game-finished-card">
              <h2>🏆 Partida terminada</h2>
              <p style={{ margin: 0 }}>
                Ganador:{" "}
                <strong>
                  {game.players.find(
                    (p) => !game.scores.find((s) => s.playerId === p.id)?.isEliminated,
                  )?.displayName ?? "—"}
                </strong>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

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
    return <DirectorControls maxCount={handSize} onPass={onDirectorPass} />;
  }
  if (round.phase === "PASSING_LATERAL") {
    const need = round.pendingPass?.count ?? 0;
    return (
      <div className="action-panel">
        <span className="action-panel__hint">
          Elegí {need} carta{need === 1 ? "" : "s"} para pasar
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onPass}
          disabled={selected.size !== need}
        >
          Pasar {selected.size}/{need}
        </button>
      </div>
    );
  }
  if (round.phase === "CENTER_DROP") {
    const need = round.centerPool?.expectedDropPerPlayer ?? 0;
    return (
      <div className="action-panel">
        <span className="action-panel__hint">
          Tirá {need} carta{need === 1 ? "" : "s"} al pozo
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onDrop}
          disabled={selected.size !== need}
        >
          Tirar {selected.size}/{need}
        </button>
      </div>
    );
  }
  return null;
}

function DirectorControls({
  maxCount,
  onPass,
}: {
  maxCount: number;
  onPass: (count: number, direction: "LEFT" | "RIGHT" | "CENTER") => void;
}) {
  const [count, setCount] = useState(1);
  const max = Math.max(1, Math.min(HAND_SIZE, maxCount));
  const counts = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="director-controls">
      <span className="director-controls__label">
        Sos el director · cuántas cartas:
      </span>
      <div className="director-controls__row">
        {counts.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip ${c === count ? "chip--active" : ""}`}
            onClick={() => setCount(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="director-controls__row">
        <button type="button" className="dir-btn" onClick={() => onPass(count, "LEFT")}>
          ⬅ Izquierda
        </button>
        <button type="button" className="dir-btn" onClick={() => onPass(count, "CENTER")}>
          ⬇ Centro
        </button>
        <button type="button" className="dir-btn" onClick={() => onPass(count, "RIGHT")}>
          Derecha ➡
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function useMemoSeats(players: { id: string; seatIndex: number }[], myId: string) {
  // Memoizamos para evitar re-render del PlayerSeat sin cambios reales.
  return useMemo(
    () => distributeSeats(players as any, myId),
    [players.map((p) => p.id).join(","), myId],
  );
}

function labelPhase(phase: string | undefined): string {
  switch (phase) {
    case "DIRECTOR_PICKING":
      return "El director decide";
    case "PASSING_LATERAL":
      return "Pasando cartas";
    case "CENTER_DROP":
      return "Tirando al pozo";
    case "CENTER_GRAB":
      return "¡A agarrar!";
    case "CHANCHO_RESOLVING":
      return "¡Apoyando!";
    case "RESOLVED":
      return "Ronda terminada";
    default:
      return phase ?? "—";
  }
}
