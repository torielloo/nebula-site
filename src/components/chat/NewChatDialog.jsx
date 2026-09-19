import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ProfileAvatar from "@/components/ProfileAvatar";

export default function NewChatDialog({ open, onOpenChange, onStart }) {
  const [contacts, setContacts] = useState(null);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!open || contacts) return;
    setLoadError("");
    base44.functions.invoke("listChatContacts", {}).then((res) => {
      setContacts((res.data.contacts || []).filter((contact) => contact.id !== "core-os"));
    }).catch(() => {
      setContacts([]);
      setLoadError("Não foi possível carregar os contatos. Feche e tente novamente.");
    });
  }, [open, contacts]);

  const filtered = (contacts || []).filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Buscar usuário..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="scrollbar-thin max-h-64 space-y-1 overflow-y-auto">
          {loadError ? (
            <p role="alert" className="py-6 text-center text-xs text-destructive">{loadError}</p>
          ) : contacts === null ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nenhum usuário encontrado</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onOpenChange(false);
                  onStart(c);
                }}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-accent"
              >
                <ProfileAvatar name={c.name} avatar={c.avatar} size="sm" />
                <span className="truncate text-sm font-semibold">{c.name}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}