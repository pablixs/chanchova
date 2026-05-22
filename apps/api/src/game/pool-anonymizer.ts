// Anonimiza los ids de las cartas del pozo central para que el cliente las
// pueda clickear sin filtrar el valor/palo (los ids reales del motor son
// "spanish_classic:7:oros", lo que filtra demasiada info).
//
// Cada vez que se proyecta el estado durante CENTER_GRAB, ensureMapping()
// asigna un id anonimo (estable durante el ciclo de vida del pozo) a cada
// carta real. resolveAnonId() traduce el id anonimo de vuelta al real para
// poder despachar la accion al motor. Cuando el pozo se cierra se limpia.

import { Injectable } from "@nestjs/common";
import { customAlphabet } from "nanoid";

const anon = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 8);

@Injectable()
export class PoolAnonymizer {
  // gameId -> (anonId -> realId)
  private readonly maps = new Map<string, Map<string, string>>();

  /**
   * Sincroniza el mapping con la lista actual de cartas reales en el pozo.
   * Devuelve los anon ids correspondientes (en el mismo orden).
   * Genera nuevos ids anonimos para cartas que no se habian visto, y
   * elimina los que ya no estan en el pozo (se las llevaron jugadores).
   */
  ensureMapping(gameId: string, realIds: string[]): string[] {
    let m = this.maps.get(gameId);
    if (!m) {
      m = new Map();
      this.maps.set(gameId, m);
    }
    // Inverso: realId -> anonId existente
    const realToAnon = new Map<string, string>();
    for (const [a, r] of m) realToAnon.set(r, a);

    const result: string[] = [];
    const stillRealIds = new Set(realIds);
    for (const realId of realIds) {
      let anonId = realToAnon.get(realId);
      if (!anonId) {
        anonId = `anon-${anon()}`;
        m.set(anonId, realId);
      }
      result.push(anonId);
    }
    // Limpiar anons cuyos reales ya no estan
    for (const [a, r] of [...m]) {
      if (!stillRealIds.has(r)) m.delete(a);
    }
    return result;
  }

  /** Traduce un id anonimo al id real, o undefined si no existe. */
  resolveAnonId(gameId: string, anonId: string): string | undefined {
    return this.maps.get(gameId)?.get(anonId);
  }

  /** Limpia todo lo asociado al pozo (al cerrarse o al terminar la partida). */
  clear(gameId: string): void {
    this.maps.delete(gameId);
  }
}
