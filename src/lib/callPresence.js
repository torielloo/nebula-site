import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Observa a presença de uma sala de voz SEM entrar na call: abre uma
 * conexão "observador" (id `obs:`) na sala do actor e recebe o roster
 * em tempo real. Uma única conexão por sala é compartilhada entre todos
 * os componentes interessados (cards, sidebars, banners).
 *
 * Auto-cura: se nenhuma mensagem chega por alguns segundos (conexão morta em
 * silêncio), a conexão é refeita e o roster volta a ser a verdade do
 * servidor — evita "usuários fantasmas" congelados na interface.
 */
class CallPresenceWatcher {
  constructor() {
    this.rooms = new Map(); // code -> { room, roster, cbs, lastMsg, timer }
  }

  watch(code, cb) {
    let entry = this.rooms.get(code);
    if (!entry) {
      entry = { room: null, roster: [], cbs: new Set(), lastMsg: Date.now(), timer: null };
      this.rooms.set(code, entry);

      const onMsg = (msg) => {
        entry.lastMsg = Date.now();
        if ((msg.type === "presence" || msg.type === "roster") && Array.isArray(msg.users)) {
          entry.roster = msg.users.filter((u) => !String(u?.id || u?.user_id || "").startsWith("obs:"));
          entry.cbs.forEach((c) => c(entry.roster));
        }
      };
      const connect = () => {
        try {
          entry.room = base44.actors.CallRoom(code).connect({ id: `obs:${crypto.randomUUID()}` });
          entry.room.subscribe(onMsg);
        } catch {
          /* tenta de novo no próximo ciclo */
        }
      };

      connect();
      entry.timer = setInterval(() => {
        if (Date.now() - entry.lastMsg > 8000) {
          try {
            if (entry.room) entry.room.close();
          } catch {
            /* já fechada */
          }
          entry.lastMsg = Date.now();
          connect();
        }
      }, 2500);
    }
    entry.cbs.add(cb);
    cb(entry.roster);
    return () => {
      entry.cbs.delete(cb);
      if (entry.cbs.size === 0) {
        if (entry.timer) clearInterval(entry.timer);
        try {
          if (entry.room) entry.room.close();
        } catch {
          /* já fechada */
        }
        this.rooms.delete(code);
      }
    };
  }
}

export const callPresence = new CallPresenceWatcher();

/** Hook: roster ao vivo (nome, avatar, frame, mic/cam) de uma sala de voz. */
export function useCallPresence(code) {
  const [roster, setRoster] = useState([]);
  useEffect(() => {
    if (!code) return undefined;
    return callPresence.watch(code, setRoster);
  }, [code]);
  return roster;
}