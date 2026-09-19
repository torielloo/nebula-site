import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ProfileAvatar from "@/components/ProfileAvatar";
import { UserPlus, UserMinus, Loader2, Crown, Search } from "lucide-react";
import CopyIdButton from "@/components/CopyIdButton";
import { useI18n } from "@/lib/i18n";
import { isAdminLevel, TEAM_ROLES } from "@/lib/roles";
import { logStaffAction } from "@/lib/ticketMeta";
import { cn } from "@/lib/utils";

const ASSIGNABLE = ["user", "support", "moderator", "admin"];

export default function UsersTab({ users, user, onChanged, mode = "users" }) {
  const { t } = useI18n();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("support");
  const [query, setQuery] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [roleMsg, setRoleMsg] = useState("");
  const [transferBusyId, setTransferBusyId] = useState(null);
  const [transferConfirmId, setTransferConfirmId] = useState(null);
  const [roleOverrides, setRoleOverrides] = useState({});
  const canManage = isAdminLevel(user);
  const assignable = (user && user.role === "owner") ? [...ASSIGNABLE, "dev"] : ASSIGNABLE;

  const invite = async () => {
    const email = inviteEmail.trim();
    if (!email || inviting) return;
    setInviting(true);
    setInviteMsg("");
    try {
      const role = mode === "team" ? inviteRole : "user";
      await base44.users.inviteUser(email, role);
      await logStaffAction(user, "convite_usuario", `Convite enviado para ${email} (${role})`);
      setInviteMsg(t("painel.us_invite_sent", { email }));
      setInviteEmail("");
      await onChanged();
    } catch (e) {
      setInviteMsg(e.message || t("painel.us_invite_fail"));
    } finally {
      setInviting(false);
    }
  };

  const effectiveRole = (u) => roleOverrides[u.id] || u.role || "user";

  const normalizedQuery = query.trim().toLowerCase();
  const visibleUsers = (users || [])
    .filter((u) => mode === "team" ? TEAM_ROLES.includes(effectiveRole(u)) : !TEAM_ROLES.includes(effectiveRole(u)))
    .filter((u) => {
      if (!normalizedQuery) return true;
      const discordId = u?.discord?.id || u?.discord_id || u?.profile?.discord_id || "";
      const username = u?.username || u?.profile?.username || "";
      const haystack = [u?.full_name, u?.email, username, u?.id, discordId].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });

  const changeRole = async (u, role) => {
    if (!canManage || busyId || effectiveRole(u) === role) return;
    if ((role === "admin" || role === "dev") && !window.confirm(t("painel.us_promote_confirm", { name: u.email || u.full_name, role: role.toUpperCase() }))) return;
    setBusyId(u.id);
    setRoleMsg("");
    try {
      setRoleOverrides((current) => ({ ...current, [u.id]: role }));
      const res = await base44.functions.invoke("manageUserRole", { action: "change_role", target_user_id: u.id, role });
      const persistedRole = res?.data?.role || (res?.data?.unchanged ? role : null);
      if (persistedRole !== role) throw new Error("O servidor não confirmou a alteração do cargo.");
      await onChanged();
      setRoleOverrides((current) => {
        const next = { ...current };
        delete next[u.id];
        return next;
      });
      setRoleMsg(t("painel.us_role_updated", { name: u.full_name || u.email, role: t("role." + role) }));
    } catch (e) {
      setRoleOverrides((current) => {
        const next = { ...current };
        delete next[u.id];
        return next;
      });
      setRoleMsg(t("painel.us_role_fail", { name: u.full_name || u.email, reason: e?.message || t("painel.us_retry") }));
    } finally {
      setBusyId(null);
    }
  };

  const removeFromTeam = async (u) => {
    if (!canManage || busyId || !u || u.role === "owner" || u.id === user?.id || u.role === "user") return;
    const target = u.full_name || u.email || u.id;
    if (!window.confirm(t("users.remove_confirm", { name: target }))) return;
    await changeRole(u, "user");
  };

  const transferOwner = async (u) => {
    if (user?.role !== "owner" || transferBusyId || u.id === user.id) return;

    // Primeiro clique apenas arma a ação. É necessário clicar novamente no
    // mesmo usuário antes de abrir as confirmações críticas já existentes.
    if (transferConfirmId !== u.id) {
      setTransferConfirmId(u.id);
      window.setTimeout(() => {
        setTransferConfirmId((current) => current === u.id ? null : current);
      }, 8000);
      return;
    }

    setTransferConfirmId(null);
    const target = u.full_name || u.email || u.id;
    const confirmed = window.confirm(t("users.transfer_confirm", { name: target }));
    if (!confirmed) return;
    const typed = window.prompt(t("users.transfer_prompt"));
    if (typed !== "TRANSFERIR OWNER") return;
    setTransferBusyId(u.id);
    setRoleMsg("");
    try {
      await base44.functions.invoke("manageUserRole", { action: "transfer_owner", target_user_id: u.id });
      setRoleMsg(t("users.transfer_done", { name: target }));
      await onChanged();
      window.setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      setRoleMsg(t("users.transfer_error", { reason: e?.message || t("painel.us_retry") }));
    } finally {
      setTransferBusyId(null);
    }
  };

  return (
    <div>
      <div className="rounded-xl border border-border/40 bg-secondary/40 p-5">
        <h2 className="font-heading text-base font-bold">{mode === "team" ? t("team.invite_title") : t("painel.us_invite_title")}</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder={t("users.email_placeholder")}
            type="email"
            className="flex-1"
          />
          {mode === "team" && (
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {assignable.filter((r) => r !== "user").map((r) => <SelectItem key={r} value={r}>{t("role." + r)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={invite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            {t("painel.us_invite_btn")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{mode === "team" ? t("team.invite_hint") : t("painel.us_invite_hint")}</p>
        {inviteMsg && <p className="mt-1 text-xs text-primary">{inviteMsg}</p>}
      </div>

      {roleMsg && <p className="mt-3 text-xs font-semibold text-primary">{roleMsg}</p>}

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === "team" ? t("team.search_placeholder") : t("users.search_placeholder")} className="pl-9" />
      </div>

      <div className="mt-3 min-w-0 space-y-2">
        {users === null && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
        {users && visibleUsers.length === 0 && <p className="rounded-xl border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">{mode === "team" ? t("team.no_members") : t("users.no_users")}</p>}
        {users &&
          visibleUsers.map((u) => (
            <div key={u.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-secondary/40 p-3 sm:p-4">
              <Link to={`/user/${u.id}`} className="shrink-0 transition-opacity hover:opacity-80">
                <ProfileAvatar name={u.full_name || u.email} avatar={u.profile && u.profile.avatar_url} size="md" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/user/${u.id}`} className="truncate text-sm font-semibold hover:underline">{u.full_name || u.email.split("@")[0]}</Link>
                <div className="flex items-center gap-1"><p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{u.email}</p><CopyIdButton value={u.id} label="ID do usuário" className="h-6 w-6" /></div>
              </div>
              {effectiveRole(u) === "owner" || !canManage || u.id === user?.id || (user?.role === "admin" && ["admin", "dev"].includes(effectiveRole(u))) ? (
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground">
                  {t("role." + effectiveRole(u))}
                </span>
              ) : (
                <>
                  {busyId === u.id && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  <Select value={effectiveRole(u)} onValueChange={(v) => changeRole(u, v)}>
                    <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {assignable.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t("role." + r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              {canManage && u.id !== user?.id && effectiveRole(u) !== "owner" && effectiveRole(u) !== "user" && !(user?.role === "admin" && ["admin", "dev"].includes(effectiveRole(u))) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!busyId || !!transferBusyId}
                  onClick={() => removeFromTeam(u)}
                  className="w-full border-white/15 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground sm:w-auto"
                >
                  <UserMinus className="mr-2 h-4 w-4" />
                  {t("users.remove_team")}
                </Button>
              )}
              {user?.role === "owner" && u.id !== user.id && effectiveRole(u) !== "owner" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!transferBusyId || !!busyId}
                  onClick={() => transferOwner(u)}
                  className={cn("w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 sm:w-auto", transferConfirmId === u.id && "border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/15 hover:text-red-200")}
                >
                  {transferBusyId === u.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />}
                  {transferConfirmId === u.id ? t("users.transfer_owner_confirm_click") : t("users.transfer_owner")}
                </Button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}