import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import ProfileAvatar from "@/components/ProfileAvatar";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UserPicker({ value = "", onChange, onSelect, placeholder = "Buscar usuário...", className, autoFocus = false, searchContext = null, autoSelectNumeric = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const requestRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const q = value.trim();
    if (!q) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const id = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke("userDirectory", {
          action: "search",
          q,
          limit: 8,
          context_type: searchContext?.type,
          context_id: searchContext?.id,
        });
        if (id !== requestRef.current) return;
        const next = res.data?.users || [];
        if (autoSelectNumeric && /^\d{8,22}$/.test(q) && next.length === 1) {
          setItems([]);
          setOpen(false);
          onSelectRef.current?.(next[0]);
          return;
        }
        setItems(next);
        setActive(0);
        setOpen(true);
      } catch {
        if (id === requestRef.current) setItems([]);
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [value, searchContext?.type, searchContext?.id, autoSelectNumeric]);

  const choose = (item) => {
    onSelect?.(item);
    setOpen(false);
    setItems([]);
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((v) => (v + 1) % items.length); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((v) => (v - 1 + items.length) % items.length); }
          if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className="pl-9 pr-9"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {open && (
        <div role="listbox" className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-border/50 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl">
          {items.length === 0 ? (
            <p className="px-3 py-5 text-center text-xs text-muted-foreground">Nenhum usuário encontrado.</p>
          ) : items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active === index}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(item)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", active === index ? "bg-primary/12" : "hover:bg-accent")}
            >
              <ProfileAvatar name={item.name} avatar={item.avatar_url} size="sm" status={item.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{item.username ? `@${item.username}` : item.id}</span>
              </span>
              {item.role && item.role !== "user" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{item.role}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}