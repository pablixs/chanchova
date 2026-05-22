// HomePage tiene dos modos:
//  - Sin usuario: pantalla de aterrizaje con input de nombre (estilo landing).
//  - Con usuario: lobby principal estilo Plato con dos tiles grandes para
//    crear sala o unirse con codigo.

import { useState } from "react";
import { useApp } from "../state/AppContext";

export function HomePage() {
  const { user, identifyAsGuest, error } = useApp();
  if (!user) return <Landing onSubmit={identifyAsGuest} error={error} />;
  return <LobbyHome />;
}

// ---------------------------------------------------------------------------

function Landing({
  onSubmit,
  error,
}: {
  onSubmit: (name: string) => void;
  error?: { code: string; message: string };
}) {
  const [name, setName] = useState("");
  return (
    <div className="landing">
      <div className="landing-logo">🐷</div>
      <h1 className="landing-title">CHANCHOVA</h1>
      <p className="landing-tag">El Chancho argentino, online</p>
      <form
        className="landing-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <input
          autoFocus
          type="text"
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
        />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          Empezar a jugar
        </button>
      </form>
      {error && <p style={{ color: "salmon", marginTop: "1rem" }}>{error.message}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function LobbyHome() {
  const { user, createGame, joinGame, logout, error } = useApp();
  const [code, setCode] = useState("");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span>🐷</span>
          <span>CHANCHOVA</span>
        </div>
        <div className="app-header__user">
          <div className="user-chip">
            <span className="user-chip__avatar">
              {user!.displayName.charAt(0).toUpperCase()}
            </span>
            <span>{user!.displayName}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <main className="lobby-home">
        <div className="lobby-home__hero">
          <h1>¿Cómo querés jugar?</h1>
          <p>Creá una sala para invitar amigos o sumate con un código</p>
        </div>

        <div className="lobby-tiles">
          <div className="tile tile--featured">
            <div className="tile__icon">🎲</div>
            <h2 className="tile__title">Crear sala</h2>
            <p className="tile__desc">
              Modo Chancho Dirigido · Naipes españoles · Sala privada con código
            </p>
            <button type="button" className="btn btn-primary" onClick={createGame}>
              Nueva sala
            </button>
          </div>

          <div className="tile">
            <div className="tile__icon">🎟️</div>
            <h2 className="tile__title">Unirse</h2>
            <p className="tile__desc">
              Pedile el código a quien creó la sala (6 letras y números)
            </p>
            <form
              className="tile__form"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) joinGame(code);
              }}
            >
              <input
                type="text"
                placeholder="ABC123"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={code.trim().length < 4}
              >
                Entrar
              </button>
            </form>
          </div>
        </div>

        {error && (
          <p style={{ color: "salmon", marginTop: "1.5rem", textAlign: "center" }}>
            {error.message}
          </p>
        )}
      </main>
    </div>
  );
}
