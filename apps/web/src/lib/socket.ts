// Cliente WebSocket para el backend Chanchova.
//
// Es un singleton: se conecta una unica vez al montar la app. Re-emite los
// eventos del server (game:*, lobby:*, etc.) hacia listeners registrados.
// El lado tipado vive en `@chanchova/shared`: aqui solo glue.

import { io, type Socket } from "socket.io-client";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type AuthIdentifyPayload,
  type DirectorPassPayload,
  type DropToCenterPayload,
  type GrabFromCenterPayload,
  type LobbyCreatePayload,
  type LobbyJoinPayload,
} from "@chanchova/shared";

const URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

let _socket: Socket | null = null;

/** Devuelve el singleton (lo crea si todavia no existe). */
export function getSocket(): Socket {
  if (_socket) return _socket;
  _socket = io(URL, {
    transports: ["websocket"],
    autoConnect: true,
  });
  return _socket;
}

// Wrappers tipados para emitir eventos al server. Mantienen el contrato
// declarado en @chanchova/shared sin que cada componente conozca los strings.

export const emit = {
  authIdentify(payload: AuthIdentifyPayload) {
    getSocket().emit(CLIENT_EVENTS.AUTH_IDENTIFY, payload);
  },
  lobbyCreate(payload: LobbyCreatePayload) {
    getSocket().emit(CLIENT_EVENTS.LOBBY_CREATE, payload);
  },
  lobbyJoin(payload: LobbyJoinPayload) {
    getSocket().emit(CLIENT_EVENTS.LOBBY_JOIN, payload);
  },
  lobbyLeave() {
    getSocket().emit(CLIENT_EVENTS.LOBBY_LEAVE);
  },
  lobbyAddBot() {
    getSocket().emit(CLIENT_EVENTS.LOBBY_ADD_BOT, {});
  },
  lobbyStart() {
    getSocket().emit(CLIENT_EVENTS.LOBBY_START);
  },
  directorPass(payload: DirectorPassPayload) {
    getSocket().emit(CLIENT_EVENTS.GAME_DIRECTOR_PASS, payload);
  },
  passCard(payload: { cardIds: string[] }) {
    getSocket().emit(CLIENT_EVENTS.GAME_PASS_CARD, payload);
  },
  dropToCenter(payload: DropToCenterPayload) {
    getSocket().emit(CLIENT_EVENTS.GAME_DROP_TO_CENTER, payload);
  },
  grabFromCenter(payload: GrabFromCenterPayload) {
    getSocket().emit(CLIENT_EVENTS.GAME_GRAB_FROM_CENTER, payload);
  },
  callChancho() {
    getSocket().emit(CLIENT_EVENTS.GAME_CALL_CHANCHO);
  },
  callChancha() {
    getSocket().emit(CLIENT_EVENTS.GAME_CALL_CHANCHA);
  },
  slap() {
    getSocket().emit(CLIENT_EVENTS.GAME_SLAP);
  },
};

export { SERVER_EVENTS };
