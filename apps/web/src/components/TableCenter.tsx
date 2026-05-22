// Centro de la mesa: muestra el contexto de la fase actual.
// - DIRECTOR_PICKING: mensaje de espera al director
// - PASSING_LATERAL: instruccion de pase activa
// - CENTER_DROP: mensaje de "tirando al pozo"
// - CENTER_GRAB: pozo de cartas clickeables (boca abajo)

import type { Round } from "@chanchova/shared";

interface Props {
  round: Round;
  directorName: string | undefined;
  onGrab: (anonCardId: string) => void;
}

export function TableCenter({ round, directorName, onGrab }: Props) {
  if (round.phase === "DIRECTOR_PICKING") {
    return (
      <CenterMsg
        icon="🎬"
        title="Esperando al director"
        sub={directorName ? `${directorName} está decidiendo el pase` : ""}
      />
    );
  }

  if (round.phase === "PASSING_LATERAL" && round.pendingPass) {
    const arrow =
      round.pendingPass.direction === "LEFT"
        ? "⬅"
        : round.pendingPass.direction === "RIGHT"
          ? "➡"
          : "⬇";
    return (
      <CenterMsg
        icon={arrow}
        title={`${round.pendingPass.count} carta(s) a la ${labelDir(round.pendingPass.direction)}`}
        sub="Cada jugador elige sus cartas y todos pasan al mismo tiempo"
      />
    );
  }

  if (round.phase === "CENTER_DROP" && round.centerPool) {
    return (
      <CenterMsg
        icon="⬇"
        title={`${round.centerPool.expectedDropPerPlayer} al pozo`}
        sub="Todos tirando boca abajo"
      />
    );
  }

  if (round.phase === "CENTER_GRAB" && round.centerPool) {
    return <CenterPool ids={round.centerPool.cardIds} onGrab={onGrab} />;
  }

  if (round.phase === "RESOLVED") {
    return (
      <CenterMsg
        icon="🎉"
        title="Ronda terminada"
        sub="La próxima ronda empieza enseguida..."
      />
    );
  }

  if (round.phase === "CHANCHO_RESOLVING") {
    return null; // el slap overlay se ocupa
  }

  return null;
}

function CenterMsg({
  icon,
  title,
  sub,
}: {
  icon: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="center-msg">
      <div className="center-msg__icon">{icon}</div>
      <div className="center-msg__title">{title}</div>
      {sub && <div className="center-msg__sub">{sub}</div>}
    </div>
  );
}

function CenterPool({
  ids,
  onGrab,
}: {
  ids: string[];
  onGrab: (anonId: string) => void;
}) {
  // Distribuir las cartas en un circulo. radius dinamico segun cantidad.
  const total = ids.length;
  return (
    <div className="pool-ring">
      {ids.map((id, i) => {
        const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
        const radius = 35; // % del contenedor
        const x = 50 + radius * Math.cos(angle);
        const y = 50 + radius * Math.sin(angle);
        return (
          <button
            key={id}
            type="button"
            className="pool-card"
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => onGrab(id)}
            aria-label={`agarrar carta ${i + 1}`}
          >
            🐷
          </button>
        );
      })}
    </div>
  );
}

function labelDir(d: "LEFT" | "RIGHT" | "CENTER"): string {
  return d === "LEFT" ? "izquierda" : d === "RIGHT" ? "derecha" : "centro";
}
