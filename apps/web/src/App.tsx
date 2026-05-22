// Componente raiz: routea segun el estado global de la app.
//
// No usamos react-router porque la navegacion la dirige el server (los
// eventos WebSocket transicionan al usuario entre pantallas). Una FSM
// simple en AppContext.status alcanza para HomePage/Lobby/Game.

import { GamePage } from "./pages/GamePage";
import { HomePage } from "./pages/HomePage";
import { LobbyPage } from "./pages/LobbyPage";
import { useApp } from "./state/AppContext";

export function App() {
  const { status, lobby, game } = useApp();

  if (status === "loading") {
    return <p className="screen">Conectando...</p>;
  }

  if (status === "in_game" || status === "finished" || game) {
    return <GamePage />;
  }

  if (status === "in_lobby" || lobby) {
    return <LobbyPage />;
  }

  return <HomePage />;
}
