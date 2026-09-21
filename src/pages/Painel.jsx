import React, { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard,
  Ticket,
  ClipboardList,
  Gem,
  Flag,
  Bug,
  Undo2,
  Gavel,
  Newspaper,
  ShieldCheck,
  ScrollText,
  BadgeCheck,
  Users,
  UsersRound,
  Cpu,
  BarChart3,
  Bot,
  Loader2,
  ShieldAlert,
  Crown,
  Headphones,
  MessageSquareText,
  Megaphone,
} from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import PageShell from "@/components/PageShell";
import PainelNav from "@/components/painel/PainelNav";
import PainelModeSwitch from "@/components/painel/PainelModeSwitch";
import TabPanel from "@/components/painel/TabPanel";
import PainelHeroVideo from "@/components/painel/PainelHeroVideo";
const OwnerDashboard = lazy(() => import("@/components/painel/OwnerDashboard"));
const StaffDashboard = lazy(() => import("@/components/painel/StaffDashboard"));
const TicketsTab = lazy(() => import("@/components/painel/TicketsTab"));
const ReportsTab = lazy(() => import("@/components/painel/ReportsTab"));
const ErrorCenter = lazy(() => import("@/components/painel/ErrorCenter"));
const LogsTab = lazy(() => import("@/components/painel/LogsTab"));
const UsersTab = lazy(() => import("@/components/painel/UsersTab"));
const TeamTab = lazy(() => import("@/components/painel/TeamTab"));
const SystemTab = lazy(() => import("@/components/painel/SystemTab"));
const NitroRequests = lazy(() => import("@/components/painel/NitroRequests"));
const KanbanTab = lazy(() => import("@/components/painel/KanbanTab"));
const BanRequestsTab = lazy(() => import("@/components/painel/BanRequestsTab"));
const PunishmentsTab = lazy(() => import("@/components/painel/PunishmentsTab"));
const PatchNotesTab = lazy(() => import("@/components/painel/PatchNotesTab"));
const IntegrityTab = lazy(() => import("@/components/painel/IntegrityTab"));
const RolesTab = lazy(() => import("@/components/painel/RolesTab"));
const WeeklyStats = lazy(() => import("@/components/painel/WeeklyStats"));
const CoreOsControl = lazy(() => import("@/components/painel/CoreOsControl"));
const SecurityCenter = lazy(() => import("@/components/painel/SecurityCenter"));
const UserModerationTab = lazy(() => import("@/components/painel/UserModerationTab"));
const CoreOS = lazy(() => import("@/pages/CoreOS"));
const StaffPrivateCall = lazy(() => import("@/components/painel/StaffPrivateCall"));
const OwnerDmAudit = lazy(() => import("@/components/painel/OwnerDmAudit"));
const StaffAnnouncementsTab = lazy(() => import("@/components/painel/StaffAnnouncementsTab"));
import { isStaffUser, isModerator, isAdminLevel, isOwnerOrDev } from "@/lib/roles";
import { useI18n } from "@/lib/i18n";

const TabSpinner = () => <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;

export default function Painel() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") || "visao");
  const isStaff = isStaffUser(user);
  const canModerate = isModerator(user);
  const canManageUsers = isAdminLevel(user);
  const ownerMode = isOwnerOrDev(user) && searchParams.get("view") !== "staff";
  const canSwitchPanels = isOwnerOrDev(user);

  const [tickets, setTickets] = useState(null);
  const [reports, setReports] = useState(null);
  const [users, setUsers] = useState(null);
  const [downloads, setDownloads] = useState(null);
  const [nitroRequests, setNitroRequests] = useState(null);

  const load = async () => {
    const [ticketResponse, nextReports] = await Promise.all([
      base44.functions.invoke("ticketOps", { action: "list_staff_tickets" }),
      canModerate ? base44.entities.Report.list("-created_date", 300) : Promise.resolve([]),
    ]);
    // Usa a consulta administrativa do backend para que Suporte e demais cargos da staff
    // enxerguem a mesma fila completa, incluindo fechados/arquivados.
    // Faz merge por ID em vez de substituir cegamente a lista: se uma resposta
    // transitória vier parcial logo após a criação de um ticket, os cards que já
    // estavam no Kanban não desaparecem.
    const incomingTickets = Array.isArray(ticketResponse?.data?.tickets)
      ? ticketResponse.data.tickets
      : [];
    setTickets((current) => {
      if (!Array.isArray(current) || current.length === 0) return incomingTickets;
      const merged = new Map(current.map((ticket) => [ticket.id, ticket]));
      for (const ticket of incomingTickets) {
        merged.set(ticket.id, { ...(merged.get(ticket.id) || {}), ...ticket });
      }
      return [...merged.values()].sort((a, b) =>
        (new Date(b.created_date || 0).getTime() || 0) - (new Date(a.created_date || 0).getTime() || 0)
      );
    });
    setReports(nextReports);
  };

  const loadUsers = async () => {
    if (!canManageUsers) return;
    try {
      const res = await base44.functions.invoke("manageUserRole", { action: "list_users" });
      setUsers(res?.data?.users || []);
    } catch (error) {
      const fallback = await base44.entities.User.list("-created_date", 500).catch(() => null);
      if (Array.isArray(fallback)) setUsers(fallback);
      else throw error;
    }
  };

  useEffect(() => {
    if (!isStaff) return;
    if (["visao", "tickets", "kanban", "integridade", "denuncias"].includes(tab)) {
      load().catch(() => {
        // Falha temporária não deve apagar o Kanban que já estava carregado.
        setTickets((current) => Array.isArray(current) ? current : []);
        setReports((current) => Array.isArray(current) ? current : []);
      });
    }
    if (canManageUsers && ["visao", "users", "equipe", "semanal"].includes(tab) && users === null) {
      loadUsers().catch(() => setUsers((current) => Array.isArray(current) ? current : []));
    }
    if (ownerMode && ["visao", "semanal"].includes(tab)) {
      if (tab === "visao") {
        if (downloads === null) base44.entities.Download.list("-created_date", 50).then(setDownloads).catch(() => setDownloads([]));
        if (nitroRequests === null) base44.entities.NitroRequest.list("-created_date", 200).then(setNitroRequests).catch(() => setNitroRequests([]));
      }
    }
  }, [isStaff, canModerate, canManageUsers, ownerMode, tab]);

  // Mantém Tickets/Kanban sincronizados sem substituir a lista inteira.
  // Um ticket novo entra por merge; updates preservam os demais cards.
  useEffect(() => {
    if (!isStaff) return;
    const unsubscribe = base44.entities.Ticket.subscribe((event) => {
      const data = event?.data;
      if (!data?.id) return;

      setTickets((current) => {
        if (!Array.isArray(current)) return current;
        if (event.type === "delete") return current.filter((ticket) => ticket.id !== data.id);

        const exists = current.some((ticket) => ticket.id === data.id);
        const next = exists
          ? current.map((ticket) => ticket.id === data.id ? { ...ticket, ...data } : ticket)
          : [data, ...current];

        return next.sort((a, b) =>
          (new Date(b.created_date || 0).getTime() || 0) - (new Date(a.created_date || 0).getTime() || 0)
        );
      });
    });
    return unsubscribe;
  }, [isStaff]);

  const groups = [
    {
      label: t("panel.operation"),
      items: [
        { value: "visao", label: t("painel.nav_visao"), icon: LayoutDashboard },
        { value: "staff-announcements", label: t("painel.nav_staff_announcements"), icon: Megaphone },
        ...(!ownerMode ? [
          { value: "staff-call", label: t("panel.staff_call"), icon: Headphones },
          { value: "core-os", label: t("panel.core_staff"), icon: Bot },
        ] : []),
      ],
    },
    {
      label: t("painel.nav_atendimento"),
      items: [
        { value: "tickets", label: t("painel.nav_tickets"), icon: Ticket },
        { value: "kanban", label: t("painel.nav_kanban"), icon: ClipboardList },
        ...(isStaff ? [{ value: "nitro", label: t("painel.nav_nitro_req"), icon: Gem }] : []),
      ],
    },
    ...(canModerate
      ? [
          {
            label: t("painel.nav_moderacao"),
            items: [
              { value: "usuarios-moderacao", label: t("panel.users_moderation"), icon: UsersRound },
              { value: "denuncias", label: t("painel.nav_denuncias"), icon: Flag },
              { value: "punicoes", label: t("painel.nav_punicoes"), icon: Gavel },
              { value: "desban", label: t("painel.nav_desban"), icon: Undo2 },
              { value: "integridade", label: t("painel.nav_integridade"), icon: ShieldCheck },
              { value: "erros", label: t("painel.nav_erros"), icon: Bug },
            ],
          },
        ]
      : []),
    {
      label: t("painel.nav_gestao"),
      items: [
        ...(canManageUsers ? [
          { value: "users", label: t("painel.nav_users"), icon: Users },
          { value: "equipe", label: t("painel.nav_equipe"), icon: UsersRound },
        ] : []),
        { value: "cargos", label: t("painel.nav_cargos"), icon: BadgeCheck },
        ...(canModerate ? [{ value: "logs", label: t("painel.nav_logs"), icon: ScrollText }] : []),
        ...(canModerate ? [{ value: "noticias", label: t("painel.nav_noticias"), icon: Newspaper }] : []),
      ],
    },
    ...(ownerMode
      ? [
          {
            label: t("painel.nav_owner_center"),
            owner: true,
            items: [
              { value: "seguranca", label: t("panel.security"), icon: ShieldAlert, ownerOnly: true },
              ...(user?.role === "owner" ? [{ value: "mensagens-privadas", label: "Mensagens privadas", icon: MessageSquareText, ownerOnly: true }] : []),
              { value: "sistema", label: t("painel.nav_sistema"), icon: Cpu, ownerOnly: true },
              ...(user?.role === "owner" ? [{ value: "core-os-owner", label: t("panel.core_owner"), icon: Crown, ownerOnly: true }] : []),
              { value: "semanal", label: t("painel.nav_semanal"), icon: BarChart3, ownerOnly: true },
            ],
          },
        ]
      : []),
  ];

  const availableValues = groups.flatMap((g) => g.items.map((i) => i.value));

  const changeTab = (nextTab) => {
    if (!availableValues.includes(nextTab)) return;
    setTab(nextTab);
    const next = new URLSearchParams(searchParams);
    if (nextTab === "visao") next.delete("tab");
    else next.set("tab", nextTab);
    next.delete("ticket");
    setSearchParams(next, { replace: true });
  };

  const openTicketFromPanel = (ticketId) => {
    if (!ticketId || !availableValues.includes("tickets")) return;
    setTab("tickets");
    const next = new URLSearchParams(searchParams);
    next.set("tab", "tickets");
    next.set("ticket", ticketId);
    setSearchParams(next, { replace: true });
  };

  // Sincroniza apenas deep-links externos/Core OS. Depois que o usuário troca de aba,
  // changeTab atualiza a URL e impede que um ?tab=tickets antigo force a volta ao ticket.
  useEffect(() => {
    const requested = searchParams.get("tab");
    if (requested && availableValues.includes(requested) && requested !== tab) setTab(requested);
  }, [searchParams, availableValues.join("|"), tab]);

  // Ao trocar de modo (Owner/Staff), volta para Visão geral se a aba atual não existir mais
  useEffect(() => {
    if (!availableValues.includes(tab)) setTab("visao");
  }, [availableValues.join("|")]);

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-4 font-heading text-lg font-bold">{t("painel.restricted_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("painel.restricted_desc")}</p>
      </div>
    );
  }

  return (
    <PageShell
      label={ownerMode ? t("painel.label_owner") : t("painel.label_staff")}
      title={ownerMode ? t("painel.title_owner") : t("painel.title_staff")}
      subtitle={ownerMode ? t("painel.subtitle_owner") : t("painel.subtitle_staff")}
      actions={
        canSwitchPanels ? (
          <PainelModeSwitch
            ownerMode={ownerMode}
            onChange={(mode) => setSearchParams(mode === "owner" ? { view: "owner" } : { view: "staff" })}
          />
        ) : null
      }
    >
      <div className="mb-6">
        <PainelHeroVideo mode={ownerMode ? "owner" : "staff"} />
      </div>
      <Tabs value={tab} onValueChange={changeTab} className="flex min-w-0 flex-col gap-4 lg:flex-row lg:gap-6">
        <PainelNav
          groups={groups}
          value={tab}
          onSelect={changeTab}
          title={ownerMode ? t("painel.title_owner") : t("painel.title_staff")}
        />

        <div className="min-w-0 flex-1 overflow-x-clip">
          <Suspense fallback={<TabSpinner />}>
          <TabsContent value="visao">
            <TabPanel>
              {tickets && reports ? (
                ownerMode ? (
                  <OwnerDashboard
                    tickets={tickets}
                    reports={reports}
                    users={users || []}
                    downloads={downloads || []}
                    nitroRequests={nitroRequests || []}
                  />
                ) : (
                  <StaffDashboard tickets={tickets} reports={reports} />
                )
              ) : (
                <TabSpinner />
              )}
            </TabPanel>
          </TabsContent>

          <TabsContent value="staff-announcements">
            <TabPanel>
              <StaffAnnouncementsTab user={user} />
            </TabPanel>
          </TabsContent>

          <TabsContent value="tickets">
            <TabPanel>
              {tickets ? <TicketsTab
                tickets={tickets}
                user={user}
                onChanged={load}
                initialTicketId={searchParams.get("ticket")}
                onConsumeInitialTicket={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("ticket");
                  setSearchParams(next, { replace: true });
                }}
              /> : <TabSpinner />}
            </TabPanel>
          </TabsContent>

          <TabsContent value="denuncias">
            <TabPanel>
              {reports ? <ReportsTab reports={reports} user={user} onChanged={load} /> : <TabSpinner />}
            </TabPanel>
          </TabsContent>

          <TabsContent value="erros">
            <TabPanel>
              <ErrorCenter canManage={ownerMode} user={user} />
            </TabPanel>
          </TabsContent>

          <TabsContent value="logs">
            <TabPanel>
              <LogsTab user={user} canSeeAll={ownerMode} />
            </TabPanel>
          </TabsContent>

          <TabsContent value="kanban">
            <TabPanel>
              {tickets ? <KanbanTab tickets={tickets} user={user} onChanged={load} onOpenTicket={openTicketFromPanel} /> : <TabSpinner />}
            </TabPanel>
          </TabsContent>

          <TabsContent value="desban">
            <TabPanel>
              <BanRequestsTab user={user} />
            </TabPanel>
          </TabsContent>

          <TabsContent value="punicoes">
            <TabPanel>
              <PunishmentsTab user={user} />
            </TabPanel>
          </TabsContent>

          <TabsContent value="noticias">
            <TabPanel>
              <PatchNotesTab canManage={ownerMode} user={user} />
            </TabPanel>
          </TabsContent>

          <TabsContent value="integridade">
            <TabPanel>
              <IntegrityTab tickets={tickets} reports={reports} />
            </TabPanel>
          </TabsContent>

          <TabsContent value="cargos">
            <TabPanel>
              <RolesTab />
            </TabPanel>
          </TabsContent>

          {canManageUsers && (
            <TabsContent value="users">
              <TabPanel>
                <UsersTab users={users} user={user} onChanged={loadUsers} />
              </TabPanel>
            </TabsContent>
          )}

          {canManageUsers && (
            <TabsContent value="equipe">
              <TabPanel>
                <TeamTab users={users || []} user={user} onChanged={loadUsers} />
              </TabPanel>
            </TabsContent>
          )}

          {ownerMode && (
            <TabsContent value="sistema">
              <TabPanel>
                <SystemTab user={user} />
              </TabPanel>
            </TabsContent>
          )}

          {ownerMode && (
            <TabsContent value="semanal">
              <TabPanel>
                {users && tickets ? (
                  <WeeklyStats users={users} tickets={tickets} posts={[]} />
                ) : (
                  <TabSpinner />
                )}
              </TabPanel>
            </TabsContent>
          )}

          {isStaff && (
            <TabsContent value="nitro">
              <TabPanel>
                <NitroRequests />
              </TabPanel>
            </TabsContent>
          )}

          {canModerate && (
            <TabsContent value="usuarios-moderacao">
              <TabPanel><UserModerationTab /></TabPanel>
            </TabsContent>
          )}

          {!ownerMode && (
            <TabsContent value="staff-call">
              <TabPanel><StaffPrivateCall /></TabPanel>
            </TabsContent>
          )}

          {!ownerMode && (
            <TabsContent value="core-os">
              <TabPanel><CoreOS mode="staff" /></TabPanel>
            </TabsContent>
          )}

          {ownerMode && user?.role === "owner" && (
            <TabsContent value="mensagens-privadas">
              <TabPanel><OwnerDmAudit /></TabPanel>
            </TabsContent>
          )}

          {ownerMode && user?.role === "owner" && (
            <TabsContent value="core-os-owner">
              <TabPanel><CoreOsControl user={user} /></TabPanel>
            </TabsContent>
          )}

          {ownerMode && (
            <TabsContent value="seguranca">
              <TabPanel><SecurityCenter ownerAI={user?.role === "owner"} /></TabPanel>
            </TabsContent>
          )}
          </Suspense>
        </div>
      </Tabs>
    </PageShell>
  );
}
