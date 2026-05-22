// Pantalla inicial: el usuario ingresa su nombre, crea o se une a una sala.

import { useState } from "react";
import { useApp } from "../state/AppContext";

export function HomePage() {
  const { user, identifyAsGuest, createGame, joinGame, error, logout } = useApp();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  if (!user) {
    return (
      <div className="screen">
        <h1>🐷 Chanchova</h1>
        <p>Ingresá tu nombre para jugar como invitado</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) identifyAsGuest(name.trim());
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
          <button type="submit" disabled={!name.trim()}>
            Entrar
          </button>
        </form>
        {error && <p className="error">{error.message}</p>}
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>🐷 Chanchova</h1>
        <div>
          Hola, <strong>{user.displayName}</strong>{" "}
          <button type="button" onClick={logout} className="link-btn">
            (salir)
          </button>
        </div>
      </header>

      <section className="lobby-actions">
        <div className="card-action">
          <h2>Crear sala</h2>
          <p>Modo Chancho Dirigido, mazo español, sala privada.</p>
          <button type="button" onClick={createGame}>
            Crear nueva sala
          </button>
        </div>

        <div className="card-action">
          <h2>Unirse con código</h2>
          <form
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
            <button type="submit" disabled={code.trim().length < 4}>
              Entrar
            </button>
          </form>
        </div>
      </section>

      {error && <p className="error">{error.message}</p>}
    </div>
  );
}
