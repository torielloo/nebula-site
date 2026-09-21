import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CheckCheck, Search, ShieldAlert, Siren, Trash2, Volume2, VolumeX } from "lucide-react";
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
import { isStaffUser } from "@/lib/roles";
import { useI18n } from "@/lib/i18n";
import { getNotificationSoundPrefs, playNotificationSound, saveNotificationSoundPrefs } from "@/lib/notificationSound";

const severity = {
  critical: "bg-white text-black",
  warning: "bg-amber-500 text-black",
  notice: "bg-white text-black",
  info: "bg-secondary text-muted-foreground",
};
const FILTERS = ["all", "unread", "critical", "warning", "support", "security", "system"];

function groupStaffNotifications(list, userId) {
  const groups = new Map();
  for (const item of list) {
    const key = [item.category || "other", item.severity || "info", item.title || "", item.action_url || ""].join("|");
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
    groupUnread: group.members.filter((item) => !(item.read_by || []).includes(userId)).length,
  }));
}

export default function StaffNotificationBell({ user }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [soundPrefs, setSoundPrefs] = useState(() => getNotificationSoundPrefs("core"));
  const hiddenIdsRef = useRef(new Set());
  const knownIdsRef = useRef(null);
  const soundPrefsRef = useRef(soundPrefs);

  useEffect(() => {
    soundPrefsRef.current = soundPrefs;
    saveNotificationSoundPrefs("core", soundPrefs);
  }, [soundPrefs]);

  const load = useCallback(() => {
    if (!isStaffUser(user)) return Promise.resolve();
    return base44.entities.CoreOsNotification
      .list("-created_date", 250)
      .then((rows) => {
        const next = (rows || []).filter((row) => (row.audience_ids || []).includes(user.id) && !(row.dismissed_by || []).includes(user.id) && !hiddenIdsRef.current.has(row.id) && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()));
        const ids = new Set(next.map((item) => item.id));
        if (knownIdsRef.current) {
          const hasNewUnread = next.some((item) => !(item.read_by || []).includes(user.id) && !knownIdsRef.current.has(item.id));
          if (hasNewUnread && user?.profile?.sounds?.notify !== false) playNotificationSound("core", soundPrefsRef.current);
        }
        knownIdsRef.current = ids;
        setItems(next);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    load();
    if (!isStaffUser(user)) return undefined;
    const unsubscribe = base44.entities.CoreOsNotification.subscribe(() => load());
    const poll = window.setInterval(load, 20000);
    return () => {
      unsubscribe?.();
      window.clearInterval(poll);
    };
  }, [load, user]);

  const unread = items.filter((item) => !(item.read_by || []).includes(user.id)).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = items.filter((item) => {
      const read = (item.read_by || []).includes(user.id);
      if (filter === "unread" && read) return false;
      if (["critical", "warning"].includes(filter) && item.severity !== filter) return false;
      if (["support", "security", "system"].includes(filter) && item.category !== filter) return false;
      if (q && !`${item.title || ""} ${item.body || ""} ${item.source || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return groupStaffNotifications(matching, user.id);
  }, [items, query, filter, user.id]);

  if (!isStaffUser(user)) return null;

  const markRead = async (item) => {
    const members = item.members || [item];
    const ids = new Set(members.map((row) => row.id));
    setItems((current) => current.map((row) => ids.has(row.id) ? { ...row, read_by: [...new Set([...(row.read_by || []), user.id])] } : row));
    await Promise.all(members.map((row) => {
      if ((row.read_by || []).includes(user.id)) return Promise.resolve();
      const readBy = [...new Set([...(row.read_by || []), user.id])];
      return base44.entities.CoreOsNotification.update(row.id, { read_by: readBy }).catch(() => null);
    }));
  };

  const markAll = async () => {
    const unreadItems = items.filter((item) => !(item.read_by || []).includes(user.id));
    setItems((current) => current.map((row) => ({ ...row, read_by: [...new Set([...(row.read_by || []), user.id])] })));
    await Promise.all(unreadItems.map((item) => {
      const readBy = [...new Set([...(item.read_by || []), user.id])];
      return base44.entities.CoreOsNotification.update(item.id, { read_by: readBy }).catch(() => null);
    }));
  };

  const dismissAll = async () => {
    if (!items.length) return;
    const snapshot = [...items];
    snapshot.forEach((item) => hiddenIdsRef.current.add(item.id));
    setItems([]);
    await Promise.all(snapshot.map((item) => {
      const dismissedBy = [...new Set([...(item.dismissed_by || []), user.id])];
      return base44.entities.CoreOsNotification.update(item.id, { dismissed_by: dismissedBy }).catch(() => null);
    }));
  };

  const dismissItem = async (item) => {
    const members = item.members || [item];
    const ids = new Set(members.map((row) => row.id));
    members.forEach((row) => hiddenIdsRef.current.add(row.id));
    setItems((current) => current.filter((row) => !ids.has(row.id)));
    await Promise.all(members.map((row) => {
      const dismissedBy = [...new Set([...(row.dismissed_by || []), user.id])];
      return base44.entities.CoreOsNotification.update(row.id, { dismissed_by: dismissedBy }).catch(() => null);
    }));
  };

  const openItem = async (item) => {
    await markRead(item);
    if (typeof item.action_url === "string" && item.action_url.startsWith("/") && !item.action_url.startsWith("//")) {
      const target = user?.role === "owner" ? item.action_url.replace("view=staff", "view=owner") : item.action_url;
      navigate(target);
      setOpen(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full" aria-label="Core OS">
          <ShieldAlert className="h-4 w-4" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[9px] font-bold text-black">{unread > 99 ? "99+" : unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(460px,calc(100vw-1.25rem))] rounded-xl border-border/50 bg-popover/98 p-2 shadow-2xl backdrop-blur-xl">
        <DropdownMenuLabel className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
          <span className="flex items-center gap-2 text-xs font-bold"><ShieldAlert className="h-3.5 w-3.5" />Core OS</span>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={markAll} disabled={!unread} className="h-7 gap-1 px-2 text-[10px]"><CheckCheck className="h-3.5 w-3.5" /> {t("notifications.mark_all")}</Button>
            <Button size="sm" variant="ghost" onClick={dismissAll} disabled={!items.length} className="h-7 gap-1 px-2 text-[10px] text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> {t("notifications.clear_all")}</Button>
          </div>
        </DropdownMenuLabel>
        <div className="grid gap-2 px-2 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-secondary/30 px-2.5 py-2">
            <button
              type="button"
              onClick={() => setSoundPrefs((current) => ({ ...current, enabled: !current.enabled }))}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-background/60 text-muted-foreground hover:text-foreground"
              aria-label={soundPrefs.enabled ? "Desativar som do Core OS" : "Ativar som do Core OS"}
            >
              {soundPrefs.enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <span className="shrink-0 text-[10px] font-bold text-muted-foreground">Som Core OS</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={soundPrefs.volume}
              onChange={(e) => setSoundPrefs((current) => ({ ...current, volume: Number(e.target.value) }))}
              className="min-w-0 flex-1 accent-white"
              aria-label="Volume das notificações Core OS"
            />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("staff_notifications.search")} className="h-8 pl-8 text-xs" />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {FILTERS.map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold", filter === value ? "border-white bg-white text-black" : "border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground")}>{value === "all" ? t("notifications.all") : value === "unread" ? t("notifications.unread") : t(`staff_notifications.${value}`)}</button>)}
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[min(62vh,560px)] overflow-y-auto pr-1 scrollbar-thin">
        {filtered.length === 0 ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("staff_notifications.empty")}</p> : filtered.slice(0, 24).map((item) => {
          const read = item.groupUnread === 0;
          return <div
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
              <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", severity[item.severity] || severity.info)}><Siren className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2"><p className="min-w-0 flex-1 truncate text-xs font-bold">{item.title}</p>{item.groupCount > 1 && <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-extrabold text-foreground">×{item.groupCount}</span>}{!read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-white" />}<button type="button" onPointerDown={(e) => { e.stopPropagation(); }} onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissItem(item); }} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={t("staff_notifications.remove")}><Trash2 className="h-3.5 w-3.5" /></button></div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{item.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground/70">{["support", "security", "system"].includes(item.category) ? t(`staff_notifications.${item.category}`) : item.category} · {formatLocalDateTime(item.created_date)}</p>
              </div>
            </div>
          </div>;
        })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
