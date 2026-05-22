// Tira con los demas jugadores: avatar/inicial, nombre, status, letras y rol.

import type { GameSession, LetterScore, Player } from "@chanchova/shared";

interface Props {
  game: GameSession;
  myUserId: string;
}

export function PlayerStrip({ game, myUserId }: Props) {
  const others = game.players.filter((p) => p.id !== myUserId);
  return (
    <div className="player-strip">
      {others.map((p) => (
        <PlayerBadge
          key={p.id}
          player={p}
          score={game.scores.find((s) => s.playerId === p.id)}
          isDirector={game.currentRound?.directorId === p.id}
        />
      ))}
    </div>
  );
}

function PlayerBadge({
  player,
  score,
  isDirector,
}: {
  player: Player;
  score?: LetterScore;
  isDirector: boolean;
}) {
  const initial = player.displayName.charAt(0).toUpperCase();
  const elim = score?.isEliminated;
  return (
    <div className={`player-badge ${elim ? "player-badge--elim" : ""}`}>
      <div className="player-avatar">
        {player.isBot ? "🤖" : initial}
        {isDirector && <span className="player-director">👑</span>}
      </div>
      <div className="player-info">
        <div className="player-name">{player.displayName}</div>
        <div className="player-letters">{score?.letters || "—"}</div>
        {player.status === "DISCONNECTED" && (
          <div className="player-status">📡 desconectado</div>
        )}
      </div>
    </div>
  );
}
