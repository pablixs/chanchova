// Servicio de sesiones para soportar reconexion de invitados.
//
// Al identificarse, el cliente recibe un `sessionToken` (uuid). Si despues se
// desconecta y vuelve a conectarse antes de que la gracia expire, manda el
// mismo token y el server recupera su userId/displayName/gameId.
//
// El token vive en memoria del proceso. Sobrevivira a un reload del browser
// pero NO a un restart del servidor (eso queda para Fase 4 con persistencia).

import { Injectable } from "@nestjs/common";
import { customAlphabet } from "nanoid";

const tokenNanoid = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  24,
);

export interface SessionRecord {
  userId: string;
  displayName: string;
  isGuest: boolean;
  gameId?: string;
}

@Injectable()
export class SessionService {
  // sessionToken -> SessionRecord
  private readonly tokens = new Map<string, SessionRecord>();
  // userId -> sessionToken (para limpieza)
  private readonly byUser = new Map<string, string>();

  /** Crea una nueva sesion y devuelve el token. */
  create(record: SessionRecord): string {
    const token = tokenNanoid();
    this.tokens.set(token, record);
    this.byUser.set(record.userId, token);
    return token;
  }

  /** Recupera una sesion por token. */
  get(token: string): SessionRecord | undefined {
    return this.tokens.get(token);
  }

  /** Actualiza el gameId asociado al token. */
  setGameId(token: string, gameId: string | undefined): void {
    const rec = this.tokens.get(token);
    if (rec) rec.gameId = gameId;
  }

  /** Borra la sesion (no se va a poder reconectar con ese token). */
  remove(token: string): void {
    const rec = this.tokens.get(token);
    if (!rec) return;
    this.tokens.delete(token);
    this.byUser.delete(rec.userId);
  }
}
