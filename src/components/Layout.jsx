import React, { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import ProfileAvatar from "@/components/ProfileAvatar";
import { Image } from "@/components/ui/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Home as HomeIcon,
  MessageCircle,
  Mail,
  ShieldAlert,
  Ticket,
  ShieldCheck,
  LogOut,
  Settings,
  User as UserIcon,
  ChevronDown,
  Headphones,
  Activity,
  Bot,
  Download,
  Gem,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
const FloatingCallBar = lazy(() => import("@/components/calls/FloatingCallBar"));
const AmbientMusicPlayer = lazy(() => import("@/components/AmbientMusicPlayer"));
const AiSupportButton = lazy(() => import("@/components/AiSupportButton"));
const IncomingPrivateCallOverlay = lazy(() => import("@/components/calls/IncomingPrivateCallOverlay"));
const StaffNotificationBell = lazy(() => import("@/components/StaffNotificationBell"));
const UserNotificationBell = lazy(() => import("@/components/UserNotificationBell"));
const ExploreDropdown = lazy(() => import("@/components/ExploreDropdown"));
import { useIsMobile } from "@/hooks/use-mobile";
import UpdateLock from "@/components/UpdateLock";
import UiStudioProvider, { useUiStudio } from "@/lib/uiStudio/UiStudioContext";
import UiStudioBanner from "@/components/uiStudio/UiStudioBanner";
import UiStudioPanel from "@/components/uiStudio/UiStudioPanel";
import { Palette } from "lucide-react";
import PageTransition from "@/components/motion/PageTransition";
import { isStaffUser, isAdminLevel, isOwnerOrDev } from "@/lib/roles";
import { useI18n } from "@/lib/i18n";
import { displayName } from "@/lib/displayName";
import { VerificationBanner, VerificationBlocked } from "@/components/VerificationAccessNotice";
import SecurityAccessNotice from "@/components/SecurityAccessNotice";
import { SiteConfigProvider, useSiteConfig } from "@/lib/SiteConfigContext";
import { playUiClickSound } from "@/lib/uiClickSound";
import { setNitroCallSoundEnabled } from "@/lib/nitroSoundPreferences";
import NitroCursorEffect from "@/components/nitro/NitroCursorEffect";

function DiscordMark({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M19.54 5.34A16.3 16.3 0 0 0 15.44 4l-.5 1.02a15.1 15.1 0 0 0-5.88 0L8.56 4a16.2 16.2 0 0 0-4.1 1.34C1.86 9.18 1.16 12.92 1.5 16.6a16.5 16.5 0 0 0 5.02 2.54l1.22-1.68c-.67-.25-1.31-.57-1.92-.94l.47-.36c3.7 1.72 7.72 1.72 11.37 0l.47.36c-.61.37-1.26.69-1.93.94l1.22 1.68a16.4 16.4 0 0 0 5.03-2.54c.4-4.27-.68-7.97-2.91-11.26ZM8.3 14.56c-1.1 0-2-1.02-2-2.28s.88-2.28 2-2.28c1.12 0 2.02 1.03 2 2.28 0 1.26-.88 2.28-2 2.28Zm7.4 0c-1.1 0-2-1.02-2-2.28s.88-2.28 2-2.28c1.12 0 2.02 1.03 2 2.28 0 1.26-.88 2.28-2 2.28Z" />
    </svg>
  );
}

const NAV = [
  { key: "home", to: "/", label: "nav.home", icon: HomeIcon, end: true },
  { key: "solucoes", to: "/solucoes", label: "nav.solucoes", icon: ShieldAlert, end: false },
  { key: "tickets", to: "/tickets", label: "nav.tickets", icon: Ticket, end: false },
  { key: "calls", to: "/calls", label: "nav.calls", icon: Headphones, end: false },
  { key: "mensagens", to: "/mensagens", label: "nav.mensagens", icon: Mail, end: false },
];

const BG_PAGES = { "/": "home", "/calls": "calls", "/perfil": "perfil" };

const MOBILE_NAV = [
  { to: "/", label: "nav.home", icon: HomeIcon, end: true },
  { to: "/solucoes", label: "nav.solucoes", icon: ShieldAlert, end: false },
  { to: "/calls", label: "nav.calls", icon: Headphones, end: false },
  { to: "/mensagens", label: "nav.mensagens", icon: MessageCircle, end: false },
];

const MOBILE_MORE_ROUTES = ["/tickets", "/downloads", "/nitro", "/perfil", "/suporte-ia", "/painel", "/core-os"];

const navLinkClass = ({ isActive }) =>
  cn(
    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
    isActive
      ? "border-transparent bg-white/10 text-foreground"
      : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
  );

const mobileLinkClass = ({ isActive }) =>
  cn(
    "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors",
    isActive ? "text-primary" : "text-muted-foreground"
  );

function hexToHslChannels(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function accentToChannels(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return hexToHslChannels(raw);
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(raw)) return raw;
  return null;
}

function lightnessFromChannels(channels) {
  const parts = String(channels || "").match(/^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+(\d+(?:\.\d+)?)%$/);
  return parts ? Number(parts[1]) : 50;
}

export default function Layout() {
  return (
    <SiteConfigProvider>
      <UiStudioProvider>
        <LayoutInner />
      </UiStudioProvider>
    </SiteConfigProvider>
  );
}

function LayoutInner() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const ui = useUiStudio();
  const { config: siteConfig } = useSiteConfig();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [maintenance, setMaintenance] = useState(null);
  const [bypassed, setBypassed] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [verificationState, setVerificationState] = useState(null);
  const [securityAccess, setSecurityAccess] = useState(null);

  useEffect(() => {
    const handleClick = (event) => {
      const target = event.target instanceof Element ? event.target.closest("button,[role=\"button\"],[role=\"menuitem\"],[role=\"option\"],[role=\"switch\"],[role=\"tab\"],[role=\"checkbox\"],a[href],summary,input[type=\"checkbox\"],input[type=\"radio\"],input[type=\"range\"],select,label[for],[data-clickable],[class*=\"cursor-pointer\"]") : null;
      if (!target || target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true" || target.closest("[data-no-click-sound]")) return;
      playUiClickSound();
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  // Esconde a barra ao rolar para baixo; mostra ao rolar para cima
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setNavHidden(y > lastY && y > 64);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const profile = (user && user.profile) || {};
  const nitroVisualActive = ui.nitroActive === true;

  useEffect(() => {
    setNitroCallSoundEnabled(nitroVisualActive ? profile?.sounds?.call !== false : true);
  }, [nitroVisualActive, profile?.sounds?.call]);

  useEffect(() => {
    base44.entities.SystemSetting.list()
      .then((l) => setMaintenance(l[0] || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const refresh = () => base44.functions.invoke("manageVerification", { action: "my_status" })
      .then((res) => { if (active) setVerificationState(res.data || null); })
      .catch(() => { if (active) setVerificationState(null); });
    refresh();
    const unsub = base44.entities.VerificationCase?.subscribe
      ? base44.entities.VerificationCase.subscribe((event) => {
          if (event?.data?.user_id === user.id) refresh();
        })
      : null;
    return () => { active = false; if (typeof unsub === "function") unsub(); };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setSecurityAccess(null);
      return undefined;
    }
    let active = true;
    const refreshSecurityAccess = () => base44.functions.invoke("securityAccessState", {})
      .then((res) => { if (active) setSecurityAccess(res.data || res || null); })
      .catch(() => {});
    refreshSecurityAccess();
    const poll = window.setInterval(refreshSecurityAccess, 15000);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [user?.id]);
  const rawAccentValue = (nitroVisualActive ? profile.accent : null) || siteConfig.theme?.accent || null;
  const gamerRgbActive = nitroVisualActive && ui.config.themePreset === "gamer";
  const legacyRedDefault =
    !(nitroVisualActive && profile.accent_source) &&
    !ui.config.themePreset &&
    typeof rawAccentValue === "string" &&
    /^#?ff263b$/i.test(rawAccentValue.trim());
  const accentValue = legacyRedDefault ? null : rawAccentValue;
  const accentChannels = accentToChannels(accentValue);
  // No Gamer RGB o accent estático é neutralizado visualmente para não misturar
  // rosa/roxo fixo com o ciclo RGB. A preferência salva do usuário não é apagada:
  // ela volta automaticamente ao sair do preset Gamer.
  const effectiveAccent = gamerRgbActive ? "0 0% 96%" : accentChannels;
  const primaryForeground = effectiveAccent
    ? (lightnessFromChannels(effectiveAccent) >= 58 ? "0 0% 4%" : "0 0% 98%")
    : null;
  const presetSecondary =
    ui.config.themePreset === "cyber-red"
      ? (accentChannels || "352 100% 57%")
      : ui.config.themePreset === "minimal-ios"
        ? (accentChannels || "214 29% 65%")
        : null;
  const secondaryChannels =
    presetSecondary
    || accentToChannels(nitroVisualActive ? profile.accent_2 : null)
    || accentChannels
    || "0 0% 72%";
  const accentStyle = (effectiveAccent || secondaryChannels)
    ? {
        ...(effectiveAccent ? { "--primary": effectiveAccent, "--ring": effectiveAccent, "--primary-foreground": primaryForeground } : {}),
        "--nitro-secondary": secondaryChannels,
      }
    : undefined;
  const isAdmin = isAdminLevel(user);
  const staffMenu = isStaffUser(user);
  const name = displayName(user);
  const activeVerification = verificationState?.restricted ? verificationState.case : null;
  const verificationRestrictions = activeVerification?.restrictions || {};
  const routeRestricted = !!activeVerification && (
    (location.pathname.startsWith("/mensagens") && verificationRestrictions.messages) ||
    (location.pathname.startsWith("/calls") && verificationRestrictions.interactions)
  );
  const restrictedReason = location.pathname.startsWith("/mensagens")
    ? "O envio de mensagens está temporariamente restrito durante a verificação da conta."
    : "Calls e interações em tempo real estão temporariamente restritas durante a verificação da conta.";
  const navItems = [
    ...NAV.map((item, i) => {
      const globalEdit = (siteConfig.nav || {})[item.key] || {};
      const personalEdit = ui.element(`nav.${item.key}`);
      const hidden = personalEdit.hidden !== undefined ? !!personalEdit.hidden : !!globalEdit.hidden;
      const ord = personalEdit.order !== undefined ? personalEdit.order : (globalEdit.order !== undefined ? globalEdit.order : i);
      return { ...item, label: personalEdit.label || globalEdit.label || t(item.label), ord, hidden };
    }),
    ...(siteConfig.pages || [])
      .filter((page) => page && page.enabled !== false && page.show_in_nav)
      .map((page, index) => ({
        key: `managed-${page.slug}`,
        to: `/p/${page.slug}`,
        label: page.nav_label || page.title || page.slug,
        icon: Activity,
        end: false,
        ord: Number.isFinite(Number(page.order)) ? Number(page.order) : 100 + index,
        hidden: false,
      })),
  ]
    .filter((it) => !it.hidden)
    .sort((a, b) => a.ord - b.ord);

  return (
    <div style={accentStyle} className={cn("min-h-screen overflow-x-clip bg-background font-body text-foreground", gamerRgbActive && "ui-theme-gamer-rgb", nitroVisualActive && profile.theme === "nebula_nitro" && "nitro-theme", ui.editMode && "ui-editing")}>

      <SecurityAccessNotice state={securityAccess} onLogout={() => logout()} />

      {(() => {
        const pageBg = ui.config.backgrounds ? ui.config.backgrounds[BG_PAGES[location.pathname]] : null;
        const siteBg = pageBg || (nitroVisualActive ? profile.background_url : "") || siteConfig.theme?.background_url;
        return siteBg ? (
          <>
            <div className="fixed inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: `url(${siteBg})` }} />
            <div className="fixed inset-0 -z-10 bg-background/85" />
          </>
        ) : null;
      })()}

      <motion.header
        initial={{ y: -18, opacity: 0 }}
        animate={{ y: navHidden && !ui.editMode ? "-130%" : 0, opacity: navHidden && !ui.editMode ? 0 : 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="safe-area-top sticky top-0 z-40 border-b border-white/[0.055] bg-[#030303]/88 px-2 pb-0.5 shadow-[0_12px_40px_-34px_rgba(0,0,0,1)] backdrop-blur-2xl sm:px-4"
      >
        <div className="relative mx-auto flex h-12 w-full max-w-[1600px] items-center gap-1.5 px-0 sm:h-14 sm:gap-3 sm:px-2 md:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="Nébula OS — início">
            <div className="nebula-glow-sm h-10 w-10 shrink-0 overflow-hidden rounded-full sm:h-12 sm:w-12">
              <Image
                src={siteConfig.brand?.logo_url || "https://media.base44.com/images/public/6aa87196309472108abb65fb/8eaf849a6_NEBULAV2.png"}
                alt={siteConfig.brand?.name || "Nébula OS"}
                fittingType="fit"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="hidden leading-tight sm:block">
              <strong className="font-heading text-base font-extrabold tracking-[0.18em]">{siteConfig.brand?.name || "NÉBULA OS"}</strong>
              <small className="block text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{siteConfig.brand?.tagline || t("layout.tagline")}</small>
            </div>
          </Link>

          <nav className="mx-auto hidden items-center gap-1 rounded-full px-2 py-0.5 lg:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navLinkClass}
                data-ui-key={`nav.${item.key}`}
                data-ui-selected={ui.selectedKey === `nav.${item.key}` || undefined}
                onClick={ui.playClick}
              >
                <item.icon className="gamer-nav-icon h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            ))}
            <Suspense fallback={null}><ExploreDropdown /></Suspense>
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <Suspense fallback={null}><UserNotificationBell user={user} /></Suspense>
            {staffMenu && <Suspense fallback={null}><StaffNotificationBell user={user} /></Suspense>}
            <a
              href="https://discord.gg/nebulaogfn"
              target="_blank"
              rel="noreferrer"
              className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[#5865F2]/40 bg-[#5865F2]/10 px-3 py-1.5 text-xs font-semibold text-[#cfd3ff] transition-colors hover:border-[#5865F2]/70 hover:bg-[#5865F2]/20 hover:text-white sm:flex"
              aria-label="Entrar no Discord do Nébula OS"
              title="Entrar no Discord do Nébula OS"
            >
              <DiscordMark className="h-3.5 w-3.5" />
              Discord
            </a>
            <Link
              to="/nitro"
              className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border/40 hover:text-foreground sm:flex"
            >
              <Gem className="h-3.5 w-3.5" />
              Nitro
            </Link>
            {ui.nitroStatus === "ready" && ui.nitroActive && (
              <button
                onClick={() => void ui.openEditor()}
                className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border/40 hover:text-foreground sm:flex"
                aria-label="Editar UI"
                title="Editar UI"
              >
                <Palette className="h-3.5 w-3.5" />
                {t("layout.edit_ui")}
              </button>
            )}
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:flex">
              <Activity className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              {t("layout.status")}
            </span>
            <Link
              to="/perfil"
              className="hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground sm:flex"
            >
              <Settings className="h-3.5 w-3.5" />
              {t("layout.settings")}
            </Link>
            {staffMenu && (
              <div className="hidden md:block">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-primary/90 transition-colors hover:bg-primary/10">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t("layout.staff")}
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-2xl border-border/40 bg-popover/70 backdrop-blur-2xl shadow-[0_12px_48px_-12px_rgba(0,0,0,0.85)] [&_a]:flex [&_a]:items-center [&_a]:gap-2">
                  {isOwnerOrDev(user) && (
                    <DropdownMenuItem asChild>
                      <Link to="/painel?view=owner">{t("layout.owner_panel")}</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/painel?view=staff">{t("layout.staff_panel")}</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            )}
            <Link to="/perfil" className="flex shrink-0 items-center gap-2 rounded-full bg-card px-1 py-1.5 transition-colors sm:px-2">
              <ProfileAvatar name={name} avatar={profile.avatar_url} size="sm" status={profile.status} frame={nitroVisualActive ? profile.frame : ""} customFrameUrl={nitroVisualActive ? profile.custom_frame_url : ""} />
              <span className="hidden max-w-[110px] truncate text-xs font-semibold md:block">{name}</span>
            </Link>
            <button
              onClick={() => logout()}
              className="hidden h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:grid"
              aria-label={t("layout.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.header>

      {siteConfig.announcement?.enabled && siteConfig.announcement?.text ? (
        <div className="border-b border-primary/20 bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary">
          {siteConfig.announcement.text}
        </div>
      ) : null}

      {maintenance && maintenance.maintenance_mode && !bypassed && (
        <UpdateLock
          message={maintenance.maintenance_message}
          version={maintenance.current_version}
          canBypass={isAdmin}
          onBypass={() => setBypassed(true)}
        />
      )}

      <main className="mx-auto w-full max-w-[1600px] px-4 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-6 md:pb-12">
        {activeVerification && location.pathname !== "/verificacao" && <VerificationBanner item={activeVerification} />}
        <PageTransition>
          {routeRestricted ? <VerificationBlocked item={activeVerification} reason={restrictedReason} /> : <Outlet />}
        </PageTransition>
      </main>

      <footer className="border-t border-white/[0.06] px-4 py-5 text-[11px] font-medium text-muted-foreground md:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
          <span>Todos os direitos reservados para Nebulaticos PinguTn e 24kMurilo</span>
          <Link to="/termos-de-servico" className="rounded-full px-3 py-1.5 transition-colors hover:bg-white/[0.05] hover:text-foreground">
            {t("layout.terms")}
          </Link>
        </div>
      </footer>

      {ui.nitroActive && <UiStudioBanner />}
      {ui.nitroActive && <UiStudioPanel />}
      <NitroCursorEffect effect={ui.nitroActive ? (profile.cursor_effect || "none") : "none"} />

      <Suspense fallback={null}><FloatingCallBar /></Suspense>
      <Suspense fallback={null}><AmbientMusicPlayer /></Suspense>
      <Suspense fallback={null}><IncomingPrivateCallOverlay /></Suspense>

      <nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#050505]/94 backdrop-blur-2xl md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
          {MOBILE_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={mobileLinkClass}>
              <item.icon className="h-5 w-5" />
              {t(item.label)}
            </NavLink>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors",
                MOBILE_MORE_ROUTES.some((route) => location.pathname.startsWith(route)) ? "text-primary" : "text-muted-foreground"
              )}
              aria-label={t("nav.more")}
            >
              <MoreHorizontal className="h-5 w-5" />
              {t("nav.more")}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={12} className="w-[min(16rem,calc(100vw-1rem))] rounded-2xl border-border/40 bg-popover/95 p-1.5 shadow-[0_18px_55px_-18px_rgba(0,0,0,0.95)] backdrop-blur-xl">
              {staffMenu && <DropdownMenuItem asChild><Link to="/painel?view=staff" className="flex items-center gap-2 rounded-xl"><ShieldCheck className="h-4 w-4" />{t("layout.staff_panel")}</Link></DropdownMenuItem>}
              {isOwnerOrDev(user) && <DropdownMenuItem asChild><Link to="/painel?view=owner" className="flex items-center gap-2 rounded-xl"><ShieldCheck className="h-4 w-4" />{t("layout.owner_panel")}</Link></DropdownMenuItem>}
              {ui.nitroStatus === "ready" && ui.nitroActive && (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void ui.openEditor();
                  }}
                  className="flex items-center gap-2 rounded-xl"
                >
                  <Palette className="h-4 w-4" />
                  {t("layout.edit_ui")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild><Link to="/tickets" className="flex items-center gap-2 rounded-xl"><Ticket className="h-4 w-4" />{t("nav.tickets")}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/downloads" className="flex items-center gap-2 rounded-xl"><Download className="h-4 w-4" />{t("explore.downloads")}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/nitro" className="flex items-center gap-2 rounded-xl"><Gem className="h-4 w-4" />{t("explore.nitro")}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/perfil" className="flex items-center gap-2 rounded-xl"><UserIcon className="h-4 w-4" />{t("nav.perfil")}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/suporte-ia" className="flex items-center gap-2 rounded-xl"><Bot className="h-4 w-4" />{t("explore.ia")}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="https://discord.gg/nebulaogfn" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl">
                  <DiscordMark className="h-4 w-4" />Discord
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      <Suspense fallback={null}><AiSupportButton /></Suspense>
    </div>
  );
}
