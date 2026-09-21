import React from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Sparkles, Download, User as UserIcon, LifeBuoy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";

const ITEMS = [
  { to: "/nitro", label: "explore.nitro", icon: Sparkles },
  { to: "/downloads", label: "explore.downloads", icon: Download },
  { to: "/perfil", label: "explore.profile", icon: UserIcon },
  { to: "/suporte-ia", label: "explore.ia", icon: LifeBuoy },
];

export default function ExploreDropdown() {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground data-[state=open]:bg-white/10 data-[state=open]:text-foreground">
        {t("explore.title")}{" "}
        <ChevronDown className="h-3 w-3 transition-transform duration-300 group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 rounded-2xl border-border/40 bg-popover/70 p-1.5 shadow-[0_12px_48px_-12px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
      >
        <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {t("explore.title")}
          </p>
        {ITEMS.map((item) => (
          <DropdownMenuItem
            key={item.to}
            asChild
            className="group/item rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-200 focus:bg-primary/10 focus:text-foreground data-[highlighted]:translate-x-0.5"
          >
            <Link to={item.to} className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary transition-colors duration-200 group-hover/item:bg-primary/20">
                <item.icon className="h-3.5 w-3.5" />
              </span>
              {t(item.label)}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}