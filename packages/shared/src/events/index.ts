// Catálogo de eventos WebSocket entre cliente y servidor.
// Los nombres de eventos viven en `EVENT_NAMES` para evitar errores de tipeo.
// Los payloads se definen como interfaces para tipar tanto el emisor como el receptor.

import type {
  GameMode,
  GameSession,
  PassInstruction,
  Card,
} from "../domain/index";

export const CLIENT_EVENTS = {
  AUTH_IDENTIFY: "auth:identify",
  LOBBY_CREATE: "lobby:create",
  LOBBY_JOIN: "lobby:join",
  LOBBY_LEAVE: "lobby:leave",
  LOBBY_LIST_PUBLIC: "lobby:list_public",
  LOBBY_ADD_BOT: "lobby:add_bot",
  LOBBY_START: "lobby:start",
  GAME_DIRECTOR_PASS: "game:director_pass",
  GAME_DROP_TO_CENTER: "game:drop_to_center",
  GAME_GRAB_FROM_CENTER: "game:grab_from_center",
  GAME_PASS_CARD: "game:pass_card",
  GAME_CALL_CHANCHO: "game:call_chancho",
  GAME_CALL_CHANCHA: "game:call_chancha",
  GAME_SLAP: "game:slap",
  GAME_CONFIRM_CONTINUE: "game:confirm_continue",
} as const;

export const SERVER_EVENTS = {
  AUTH_OK: "auth:ok",
  AUTH_ERROR: "auth:error",
  LOBBY_STATE: "lobby:state",
  LOBBY_PUBLIC_LIST: "lobby:public_list",
  GAME_STARTED: "game:started",
  GAME_ROUND_STARTED: "game:round_started",
  GAME_HAND_DEALT: "game:hand_dealt",
  GAME_PUBLIC_STATE: "game:public_state",
  GAME_DIRECTOR_PASS_REQUESTED: "game:director_pass_requested",
  GAME_CENTER_DROP_REQUESTED: "game:center_drop_requested",
  GAME_CENTER_OPEN: "game:center_open",
  GAME_CENTER_CARD_GRABBED: "game:center_card_grabbed",
  GAME_CENTER_CLOSED: "game:center_closed",
  GAME_CHANCHO_CALLED: "game:chancho_called",
  GAME_CHANCHA_CALLED: "game:chancha_called",
  GAME_SLAP_REGISTERED: "game:slap_registered",
  GAME_ROUND_RESOLVED: "game:round_resolved",
  GAME_PLAYER_DISCONNECTED: "game:player_disconnected",
  GAME_PLAYER_RECONNECTED: "game:player_reconnected",
  GAME_PLAYER_ELIMINATED: "game:player_eliminated",
  GAME_FINISHED: "game:finished",
  ERROR: "error",
} as const;

// --- Payloads de cliente -> servidor ---

export interface AuthIdentifyPayload {
  token?: string; // Google OAuth id_token
  guestName?: string;
}

export interface LobbyCreatePayload {
  mode: GameMode;
  visibility: "PUBLIC" | "PRIVATE";
  deckId: string;
}

export interface LobbyJoinPayload {
  code: string;
}

export interface LobbyAddBotPayload {
  difficulty?: "BASIC";
}

export interface DirectorPassPayload {
  count: number;
  direction: PassInstruction["direction"];
}

export interface DropToCenterPayload {
  cardIds: string[];
}

export interface GrabFromCenterPayload {
  cardId: string;
}

export interface PassCardPayload {
  cardId: string;
}

// --- Payloads de servidor -> cliente ---

export interface AuthOkPayload {
  userId: string;
  displayName: string;
  isGuest: boolean;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface HandDealtPayload {
  cards: Card[];
}

export interface PublicStatePayload {
  session: GameSession;
}
