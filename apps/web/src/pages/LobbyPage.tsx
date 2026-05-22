// Pantalla de lobby: muestra la sala mientras espera a que arranque la partida.
// El host puede agregar bots y arrancar; los demas esperan.

import { MAX_PLAYERS, MIN_PLAYERS } from "@chanchova/shared";
import { useApp } from "../state/AppContext";

export function LobbyPage() {
  const { user, lobby, addBot, startGame, leaveLobby, error } = useApp();
  if (!user || !lobby) return <p>Cargando sala...</p>;

  const isHost = lobby.hostUserId === user.userId;
  const canStart = isHost && lobby.players.length >= MIN_PLAYERS;
  const canAddBot = isHost && lobby.players.length < MAX_PLAYERS;

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>🐷 Sala {lobby.code}</h1>
        <button type="button" onClick={leaveLobby} className="link-btn">
          Salir
        </button>
      </header>

      <section>
        <h2>Compartí el código con tus amigos</h2>
        <p className="invite-code">{lobby.code}</p>
      </section>

      <section>
        <h2>
          Jugadores ({lobby.players.length}/{MAX_PLAYERS})
        </h2>
        <ul className="player-list">
          {lobby.players.map((p) => (
            <li key={p.id}>
              {p.isBot ? "🤖" : "👤"} {p.displayName}
              {p.id === lobby.hostUserId && " (host)"}
              {p.id === user.userId && " (vos)"}
            </li>
          ))}
        </ul>
      </section>

      {isHost && (
        <section className="lobby-actions">
          <button type="button" onClick={addBot} disabled={!canAddBot}>
            + Agregar bot
          </button>
          <button
            type="button"
            onClick={startGame}
            disabled={!canStart}
            className="primary"
          >
            Iniciar partida ({lobby.players.length}/{MIN_PLAYERS} mín)
          </button>
        </section>
      )}

      {!isHost && (
        <p className="muted">Esperando que el host inicie la partida...</p>
      )}

      {error && <p className="error">{error.message}</p>}
    </div>
  );
}
