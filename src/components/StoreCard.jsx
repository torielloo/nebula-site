import { ShoppingBag, ExternalLink } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const STORE_URL = "https://catalog.nebulafn.com/";

/**
 * Card da Loja Nébula (catalog.nebulafn.com): skins com dinheiro real,
 * desbanimentos e outros produtos direto pro jogo.
 */
export default function StoreCard() {
  const { t } = useI18n();
  return (
    <a
      href={STORE_URL}
      target="_blank"
      rel="noreferrer noopener"
      data-store-card
      data-rgb-static
      className="group relative mt-4 block overflow-hidden rounded-xl border border-white/[0.09] bg-[#141414] p-4 !text-white shadow-[0_20px_70px_-56px_rgba(0,0,0,1)] transition-all hover:border-white/20 hover:bg-[#181818]"
    >
      <div className="relative flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-black transition-transform group-hover:scale-105">
          <ShoppingBag className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-wider text-white">{t("store.card_title")}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{t("store.card_desc")}</p>
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-colors group-hover:text-white" />
      </div>
      <span data-rgb-static className="relative mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[11px] font-bold !text-black transition-transform group-hover:scale-[1.01] group-hover:bg-zinc-200">
        <ShoppingBag className="h-3.5 w-3.5" />
        {t("store.card_cta")}
      </span>
    </a>
  );
}