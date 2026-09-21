import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

const normalize = (value) => String(value || "").toLocaleLowerCase("pt-BR");

export default function useMentionComposer({ value, onChange, scopeUsers = null, limit = 8, maxSelected = 5, searchContextType = "", searchContextId = "" }) {
  const [query, setQuery] = useState(null);
  const [remote, setRemote] = useState([]);
  const [selected, setSelected] = useState([]);
  const [active, setActive] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (query === null || Array.isArray(scopeUsers)) return;
    const id = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      try {
        let res;
        if (searchContextType === "ticket" && !String(query || "").trim() && searchContextId) {
          res = await base44.functions.invoke("userDirectory", { action: "ticket_directory", context_id: searchContextId });
        } else {
          res = await base44.functions.invoke("userDirectory", {
            action: "search",
            q: query || "a",
            limit,
            ...(searchContextType ? { context_type: searchContextType } : {}),
            ...(searchContextId ? { context_id: searchContextId } : {}),
          });
        }
        if (id === requestRef.current) setRemote(res.data?.users || []);
      } catch {
        if (id === requestRef.current) setRemote([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, scopeUsers, limit, searchContextType, searchContextId]);

  const matches = useMemo(() => {
    if (query === null) return [];
    const source = Array.isArray(scopeUsers) ? scopeUsers : remote;
    const q = normalize(query);
    return source.filter((user) => normalize(`${user.name || ""} ${user.username || ""}`).includes(q)).slice(0, limit);
  }, [query, scopeUsers, remote, limit]);

  useEffect(() => { setActive(0); }, [query]);

  const update = (next) => {
    onChange?.(next);
    // Aceita nomes completos com espaço (ex.: @Bernardo 3) e mantém
    // o menu aberto enquanto o usuário digita a menção no fim da linha.
    const match = String(next).match(/@([^@\n]*)$/u);
    setQuery(match ? match[1].trimStart() : null);
    setSelected((items) => items.filter((item) => String(next).includes(`@${item.name}`)));
  };

  const pick = (user) => {
    if (!user?.id) return;
    const name = String(user.name || user.username || "usuario").trim().replace(/\s+/g, " ");
    onChange?.(String(value || "").replace(/@[^@\n]*$/u, `@${name} `));
    setSelected((items) => {
      if (items.some((item) => item.id === user.id)) return items;
      if (items.length >= maxSelected) return items;
      return [...items, { id: user.id, name }];
    });
    setQuery(null);
  };

  const keyDown = (event, submit) => {
    if (query !== null && matches.length) {
      if (event.key === "ArrowDown") { event.preventDefault(); setActive((v) => (v + 1) % matches.length); return true; }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((v) => (v - 1 + matches.length) % matches.length); return true; }
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); pick(matches[active]); return true; }
      if (event.key === "Escape") { event.preventDefault(); setQuery(null); return true; }
    }
    if (event.key === "Escape" && query !== null) { setQuery(null); return true; }
    if (event.key === "Enter" && !event.shiftKey && submit) { event.preventDefault(); submit(); return true; }
    return false;
  };

  return {
    query,
    open: query !== null,
    matches,
    active,
    setActive,
    update,
    pick,
    keyDown,
    mentionedUsers: selected.filter((item) => String(value || "").includes(`@${item.name}`)),
    mentionedUserIds: selected.filter((item) => String(value || "").includes(`@${item.name}`)).map((item) => item.id),
    clear: () => { setQuery(null); setRemote([]); setSelected([]); setActive(0); },
  };
}
