// Lobby de la sala antes de empezar la partida.
// Muestra el codigo grande, los slots de jugadores con avatares lindos, y
// permite al host agregar bots e iniciar.

import { MAX_PLAYERS, MIN_PLAYERS } from "@chanchova/shared";
import { useApp } from "../state/AppContext";

export function LobbyPage() {
  const { user, lobby, addBot, startGame, leaveLobby, error } = useApp();
  if (!user || !lobby) return <p style={{ padding: "2rem" }}>Cargando sala…</p>;

  const isHost = lobby.hostUserId === user.userId;
  const canStart = isHost && lobby.players.length >= MIN_PLAYERS;
  const canAddBot = isHost && lobby.players.length < MAX_PLAYERS;
  const emptySlots = MAX_PLAYERS - lobby.players.length;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span>🐷</span>
          <span>Sala</span>
        </div>
        <button type="button" className="btn btn-ghost" onClick={leaveLobby}>
          ← Salir
        </button>
      </header>

      <main className="lobby-room">
        <div className="lobby-room__header">
          <h1 className="lobby-room__title">Sala de espera</h1>
        </div>

        <div className="code-card">
          <p className="code-card__label">Código de invitación</p>
          <p className="code-card__value">{lobby.code}</p>
          <p className="code-card__hint">
            Compartí este código con tus amigos para que se sumen
          </p>
        </div>

        <section>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
            Jugadores ({lobby.players.length}/{MAX_PLAYERS})
          </h2>
          <div className="player-slots">
            {lobby.players.map((p) => (
              <div className="slot" key={p.id}>
                <div className={`slot__avatar ${p.isBot ? "slot__avatar--bot" : ""}`}>
                  {p.isBot ? "🤖" : p.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="slot__name">{p.displayName}</div>
                <div className="slot__role">
                  {p.id === lobby.hostUserId
                    ? "Host"
                    : p.id === user.userId
                      ? "Vos"
                      : p.isBot
                        ? "Bot"
                        : "Invitado"}
                </div>
              </div>
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div className="slot slot--empty" key={`empty-${i}`}>
                {isHost ? (
                  <button
                    type="button"
                    className="add-bot-btn"
                    onClick={addBot}
                    disabled={!canAddBot}
                    title="Agregar bot"
                  >
                    +🤖
                  </button>
                ) : (
                  "Esperando…"
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="lobby-actions">
          {isHost ? (
            <>
              <button
                type="button"
                className="btn"
                onClick={addBot}
                disabled={!canAddBot}
              >
                + Agregar bot
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={startGame}
                disabled={!canStart}
              >
                {canStart
                  ? "🎲 Empezar partida"
                  : `Faltan ${MIN_PLAYERS - lobby.players.length} jugador(es)`}
              </button>
            </>
          ) : (
            <p style={{ color: "rgba(255,255,255,0.6)" }}>
              Esperando que el host inicie la partida…
            </p>
          )}
        </div>

        {error && (
          <p style={{ color: "salmon", textAlign: "center" }}>{error.message}</p>
        )}
      </main>
    </div>
  );
}
