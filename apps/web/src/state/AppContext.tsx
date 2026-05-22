// Estado global de la app cliente.
//
// Centralizamos el ciclo de vida del socket + identidad + estado de sala/partida.
// Los componentes consumen via useApp() y disparan acciones tipadas.
//
// El estado se modela como una FSM simple:
//   - status: "loading" | "anonymous" | "in_lobby" | "in_game"
// Las transiciones las dispara el server via eventos WebSocket.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import {
  SERVER_EVENTS,
  type AuthOkPayload,
  type Card,
  type GameSession,
} from "@chanchova/shared";

import { emit, getSocket } from "../lib/socket";
import {
  clearSession,
  loadSession,
  saveSession,
  type StoredSession,
} from "../lib/storage";

// -------- Estado --------

type AppStatus = "loading" | "anonymous" | "in_lobby" | "in_game" | "finished";

export interface LobbyRoomView {
  gameId: string;
  code: string;
  mode: string;
  visibility: string;
  status: string;
  hostUserId: string;
  players: { id: string; displayName: string; isBot: boolean; seatIndex: number }[];
}

export interface AppState {
  status: AppStatus;
  user?: { userId: string; displayName: string; sessionToken: string };
  lobby?: LobbyRoomView;
  game?: GameSession;
  myHand: Card[];
  /** ultimo error del server, si lo hay */
  error?: { code: string; message: string };
  /** flash messages temporales (e.g. "Beto cantó CHANCHO!") */
  flash?: string;
}

type Action =
  | { type: "AUTH_OK"; payload: AuthOkPayload }
  | { type: "AUTH_ERROR"; payload: { code: string; message: string } }
  | { type: "LOBBY_STATE"; payload: LobbyRoomView }
  | { type: "GAME_STARTED" }
  | { type: "PUBLIC_STATE"; payload: GameSession }
  | { type: "HAND_DEALT"; payload: Card[] }
  | { type: "GAME_FINISHED" }
  | { type: "ERROR"; payload: { code: string; message: string } }
  | { type: "FLASH"; payload: string }
  | { type: "CLEAR_FLASH" }
  | { type: "LEAVE_LOBBY" }
  | { type: "LOGOUT" };

const initialState: AppState = {
  status: "loading",
  myHand: [],
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "AUTH_OK":
      return {
        ...state,
        status: state.lobby ? "in_lobby" : "anonymous",
        user: {
          userId: action.payload.userId,
          displayName: action.payload.displayName,
          sessionToken: action.payload.sessionToken,
        },
      };
    case "AUTH_ERROR":
      return { ...state, status: "anonymous", error: action.payload };
    case "LOBBY_STATE":
      return {
        ...state,
        lobby: action.payload,
        status: action.payload.status === "STARTED" ? "in_game" : "in_lobby",
      };
    case "GAME_STARTED":
      return { ...state, status: "in_game" };
    case "PUBLIC_STATE":
      return {
        ...state,
        game: action.payload,
        status:
          action.payload.status === "FINISHED"
            ? "finished"
            : "in_game",
      };
    case "HAND_DEALT":
      return { ...state, myHand: action.payload };
    case "GAME_FINISHED":
      return { ...state, status: "finished" };
    case "ERROR":
      return { ...state, error: action.payload };
    case "FLASH":
      return { ...state, flash: action.payload };
    case "CLEAR_FLASH":
      return { ...state, flash: undefined };
    case "LEAVE_LOBBY":
      return {
        ...state,
        lobby: undefined,
        game: undefined,
        myHand: [],
        status: "anonymous",
      };
    case "LOGOUT":
      return { ...initialState, status: "anonymous" };
  }
}

// -------- Context --------

interface AppContextValue extends AppState {
  identifyAsGuest: (name: string) => void;
  logout: () => void;
  createGame: () => void;
  joinGame: (code: string) => void;
  leaveLobby: () => void;
  addBot: () => void;
  startGame: () => void;
  // Acciones de juego
  directorPass: (count: number, direction: "LEFT" | "RIGHT" | "CENTER") => void;
  passCards: (cardIds: string[]) => void;
  dropToCenter: (cardIds: string[]) => void;
  grabFromCenter: (cardId: string) => void;
  callChancho: () => void;
  callChancha: () => void;
  slap: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Al montar, intentar reconectar con sessionToken si hay en localStorage.
  useEffect(() => {
    const socket = getSocket();
    const stored = loadSession();

    socket.on("connect", () => {
      if (stored) {
        emit.authIdentify({
          guestName: stored.displayName,
          sessionToken: stored.sessionToken,
        });
      } else {
        // Estado anonimo, esperando que el usuario ingrese nombre.
        dispatch({ type: "LOGOUT" });
      }
    });

    socket.on(SERVER_EVENTS.AUTH_OK, (payload: AuthOkPayload) => {
      const session: StoredSession = {
        sessionToken: payload.sessionToken,
        displayName: payload.displayName,
        userId: payload.userId,
      };
      saveSession(session);
      dispatch({ type: "AUTH_OK", payload });
    });

    socket.on(SERVER_EVENTS.AUTH_ERROR, (payload: { code: string; message: string }) => {
      dispatch({ type: "AUTH_ERROR", payload });
    });

    socket.on(SERVER_EVENTS.LOBBY_STATE, (payload: LobbyRoomView) => {
      dispatch({ type: "LOBBY_STATE", payload });
    });

    socket.on(SERVER_EVENTS.GAME_STARTED, () => {
      dispatch({ type: "GAME_STARTED" });
    });

    socket.on(
      SERVER_EVENTS.GAME_PUBLIC_STATE,
      (payload: { session: GameSession }) => {
        dispatch({ type: "PUBLIC_STATE", payload: payload.session });
      },
    );

    socket.on(
      SERVER_EVENTS.GAME_HAND_DEALT,
      (payload: { cards: Card[] }) => {
        dispatch({ type: "HAND_DEALT", payload: payload.cards });
      },
    );

    socket.on(
      SERVER_EVENTS.GAME_FINISHED,
      (payload: { winnerId: string }) => {
        dispatch({
          type: "FLASH",
          payload: `Partida terminada — ganador: ${payload.winnerId}`,
        });
      },
    );

    socket.on(
      SERVER_EVENTS.GAME_CHANCHO_CALLED,
      (payload: { callerId: string; valid: boolean }) => {
        dispatch({
          type: "FLASH",
          payload: `${payload.callerId} cantó CHANCHO ${payload.valid ? "✓" : "(inválido)"}!`,
        });
      },
    );

    socket.on(
      SERVER_EVENTS.GAME_CHANCHA_CALLED,
      (payload: { callerId: string }) => {
        dispatch({ type: "FLASH", payload: `${payload.callerId} amagó (CHAN-)` });
      },
    );

    socket.on(SERVER_EVENTS.ERROR, (payload: { code: string; message: string }) => {
      dispatch({ type: "ERROR", payload });
    });

    return () => {
      socket.off("connect");
      for (const ev of Object.values(SERVER_EVENTS)) socket.off(ev);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-clear flash messages tras 3s.
  useEffect(() => {
    if (!state.flash) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_FLASH" }), 3000);
    return () => clearTimeout(t);
  }, [state.flash]);

  const identifyAsGuest = useCallback((name: string) => {
    emit.authIdentify({ guestName: name });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    dispatch({ type: "LOGOUT" });
  }, []);

  const createGame = useCallback(() => {
    emit.lobbyCreate({
      mode: "CHANCHO_DIRIGIDO",
      visibility: "PRIVATE",
      deckId: "spanish_classic",
    });
  }, []);

  const joinGame = useCallback((code: string) => {
    emit.lobbyJoin({ code: code.trim().toUpperCase() });
  }, []);

  const leaveLobby = useCallback(() => {
    emit.lobbyLeave();
    dispatch({ type: "LEAVE_LOBBY" });
  }, []);

  const addBot = useCallback(() => emit.lobbyAddBot(), []);
  const startGame = useCallback(() => emit.lobbyStart(), []);
  const directorPass = useCallback(
    (count: number, direction: "LEFT" | "RIGHT" | "CENTER") =>
      emit.directorPass({ count, direction }),
    [],
  );
  const passCards = useCallback(
    (cardIds: string[]) => emit.passCard({ cardIds }),
    [],
  );
  const dropToCenter = useCallback(
    (cardIds: string[]) => emit.dropToCenter({ cardIds }),
    [],
  );
  const grabFromCenter = useCallback(
    (cardId: string) => emit.grabFromCenter({ cardId }),
    [],
  );
  const callChancho = useCallback(() => emit.callChancho(), []);
  const callChancha = useCallback(() => emit.callChancha(), []);
  const slap = useCallback(() => emit.slap(), []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      identifyAsGuest,
      logout,
      createGame,
      joinGame,
      leaveLobby,
      addBot,
      startGame,
      directorPass,
      passCards,
      dropToCenter,
      grabFromCenter,
      callChancho,
      callChancha,
      slap,
    }),
    [
      state,
      identifyAsGuest,
      logout,
      createGame,
      joinGame,
      leaveLobby,
      addBot,
      startGame,
      directorPass,
      passCards,
      dropToCenter,
      grabFromCenter,
      callChancho,
      callChancha,
      slap,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp debe usarse dentro de <AppProvider>");
  return ctx;
}
