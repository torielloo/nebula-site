import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCheck, MessageCircle, Search, ShieldAlert, Filter, Trash2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatLocalDateTime } from "@/lib/time";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { getNotificationSoundPrefs, playNotificationSound, saveNotificationSoundPrefs } from "@/lib/notificationSound";

const TYPES = ["all", "unread", "mention", "verification", "system"];

function groupUserNotifications(list) {
  const groups = new Map();
  for (const item of list) {
    const key = [item.type || "system", item.context_type || "", item.context_id || "", item.title || "", item.actor_user_id || ""].join("|");
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...item, members: [item], groupCount: 1 });
    } else {
      existing.members.push(item);
      existing.groupCount += 1;
      if (new Date(item.created_date || 0).getTime() > new Date(existing.created_date || 0).getTime()) {
        const members = existing.members;
        const groupCount = existing.groupCount;
        Object.assign(existing, item, { members, groupCount });
      }
    }
  }
  return [...groups.values()].map((group) => ({
    ...group,
    groupUnread: group.members.filter((item) => !item.read).length,
  }));
}

export default function UserNotificationBell({ user }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [soundPrefs, setSoundPrefs] = useState(() => getNotificationSoundPrefs("normal"));
  const hiddenIdsRef = useRef(new Set());
  const knownIdsRef = useRef(null);
  const soundPrefsRef = useRef(soundPrefs);

  useEffect(() => {
    soundPrefsRef.current = soundPrefs;
    saveNotificationSoundPrefs("normal", soundPrefs);
  }, [soundPrefs]);

  const load = useCallback(() => {
    if (!user?.id) return Promise.resolve();
    return base44.entities.UserNotification
      .filter({ recipient_user_id: user.id }, "-created_date", 200)
      .then((rows) => {
        const next = (rows || []).filter((item) => item.actor_user_id !== user.id && !hiddenIdsRef.current.has(item.id));
        const ids = new Set(next.map((item) => item.id));
        if (knownIdsRef.current) {
          const hasNewUnread = next.some((item) => !item.read && !knownIdsRef.current.has(item.id));
          if (hasNewUnread && user?.profile?.sounds?.notify !== false) playNotificationSound("normal", soundPrefsRef.current);
        }
        knownIdsRef.current = ids;
        setItems(next);
      })
      .catch(() => {});
  }, [user?.id, user?.profile?.sounds?.notify]);

  useEffect(() => {
    load();
    if (!user?.id) return undefined;
    const unsub = base44.entities.UserNotification.subscribe(() => load());
    const poll = window.setInterval(load, 30000);
    return () => {
      unsub?.();
      window.clearInterval(poll);
    };
  }, [load, user?.id]);

  const unread = items.filter((item) => !item.read).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = items.filter((item) => {
      if (filter === "unread" && item.read) return false;
      if (!["all", "unread"].includes(filter) && item.type !== filter) return false;
      if (q && !`${item.title || ""} ${item.body || ""} ${item.actor_name || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return groupUserNotifications(matching);
  }, [items, query, filter]);

  if (!user?.id) return null;

  const markOne = async (item) => {
    const members = item.members || [item];
    const ids = new Set(members.map((row) => row.id));
    setItems((current) => current.map((row) => ids.has(row.id) ? { ...row, read: true } : row));
    await Promise.all(members.filter((row) => !row.read).map((row) => base44.entities.UserNotification.update(row.id, { read: true }).catch(() => null)));
  };

  const markAll = async () => {
    const unreadItems = items.filter((item) => !item.read);
    setItems((current) => current.map((row) => ({ ...row, read: true })));
    await Promise.all(unreadItems.map((item) => base44.entities.UserNotification.update(item.id, { read: true }).catch(() => null)));
  };

  const dismissAll = async () => {
    if (!items.length) return;
    const snapshot = [...items];
    snapshot.forEach((row) => hiddenIdsRef.current.add(row.id));
    setItems([]);
    await Promise.all(snapshot.map((row) => base44.entities.UserNotification.delete(row.id).catch(() => null)));
  };

  const dismissItem = async (item) => {
    const members = item.members || [item];
    const ids = new Set(members.map((row) => row.id));
    members.forEach((row) => hiddenIdsRef.current.add(row.id));
    setItems((current) => current.filter((row) => !ids.has(row.id)));
    await Promise.all(members.map((row) => base44.entities.UserNotification.delete(row.id).catch(() => null)));
  };

  const ticketTarget = (item) => {
    if (typeof item.context_url === "string" && item.context_url.startsWith("/") && !item.context_url.startsWith("//")) {
      return item.context_url;
    }
    if (item.context_type === "ticket" && item.context_id) return `/tickets?ticket=${encodeURIComponent(item.context_id)}`;
    return null;
  };

  const openItem = async (item) => {
    await markOne(item);
    const target = ticketTarget(item);
    if (target && target.startsWith("/") && !target.startsWith("//")) navigate(target);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full" aria-label={t("notifications.title")}>
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(440px,calc(100vw-1.25rem))] rounded-xl border-border/50 bg-popover/98 p-2 shadow-2xl backdrop-blur-xl">
        <DropdownMenuLabel className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
          <span className="text-xs font-bold">{t("notifications.title")}</span>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={markAll} disabled={!unread} className="h-7 gap-1.5 px-2 text-[11px]">
              <CheckCheck className="h-3.5 w-3.5" /> {t("notifications.mark_all")}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissAll} disabled={!items.length} className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> {t("notifications.clear_all")}
            </Button>
          </div>
        </DropdownMenuLabel>
        <div className="grid gap-2 px-2 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-secondary/30 px-2.5 py-2">
            <button
              type="button"
              onClick={() => setSoundPrefs((current) => ({ ...current, enabled: !current.enabled }))}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-background/60 text-muted-foreground hover:text-foreground"
              aria-label={soundPrefs.enabled ? "Desativar som das notificações" : "Ativar som das notificações"}
            >
              {soundPrefs.enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <span className="shrink-0 text-[10px] font-bold text-muted-foreground">Som</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={soundPrefs.volume}
              onChange={(e) => setSoundPrefs((current) => ({ ...current, volume: Number(e.target.value) }))}
              className="min-w-0 flex-1 accent-primary"
              aria-label="Volume das notificações"
            />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("notifications.search")} className="h-8 pl-8 text-xs" />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {TYPES.map((type) => (
              <button key={type} type="button" onClick={() => setFilter(type)} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold", filter === type ? "border-primary bg-primary text-primary-foreground" : "border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground")}>
                {type === "all" && <Filter className="mr-1 inline h-3 w-3" />}{t(`notifications.${type === "mention" ? "mentions" : type}`)}
              </button>
            ))}
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[min(62vh,540px)] overflow-y-auto pr-1 scrollbar-thin">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("notifications.empty")}</p>
        ) : filtered.slice(0, 24).map((item) => {
          const Icon = item.type === "mention" ? MessageCircle : item.type === "verification" ? ShieldAlert : Bell;
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => openItem(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openItem(item);
                }
              }}
              className="block cursor-pointer rounded-lg p-3 outline-none transition-colors hover:bg-accent focus:bg-accent"
            >
              <div className="flex items-start gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-foreground"><Icon className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-bold">{item.title}</p>
                    {item.groupCount > 1 && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold text-primary">×{item.groupCount}</span>}
                    {item.groupUnread > 0 && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <button type="button" onPointerDown={(e) => { e.stopPropagation(); }} onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissItem(item); }} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={t("notifications.remove")}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{item.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">{formatLocalDateTime(item.created_date)}</p>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
