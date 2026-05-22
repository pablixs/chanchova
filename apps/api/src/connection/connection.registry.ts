// Registry de conexiones WebSocket activas.
//
// Mantiene en memoria el mapeo socketId <-> userId y la sala (gameId) en la
// que esta cada usuario. Es la unica pieza que conoce la identidad detras de
// un socket; todo el resto del backend trabaja con userId/gameId.
//
// En el MVP los datos viven en memoria del proceso. Cuando escalemos a
// multiples instancias, se reemplaza por una implementacion que use Redis
// o similar (interfaz IConnectionRegistry quedaria publica para inyectarla).

import { Injectable } from "@nestjs/common";

export interface ConnectionInfo {
  userId: string;
  displayName: string;
  isGuest: boolean;
  /** Token de sesion (para soportar reconexiones). */
  sessionToken: string;
  // Sala en la que esta el usuario; null si esta en el lobby raiz.
  gameId?: string;
}

@Injectable()
export class ConnectionRegistry {
  // socketId -> ConnectionInfo
  private readonly bySocket = new Map<string, ConnectionInfo>();

  /** Registra una conexion al identificarse. */
  register(socketId: string, info: ConnectionInfo): void {
    this.bySocket.set(socketId, info);
  }

  /** Devuelve la info asociada a un socket o undefined si no esta identificado. */
  get(socketId: string): ConnectionInfo | undefined {
    return this.bySocket.get(socketId);
  }

  /** Actualiza la sala (gameId) en la que esta el usuario. */
  setGameId(socketId: string, gameId: string | undefined): void {
    const info = this.bySocket.get(socketId);
    if (info) info.gameId = gameId;
  }

  /** Quita la conexion al desconectarse el socket. */
  unregister(socketId: string): ConnectionInfo | undefined {
    const info = this.bySocket.get(socketId);
    this.bySocket.delete(socketId);
    return info;
  }

  /** Devuelve los socketIds asociados a un userId (puede haber varios). */
  socketsForUser(userId: string): string[] {
    const result: string[] = [];
    for (const [socketId, info] of this.bySocket) {
      if (info.userId === userId) result.push(socketId);
    }
    return result;
  }
}
