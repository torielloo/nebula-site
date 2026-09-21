import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import ImageEditorDialog from "@/components/media/ImageEditorDialog";
import { Loader2, Plus, Sticker as StickerIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Painel de figurinhas do usuário: coleção pessoal + criação
 * de novas figurinhas (recorte quadrado via editor de imagem).
 */
export default function StickerPicker({ me, onSend }) {
  const [open, setOpen] = useState(false);
  const [stickers, setStickers] = useState(null);
  const [creating, setCreating] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open || stickers !== null) return;
    base44.entities.Sticker
      .filter({ author_id: me.id }, "-created_date", 60)
      .then((list) => setStickers(list))
      .catch(() => setStickers([]));
  }, [open, me.id]);

  const createSticker = async (file) => {
    setCreating(true);
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      const sticker = await base44.entities.Sticker.create({
        name: (file.name.replace(/\.[^.]+$/, "") || "Figurinha").slice(0, 40),
        image_url: res.file_url,
        author_id: me.id,
        author_name: me.name,
      });
      setStickers((prev) => (prev ? [sticker, ...prev] : [sticker]));
    } finally {
      setCreating(false);
    }
  };

  const removeSticker = async (sticker) => {
    await base44.entities.Sticker.delete(sticker.id);
    setStickers((prev) => (prev || []).filter((s) => s.id !== sticker.id));
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Figurinhas"
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-primary",
          open && "border-primary/60 text-primary"
        )}
        aria-label="Figurinhas"
      >
        <StickerIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-72 rounded-2xl border border-border/60 bg-popover p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Minhas figurinhas
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={creating}
              className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Criar
            </button>
          </div>

          {stickers === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : stickers.length === 0 ? (
            <div className="py-6 text-center">
              <StickerIcon className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-xs font-semibold">Nenhuma figurinha</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Envie uma imagem e recorte em quadrado para criar.
              </p>
            </div>
          ) : (
            <div className="scrollbar-thin mt-2 grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
              {stickers.map((st) => (
                <div key={st.id} className="group relative">
                  <button
                    onClick={() => {
                      onSend(st);
                      setOpen(false);
                    }}
                    title={st.name}
                    className="grid h-16 w-full place-items-center overflow-hidden rounded-lg border border-border/40 bg-card/60 transition-colors hover:border-primary/60"
                  >
                    <Image
                      src={st.image_url}
                      alt={st.name}
                      fittingType="fit"
                      className="h-full w-full object-contain p-1"
                    />
                  </button>
                  <button
                    onClick={() => removeSticker(st)}
                    title="Excluir figurinha"
                    className="absolute -right-1 -top-1 hidden h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground group-hover:grid"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const input = e.target;
          const file = input.files && input.files[0];
          input.value = "";
          if (file) setPendingImage(file);
        }}
      />

      <ImageEditorDialog
        file={pendingImage}
        open={!!pendingImage}
        onOpenChange={(o) => !o && setPendingImage(null)}
        defaultAspect={1}
        onConfirm={createSticker}
      />
    </div>
  );
}