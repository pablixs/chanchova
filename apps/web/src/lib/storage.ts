// Persistencia liviana de la sesion del usuario.
//
// Guardamos sessionToken + displayName en localStorage para soportar
// reconexion automatica al recargar la pagina (dentro de la ventana de
// gracia del server, 10s).

const KEY = "chanchova.session";

export interface StoredSession {
  sessionToken: string;
  displayName: string;
  userId: string;
}

export function loadSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function saveSession(s: StoredSession): void {
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  window.localStorage.removeItem(KEY);
}
