import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { Check, X, Loader2, ExternalLink, Copy, Gift, RefreshCw, Ban, Search, Pencil, Save, Trash2, RotateCcw, ChevronDown, ChevronUp, UsersRound } from "lucide-react";
import { parseDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";

const STATUS_META = {
  pending: { key: "nitro.req_pending", cls: "bg-amber-500/15 text-amber-400" },
  approved: { key: "nitro.req_approved", cls: "bg-emerald-500/15 text-emerald-400" },
  code_issued: { key: "nitro.req_code_issued", cls: "bg-cyan-500/15 text-cyan-300" },
  rejected: { key: "nitro.req_rejected", cls: "bg-white/10 text-white" },
  expired: { key: "nitro.req_expired", cls: "bg-white/10 text-white/60" },
};

const isSafeReceiptUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value);
const PANEL_CACHE_PREFIX = "nebula:nitro-panel:v3:";
const PANEL_PLAN_DAYS = { nitro_mensal: 30, nitro_anual: 365, nitro_90: 90 };

function readPanelCache(userId, key) {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(`${PANEL_CACHE_PREFIX}${userId}:${key}`) || "null");
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((row) => row && typeof row === "object" && !Array.isArray(row)).slice(0, 500);
  } catch {
    return null;
  }
}

function writePanelCache(userId, key, value) {
  if (typeof window === "undefined" || !userId || !Array.isArray(value)) return;
  try {
    window.sessionStorage.setItem(`${PANEL_CACHE_PREFIX}${userId}:${key}`, JSON.stringify(value));
  } catch {}
}

function toPanelRequest(row) {
  if (!row || typeof row !== "object") return null;
  return {
    ...row,
    receipt_file_uri: undefined,
    has_private_receipt: Boolean(row.has_private_receipt || row.receipt_file_uri),
    receipt_url: isSafeReceiptUrl(row.receipt_url) ? row.receipt_url : "",
    status: row.status || "pending",
    source: row.source || "purchase",
  };
}

function countsFromRows(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    if (!row || row.source === "nitro_code") return acc;
    const key = String(row.status || "pending");
    acc.total += 1;
    if (Object.prototype.hasOwnProperty.call(acc, key)) acc[key] += 1;
    return acc;
  }, { total: 0, pending: 0, code_issued: 0, approved: 0, rejected: 0, expired: 0 });
}

function activeUsersFromRows(rows) {
  const now = Date.now();
  const byUser = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    if (row?.status !== "approved" || !row?.user_id) continue;
    let until = new Date(row.expires_at || 0).getTime();
    if (!Number.isFinite(until) || until <= 0) {
      const anchor = new Date(row.approved_at || row.updated_date || row.created_date || 0).getTime();
      if (!Number.isFinite(anchor) || anchor <= 0) continue;
      until = anchor + (PANEL_PLAN_DAYS[row.plan] || 30) * 86400000;
    }
    if (until <= now) continue;
    const current = byUser.get(row.user_id);
    if (!current || until > current._until) {
      byUser.set(row.user_id, {
        user_id: row.user_id,
        user_name: row.user_name || "Usuário",
        valid_until: new Date(until).toISOString(),
        source: row.source || "purchase",
        request_id: row.id,
        _until: until,
      });
    }
  }
  return Array.from(byUser.values())
    .sort((a, b) => b._until - a._until)
    .map(({ _until, ...row }) => row);
}

function mergeRequests(current, incoming) {
  const safeIncoming = (Array.isArray(incoming) ? incoming : []).filter((row) => row && typeof row === "object");
  const byId = new Map();
  for (const row of current || []) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of incoming || []) {
    if (row?.id) byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort((a, b) =>
    (new Date(b?.created_date || 0).getTime() || 0) - (new Date(a?.created_date || 0).getTime() || 0)
  );
}

function foldSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function mergeCodes(current, incoming) {
  const byKey = new Map();
  const terminal = new Set(["revoked", "used", "expired"]);
  for (const row of Array.isArray(current) ? current : []) {
    if (!row || typeof row !== "object") continue;
    const key = row?.id || row?.code;
    if (key) byKey.set(key, row);
  }
  for (const row of incoming || []) {
    if (!row || typeof row !== "object") continue;
    const key = row?.id || row?.code;
    if (!key) continue;
    const previous = byKey.get(key);
    if (previous && terminal.has(previous.status) && row.status === "available") {
      byKey.set(key, previous);
    } else {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const aTime = new Date(a?.generated_at || a?.created_date || 0).getTime() || 0;
    const bTime = new Date(b?.generated_at || b?.created_date || 0).getTime() || 0;
    if (bTime !== aTime) return bTime - aTime;
    return String(b?.id || b?.code || "").localeCompare(String(a?.id || a?.code || ""));
  });
}

export default function NitroRequests() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [requests, setRequests] = useState(null);
  const [activeUsers, setActiveUsers] = useState(null);
  const [activeOpen, setActiveOpen] = useState(true);
  const [codes, setCodes] = useState(null);
  const loadSeqRef = useRef(0);
  const activeLoadSeqRef = useRef(0);
  const codeLoadSeqRef = useRef(0);
  const suppressedActiveRef = useRef(new Map());
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMessage, setCodeMessage] = useState("");
  const [plan, setPlan] = useState("nitro_mensal");
  const [customDays, setCustomDays] = useState(30);
  const [validDays, setValidDays] = useState(0);
  const [receiptBusy, setReceiptBusy] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({ total: 0, pending: 0, code_issued: 0, approved: 0, rejected: 0, expired: 0 });
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState({ user_name: "", plan: "nitro_mensal", rejection_reason: "", admin_note: "" });
  const [requestBusy, setRequestBusy] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [removalTarget, setRemovalTarget] = useState(null);
  const [removalReason, setRemovalReason] = useState("Removido manualmente pela equipe.");

  const load = async () => {
    const seq = ++loadSeqRef.current;

    const applyRows = (rows) => {
      if (seq !== loadSeqRef.current) return;
      const incoming = (Array.isArray(rows) ? rows : [])
        .map(toPanelRequest)
        .filter((row) => row?.id && row.source !== "nitro_code");

      setRequests((current) => {
        const next = mergeRequests(Array.isArray(current) ? current : [], incoming);
        writePanelCache(user?.id, "requests", next);
        setCounts(countsFromRows(next));
        return next;
      });
    };

    // Dispara as duas fontes em paralelo, mas usa a leitura direta assim que
    // ela chega. Não esperamos o endpoint administrativo para mostrar a fila.
    const backendPromise = base44.functions.invoke("nitroAdmin", {
      action: "list_requests",
      status_filter: "all",
      q: "",
      limit: 300,
    }).catch(() => null);

    const directPromise = base44.entities.NitroRequest
      .list("-created_date", 300)
      .catch(() => null);

    const directRows = await directPromise;
    if (Array.isArray(directRows) && directRows.length > 0) {
      applyRows(directRows);
    }

    const backend = await backendPromise;
    const backendRows = Array.isArray(backend?.data?.requests) ? backend.data.requests : [];
    if (backendRows.length > 0) {
      applyRows(backendRows);
      return;
    }

    // Só mostra vazio se as duas fontes concluíram sem dados e não existe
    // cache/estado anterior. Isso evita o "0 / nenhuma solicitação" piscando.
    if (seq === loadSeqRef.current && (!Array.isArray(directRows) || directRows.length === 0)) {
      setRequests((current) => {
        if (Array.isArray(current) && current.length > 0) return current;
        setCounts(countsFromRows([]));
        return [];
      });
    }
  };

  const loadActiveUsers = async () => {
    if (!user?.id) return;
    const seq = ++activeLoadSeqRef.current;
    try {
      // Staff/Owner têm leitura RLS de NitroRequest; consulta direta evita
      // cold-start de função e faz o card aparecer quase instantaneamente.
      const rows = await base44.entities.NitroRequest.filter({ status: "approved" }, "-created_date", 300);
      if (seq !== activeLoadSeqRef.current) return;
      const now = Date.now();
      for (const [userId, until] of suppressedActiveRef.current.entries()) {
        if (until <= now) suppressedActiveRef.current.delete(userId);
      }
      const incoming = activeUsersFromRows(rows).filter((row) => !suppressedActiveRef.current.has(row.user_id));
      setActiveUsers(incoming);
      writePanelCache(user.id, "active", incoming);
      return;
    } catch {}

    const res = await base44.functions.invoke("nitroAdmin", { action: "list_active" });
    if (seq !== activeLoadSeqRef.current) return;
    const incomingRaw = Array.isArray(res.data?.active_users) ? res.data.active_users : [];
    const incoming = incomingRaw.filter((row) => !suppressedActiveRef.current.has(row.user_id));
    if (incoming.length > 0 || res.data?.snapshot_complete === true) {
      setActiveUsers(incoming);
      writePanelCache(user.id, "active", incoming);
    }
  };

  const loadCodes = async () => {
    if (!user?.id || user?.role !== "owner") return;
    const seq = ++codeLoadSeqRef.current;
    const res = await base44.functions.invoke("nitroCodes", { action: "list" });
    if (seq !== codeLoadSeqRef.current) return;
    const incoming = Array.isArray(res.data?.codes) ? res.data.codes : [];
    const giveawayCodes = incoming.filter((row) => row?.source !== "purchase");
    if (giveawayCodes.length > 0) {
      setCodes((current) => {
        const next = mergeCodes(current, giveawayCodes);
        writePanelCache(user.id, "codes", next);
        return next;
      });
    } else if (res.data?.snapshot_complete === true) {
      setCodes([]);
      writePanelCache(user.id, "codes", []);
    }
  };

  useEffect(() => {
    if (user?.id) {
      const cachedActive = readPanelCache(user.id, "active");
      const cachedCodes = user?.role === "owner" ? readPanelCache(user.id, "codes") : null;
      const cachedRequests = readPanelCache(user.id, "requests");
      if (activeUsers === null && cachedActive) setActiveUsers(cachedActive);
      if (codes === null && cachedCodes) setCodes(cachedCodes);
      if (requests === null && cachedRequests) {
        setRequests(cachedRequests);
        setCounts(countsFromRows(cachedRequests));
      }
    }

    const refreshRequests = () => load().catch(() => {
      setRequests((current) => current ?? readPanelCache(user?.id, "requests") ?? []);
    });
    const refreshActive = () => loadActiveUsers().catch(() => {
      setActiveUsers((current) => current ?? readPanelCache(user?.id, "active") ?? []);
    });
    const refreshCodes = () => {
      if (user?.role === "owner") {
        loadCodes().catch(() => {
          setCodes((current) => current ?? readPanelCache(user?.id, "codes") ?? []);
          setCodeMessage((current) => current || "Falha temporária ao atualizar códigos. Tente novamente.");
        });
      }
    };
    const refreshAll = () => {
      refreshActive();
      refreshRequests();
      refreshCodes();
    };

    refreshAll();

    // Realtime + polling funcionam como redundância. Sequências acima impedem
    // respostas antigas de sobrescrever snapshots mais novos.
    const unsubRequests = base44.entities.NitroRequest.subscribe(() => {
      refreshActive();
      refreshRequests();
    });
    const unsubCodes = user?.role === "owner"
      ? base44.entities.NitroCode.subscribe(() => refreshCodes())
      : null;
    const timer = window.setInterval(refreshAll, 10000);
    const onFocus = () => refreshAll();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubRequests?.();
      unsubCodes?.();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id, user?.role]);

  const decide = async (r, status) => {
    if (!r?.id || requestBusy) return;
    let rejection_reason = "";
    if (status === "rejected") {
      const value = window.prompt("Motivo da rejeição do comprovante:", r.rejection_reason || "");
      if (value === null) return;
      rejection_reason = String(value || "").trim().slice(0, 500);
    }

    setRequestBusy(r.id);
    setRequestMessage("");
    try {
      const res = await base44.functions.invoke("nitroAdmin", {
        action: "decision",
        request_id: r.id,
        status,
        ...(rejection_reason ? { rejection_reason } : {}),
      });
      const updated = res?.data?.request;
      if (updated?.id) {
        setRequests((current) => {
          if (!Array.isArray(current)) return current;
          const next = current.map((row) => row.id === updated.id ? { ...row, ...updated } : row);
          writePanelCache(user?.id, "requests", next);
          setCounts(countsFromRows(next));
          return next;
        });
      }
      if (status === "approved" && res?.data?.activated === true) {
        setRequestMessage(`Nitro ativado automaticamente. Código: ${res.data.code || "gerado"}.`);
      } else if (status === "rejected") {
        setRequestMessage("Solicitação recusada.");
      }
      await Promise.all([
        load().catch(() => {}),
        loadActiveUsers().catch(() => {}),
        user?.role === "owner" ? loadCodes().catch(() => {}) : Promise.resolve(),
      ]);
    } catch (error) {
      setRequestMessage(error?.response?.data?.error || error?.message || "Não foi possível atualizar a solicitação.");
    } finally {
      setRequestBusy("");
    }
  };

  const removeNitro = async (row) => {
    if (!row?.user_id || requestBusy) return;
    const busyKey = `remove:${row.user_id}`;
    setRequestBusy(busyKey);
    setRequestMessage("");
    try {
      const res = await base44.functions.invoke("nitroAdmin", {
        action: "remove_nitro",
        user_id: row.user_id,
        reason: String(removalReason || "Removido manualmente pela equipe.").trim().slice(0, 500),
      });
      if (res?.data?.ok !== true) throw new Error(res?.data?.error || "A remoção não foi confirmada pelo servidor.");
      suppressedActiveRef.current.set(row.user_id, Date.now() + 60_000);
      setActiveUsers((current) => {
        if (!Array.isArray(current)) return current;
        const next = current.filter((item) => item.user_id !== row.user_id);
        writePanelCache(user.id, "active", next);
        return next;
      });
      setRemovalTarget(null);
      setRemovalReason("Removido manualmente pela equipe.");
      setRequestMessage(`Nitro removido de ${row.user_name || "usuário"} com sucesso.`);
      await Promise.all([
        load({ status_filter: statusFilter, q: search }),
        loadActiveUsers().catch(() => {}),
      ]);
    } catch (error) {
      setRequestMessage(error?.response?.data?.error || error?.message || "Não foi possível remover o Nitro.");
    } finally {
      setRequestBusy("");
    }
  };

  const generateCode = async () => {
    if (user?.role !== "owner" || codeBusy) return;
    setCodeBusy(true);
    setCodeMessage("");
    try {
      const durationDays = plan === "nitro_custom" ? Math.max(1, Math.min(3650, Number(customDays) || 1)) : undefined;
      const res = await base44.functions.invoke("nitroCodes", {
        action: "generate",
        plan,
        ...(durationDays ? { duration_days: durationDays } : {}),
        code_valid_days: Math.max(0, Math.min(3650, Number(validDays) || 0)),
      });
      const created = res.data?.code || null;
      if (created) setCodes((current) => mergeCodes(current, [created]));
      setCodeMessage(`Código gerado: ${created?.code || "OK"}`);
      await loadCodes();
    } catch (error) {
      setCodeMessage(error?.response?.data?.error || error?.message || "Não foi possível gerar o código.");
    } finally {
      setCodeBusy(false);
    }
  };

  const revokeCode = async (row) => {
    if (user?.role !== "owner" || row.status !== "available" || codeBusy) return;
    if (!window.confirm(`Revogar o código ${row.code}?`)) return;
    setCodeBusy(true);
    setCodeMessage("");
    try {
      const res = await base44.functions.invoke("nitroCodes", { action: "revoke", code_id: row.id });
      const updated = res?.data?.code;
      if (!updated?.id || updated.status !== "revoked") {
        throw new Error(res?.data?.error || "O servidor não confirmou a revogação do código.");
      }
      setCodes((current) => {
        const next = mergeCodes(current, [{ ...row, ...updated, status: "revoked" }]);
        writePanelCache(user.id, "codes", next);
        return next;
      });
      setCodeMessage(`Código ${row.code} revogado.`);
      loadCodes().catch(() => {});
    } catch (error) {
      setCodeMessage(error?.response?.data?.error || error?.message || "Não foi possível revogar o código.");
    } finally {
      setCodeBusy(false);
    }
  };

  const copyCode = async (value) => {
    try { await navigator.clipboard.writeText(value); setCodeMessage("Código copiado."); }
    catch { setCodeMessage("Não foi possível copiar o código."); }
  };

  const openReceipt = async (row) => {
    if (!row?.id || receiptBusy) return;
    setReceiptBusy(row.id);
    try {
      const res = await base44.functions.invoke("nitroReceiptView", { request_id: row.id });
      const url = res?.data?.url;
      if (!url) throw new Error("Comprovante indisponível");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setRequestMessage(error?.response?.data?.error || error?.message || "Não foi possível abrir o comprovante.");
    } finally {
      setReceiptBusy("");
    }
  };

  const startEdit = (row) => {
    setEditing(row);
    setEditDraft({
      user_name: row.user_name || "",
      plan: row.plan || "nitro_mensal",
      rejection_reason: row.rejection_reason || "",
      admin_note: row.admin_note || "",
    });
    setRequestMessage("");
  };

  const saveRequest = async () => {
    if (!editing?.id || requestBusy) return;
    setRequestBusy(editing.id);
    setRequestMessage("");
    try {
      const payload = {
        action: "update_request",
        request_id: editing.id,
        admin_note: editDraft.admin_note,
      };
      if (editing.status !== "approved") {
        payload.user_name = editDraft.user_name;
        payload.plan = editDraft.plan;
        if (editing.status === "rejected") payload.rejection_reason = editDraft.rejection_reason;
      }
      const res = await base44.functions.invoke("nitroAdmin", payload);
      const updated = res.data?.request;
      if (updated) setEditing(updated);
      setRequestMessage("Solicitação atualizada com sucesso.");
      await load();
    } catch (error) {
      setRequestMessage(error?.response?.data?.error || error?.message || "Não foi possível editar a solicitação.");
    } finally {
      setRequestBusy("");
    }
  };

  const reopenRequest = async (row) => {
    if (!row?.id || requestBusy) return;
    if (!window.confirm(`Reabrir a solicitação ${row.code || row.id}?`)) return;
    setRequestBusy(row.id);
    setRequestMessage("");
    try {
      await base44.functions.invoke("nitroAdmin", { action: "reopen_request", request_id: row.id });
      setEditing(null);
      setRequestMessage("Solicitação reaberta para análise.");
      await load({ status_filter: "all" });
      setStatusFilter("all");
    } catch (error) {
      setRequestMessage(error?.response?.data?.error || error?.message || "Não foi possível reabrir a solicitação.");
    } finally {
      setRequestBusy("");
    }
  };

  const deleteRequest = async (row) => {
    if (!row?.id || requestBusy) return;
    if (!window.confirm(`Excluir definitivamente a solicitação ${row.code || row.id}? Esta ação não pode ser desfeita.`)) return;
    setRequestBusy(row.id);
    setRequestMessage("");
    try {
      await base44.functions.invoke("nitroAdmin", { action: "delete_request", request_id: row.id });
      setEditing(null);
      setRequests((current) => {
        if (!Array.isArray(current)) return current;
        const next = current.filter((item) => item.id !== row.id);
        writePanelCache(user?.id, "requests", next);
        setCounts(countsFromRows(next));
        return next;
      });
      setRequestMessage("Solicitação excluída.");
    } catch (error) {
      setRequestMessage(error?.response?.data?.error || error?.message || "Não foi possível excluir a solicitação.");
    } finally {
      setRequestBusy("");
    }
  };

  const runSearch = () => setSearch((value) => String(value || "").trim());

  const visibleRequests = useMemo(() => {
    const rows = Array.isArray(requests) ? requests : [];
    const q = foldSearch(search);
    return rows.filter((row) => {
      if (!row?.id) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      const hay = foldSearch(`${row.code || ""} ${row.user_name || ""} ${row.user_id || ""} ${row.plan || ""}`);
      return hay.includes(q);
    });
  }, [requests, search, statusFilter]);

  const requestGroups = useMemo(() => {
    const groups = new Map();
    for (const row of visibleRequests) {
      if (!row?.id) continue;
      const key = row.user_id || `unknown:${row.user_name || row.id}`;
      const current = groups.get(key) || {
        key,
        user_id: row.user_id || "",
        user_name: row.user_name || "Usuário",
        rows: [],
        latest: 0,
      };
      current.rows.push(row);
      current.latest = Math.max(current.latest, new Date(row.created_date || 0).getTime() || 0);
      groups.set(key, current);
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        rows: group.rows.sort((a, b) =>
          (new Date(b.created_date || 0).getTime() || 0) - (new Date(a.created_date || 0).getTime() || 0)
        ),
      }))
      .sort((a, b) => b.latest - a.latest);
  }, [visibleRequests]);

  const groupedFlatRequests = useMemo(
    () => requestGroups.flatMap((group) => group.rows),
    [requestGroups]
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-500/20 bg-card/45 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-300">
              <UsersRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Nitro ativo</p>
                  <h3 className="mt-1 font-heading text-base font-extrabold">Assinaturas ativas</h3>
                </div>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-extrabold text-emerald-300">
                  {activeUsers === null ? "carregando…" : `${activeUsers.length} ${activeUsers.length === 1 ? "usuário" : "usuários"}`}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Lista compacta de usuários com Nitro ativo. Staff e Owner podem remover o acesso imediatamente.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => loadActiveUsers()} disabled={!!requestBusy}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setActiveOpen((value) => !value)}>
              {activeOpen ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
              {activeOpen ? "Recolher" : "Expandir"}
            </Button>
          </div>
        </div>

        {removalTarget && (
          <div className="mt-4 rounded-2xl border border-destructive/25 bg-destructive/[0.045] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-destructive">Confirmar remoção</p>
                <h4 className="mt-1 text-sm font-extrabold">Remover Nitro de {removalTarget.user_name || "usuário"}?</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  O acesso Nitro será encerrado imediatamente e as personalizações serão restauradas para o padrão.
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRemovalTarget(null)} disabled={!!requestBusy}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Cancelar
              </Button>
            </div>
            <label className="mt-3 block space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">Motivo</span>
              <Input
                value={removalReason}
                onChange={(e) => setRemovalReason(e.target.value.slice(0, 500))}
                placeholder="Motivo da remoção"
                disabled={!!requestBusy}
              />
            </label>
            <Button
              className="mt-3"
              variant="destructive"
              onClick={() => removeNitro(removalTarget)}
              disabled={!!requestBusy}
            >
              {requestBusy === `remove:${removalTarget.user_id}`
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Ban className="mr-2 h-4 w-4" />}
              Confirmar remoção do Nitro
            </Button>
          </div>
        )}

        {activeOpen && (
          <div className="mt-4 max-h-80 overflow-y-auto pr-1">
            {activeUsers === null ? (
              <div className="grid min-h-20 place-items-center rounded-xl border border-border/35 bg-background/20">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
              </div>
            ) : !Array.isArray(activeUsers) || activeUsers.length === 0 ? (
              <p className="rounded-xl border border-border/35 bg-background/20 px-3 py-4 text-center text-xs text-muted-foreground">
                Nenhum usuário com Nitro ativo.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {activeUsers.filter((row) => row && typeof row === "object" && row.user_id).map((row) => {
                  const busyKey = `remove:${row.user_id}`;
                  return (
                    <div key={row.user_id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/40 bg-secondary/35 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold">{row.user_name || "Usuário"}</p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={row.user_id}>ID: {row.user_id}</p>
                        <p className="mt-1 text-[11px] text-emerald-300">
                          Ativo até {parseDate(row.valid_until).format("DD/MM/YYYY HH:mm")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRemovalTarget(row);
                          setRemovalReason("Removido manualmente pela equipe.");
                          setRequestMessage("");
                        }}
                        disabled={requestBusy === busyKey}
                      >
                        {requestBusy === busyKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-1.5 h-3.5 w-3.5" />}
                        Remover Nitro
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {user?.role === "owner" && (
        <section className="rounded-2xl border border-primary/20 bg-card/55 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Gift className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-heading text-sm font-extrabold">Códigos Nitro para sorteios</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Gere manualmente somente códigos para sorteios e promoções. Compras aprovadas recebem um código automático separado e ele aparece direto na aba Nitro do comprador.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => loadCodes()} disabled={codeBusy}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-[180px_140px_150px_auto]">
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="h-10 rounded-xl border border-border/60 bg-background px-3 text-sm">
              <option value="nitro_mensal">Mensal · 30 dias</option>
              <option value="nitro_anual">Anual · 365 dias</option>
              <option value="nitro_custom">Duração personalizada</option>
            </select>
            <Input
              type="number"
              min="1"
              max="3650"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              disabled={plan !== "nitro_custom"}
              placeholder="Dias"
            />
            <select value={String(validDays)} onChange={(e) => setValidDays(Number(e.target.value))} className="h-10 rounded-xl border border-border/60 bg-background px-3 text-sm">
              <option value="0">Código não expira</option>
              <option value="7">Expira em 7 dias</option>
              <option value="30">Expira em 30 dias</option>
              <option value="90">Expira em 90 dias</option>
            </select>
            <Button onClick={generateCode} disabled={codeBusy}>
              {codeBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
              Gerar código de sorteio
            </Button>
          </div>

          {codeMessage && <p className="mt-3 rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-xs font-semibold">{codeMessage}</p>}

          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
            {codes === null && <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />}
            {Array.isArray(codes) && codes.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nenhum código de sorteio gerado ainda.</p>}
            {Array.isArray(codes) && codes.filter((row) => row && typeof row === "object").map((row) => {
              const label = row.status === "available" ? "Disponível" : row.status === "used" ? "Usado" : row.status === "expired" ? "Expirado" : "Revogado";
              const cls = row.status === "available"
                ? "bg-emerald-500/10 text-emerald-300"
                : row.status === "used"
                  ? "bg-blue-500/10 text-blue-300"
                  : "bg-white/10 text-muted-foreground";
              return (
                <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-secondary/30 p-3">
                  <button type="button" onClick={() => copyCode(row.code)} className="font-mono text-xs font-extrabold text-primary hover:underline">
                    {row.code}
                  </button>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", cls)}>{label}</span>
                  <span className="text-[10px] text-muted-foreground">{row.duration_days} dias</span>
                  <span className="text-[10px] text-muted-foreground">Sorteio / promoção</span>
                  {row.assigned_user_name && !row.used_by_name && <span className="text-[10px] text-muted-foreground">Destinado a {row.assigned_user_name}</span>}
                  {row.used_by_name && (
                    <span className="text-[10px] text-muted-foreground">
                      Usado por <strong className="text-foreground">{row.used_by_name}</strong>
                      {row.used_by ? ` · ID ${row.used_by}` : ""}
                    </span>
                  )}
                  {row.generated_at && <span className="text-[10px] text-muted-foreground">Gerado {parseDate(row.generated_at).format("DD/MM/YYYY HH:mm")}</span>}
                  {row.expires_at && row.status === "available" && <span className="text-[10px] text-muted-foreground">Expira {parseDate(row.expires_at).format("DD/MM/YYYY HH:mm")}</span>}
                  {row.used_at && <span className="text-[10px] font-semibold text-blue-300">Resgatado em {parseDate(row.used_at).format("DD/MM/YYYY HH:mm")}</span>}
                  <div className="ml-auto flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyCode(row.code)} title="Copiar código">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {row.status === "available" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => revokeCode(row)} title="Revogar código">
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border/45 bg-card/45 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Solicitações Nitro</p>
            <h3 className="mt-1 font-heading text-base font-extrabold">Gerenciar compras e solicitações</h3>
            <p className="mt-1 text-xs text-muted-foreground">Veja pendentes, abra comprovantes, edite dados, aprove, rejeite, reabra e remova solicitações encerradas.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => load()} disabled={!!requestBusy}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {[
            ["all", "Todas", counts.total],
            ["pending", "Pendentes", counts.pending],
            ["code_issued", "Código emitido", counts.code_issued],
            ["approved", "Ativas", counts.approved],
            ["rejected", "Rejeitadas", counts.rejected],
            ["expired", "Expiradas", counts.expired],
          ].map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition",
                statusFilter === value ? "border-primary/45 bg-primary/10" : "border-border/40 bg-background/25 hover:border-border"
              )}
            >
              <span className="block text-[10px] font-bold text-muted-foreground">{label}</span>
              <span className="mt-0.5 block text-lg font-extrabold">{count || 0}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Buscar por nome, código ou ID do usuário"
              className="pl-9"
            />
          </div>
          <Button variant="secondary" onClick={runSearch}>Buscar</Button>
          {(search || statusFilter !== "all") && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>

        {requestMessage && (
          <p className="mt-3 rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-xs font-semibold">{requestMessage}</p>
        )}
      </section>

      {user?.role === "owner" && editing && (
        <section className="rounded-2xl border border-primary/25 bg-primary/[0.035] p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Editar solicitação</p>
              <h3 className="mt-1 font-heading text-base font-extrabold">{editing.code || editing.id}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">ID do usuário: {editing.user_id || "—"}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="mr-1.5 h-3.5 w-3.5" /> Fechar</Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">Nome exibido</span>
              <Input value={editDraft.user_name} onChange={(e) => setEditDraft((d) => ({ ...d, user_name: e.target.value.slice(0, 120) }))} disabled={editing.status === "approved"} />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">Plano</span>
              <select
                value={editDraft.plan}
                onChange={(e) => setEditDraft((d) => ({ ...d, plan: e.target.value }))}
                disabled={editing.status === "approved"}
                className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm"
              >
                <option value="nitro_mensal">Mensal · 30 dias</option>
                <option value="nitro_90">Nitro · 90 dias</option>
                <option value="nitro_anual">Anual · 365 dias</option>
              </select>
            </label>
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-[11px] font-bold text-muted-foreground">Nota administrativa</span>
              <textarea
                value={editDraft.admin_note}
                onChange={(e) => setEditDraft((d) => ({ ...d, admin_note: e.target.value.slice(0, 1000) }))}
                rows={3}
                className="w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                placeholder="Observação interna sobre esta solicitação"
              />
            </label>
            {editing.status === "rejected" && (
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-[11px] font-bold text-muted-foreground">Motivo da rejeição</span>
                <textarea
                  value={editDraft.rejection_reason}
                  onChange={(e) => setEditDraft((d) => ({ ...d, rejection_reason: e.target.value.slice(0, 500) }))}
                  rows={2}
                  className="w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
              </label>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={saveRequest} disabled={requestBusy === editing.id}>
              {requestBusy === editing.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar alterações
            </Button>
            {['rejected', 'expired'].includes(editing.status) && (
              <Button variant="outline" onClick={() => reopenRequest(editing)} disabled={requestBusy === editing.id}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reabrir solicitação
              </Button>
            )}
            {['rejected', 'expired'].includes(editing.status) && (
              <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => deleteRequest(editing)} disabled={requestBusy === editing.id}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
            )}
            {(editing.has_private_receipt || isSafeReceiptUrl(editing.receipt_url)) && (
              <Button variant="outline" onClick={() => openReceipt(editing)} disabled={receiptBusy === editing.id}>
                <ExternalLink className="mr-2 h-4 w-4" /> Ver comprovante
              </Button>
            )}
          </div>
        </section>
      )}

      {requests === null && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
      {Array.isArray(requests) && requests.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">{t("painel.nr_empty")}</p>
      )}
      {Array.isArray(requests) && requests.length > 0 && visibleRequests.length === 0 && (
        <p className="rounded-xl border border-border/35 bg-background/20 p-4 text-center text-sm text-muted-foreground">
          Nenhuma solicitação encontrada para essa busca/filtro. O histórico completo continua carregado.
        </p>
      )}
      {Array.isArray(requests) && groupedFlatRequests.length > 0 && (
        <section className="rounded-2xl border border-border/40 bg-card/25 p-3">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-xs font-extrabold">Histórico agrupado por usuário</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {requestGroups.length} {requestGroups.length === 1 ? "usuário" : "usuários"} · {groupedFlatRequests.length} {groupedFlatRequests.length === 1 ? "registro" : "registros"}
              </p>
            </div>
            <span className="rounded-full border border-border/40 bg-secondary/40 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
              scroll interno
            </span>
          </div>
          <div className="max-h-[46rem] space-y-2 overflow-y-auto pr-1">
        {groupedFlatRequests.map((r, index) => {
          const meta = STATUS_META[r.status] || STATUS_META.pending;
          const safeReceiptUrl = isSafeReceiptUrl(r.receipt_url) ? r.receipt_url : null;
          const isImage = safeReceiptUrl && /\.(jpe?g|png|webp)$/i.test(safeReceiptUrl);
          const hasPrivateReceipt = Boolean(r.has_private_receipt);
          const previous = groupedFlatRequests[index - 1];
          const startsGroup = !previous || previous.user_id !== r.user_id;
          const groupSize = startsGroup
            ? (requestGroups.find((group) => group.user_id === r.user_id)?.rows.length || 1)
            : 0;
          return (
            <React.Fragment key={r.id}>
              {startsGroup && (
                <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 rounded-xl border border-primary/15 bg-background/95 px-3 py-2 backdrop-blur">
                  <UsersRound className="h-4 w-4 text-primary" />
                  <span className="text-xs font-extrabold">{r.user_name || "Usuário"}</span>
                  <span className="rounded-full border border-border/40 bg-secondary/45 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {groupSize} {groupSize === 1 ? "solicitação" : "solicitações"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">ID: {r.user_id || "—"}</span>
                </div>
              )}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-secondary/40 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary">{r.code}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>{t(meta.key)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.user_name || "Usuário"} · {r.plan === "nitro_anual" ? "Anual · 365 dias" : r.plan === "nitro_90" ? "90 dias" : "Mensal · 30 dias"} · {parseDate(r.created_date).format("DD/MM/YYYY HH:mm")}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">ID: {r.user_id || "—"}</p>
                {r.admin_note && <p className="mt-1 text-[11px] text-muted-foreground">Nota: {r.admin_note}</p>}
                {r.rejection_reason && <p className="mt-1 text-[11px] text-red-300">Motivo: {r.rejection_reason}</p>}
                {r.edited_at && <p className="mt-1 text-[10px] text-muted-foreground/70">Editado por {r.edited_by_name || "Owner"} em {parseDate(r.edited_at).format("DD/MM/YYYY HH:mm")}</p>}
              </div>
              {hasPrivateReceipt ? (
                <Button size="sm" variant="outline" onClick={() => openReceipt(r)} disabled={receiptBusy === r.id}>
                  {receiptBusy === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1 h-3.5 w-3.5" />}
                  Ver comprovante
                </Button>
              ) : isImage ? (
                <a href={safeReceiptUrl} target="_blank" rel="noopener noreferrer" title={t("painel.nr_view_receipt")}>
                  <Image src={safeReceiptUrl} alt={t("painel.nr_receipt")} className="h-12 w-12 rounded-lg border border-border/40 object-cover" />
                </a>
              ) : safeReceiptUrl ? (
                <Button asChild size="sm" variant="outline">
                  <a href={safeReceiptUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> {t("painel.nr_receipt")}
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Aguardando comprovante</span>
              )}
              {user?.role === "owner" && (
                <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                </Button>
              )}
              {r.status === "pending" && (
                <>
                  {(hasPrivateReceipt || safeReceiptUrl) ? (
                    <Button size="sm" onClick={() => decide(r, "approved")} disabled={requestBusy === r.id} className="bg-emerald-600 hover:bg-emerald-600/90">
                      {requestBusy === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Aprovar e ativar Nitro
                    </Button>
                  ) : (
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-1 text-[10px] font-bold text-amber-300">
                      Aguardando comprovante
                    </span>
                  )}
                  <Button size="sm" variant="outline" onClick={() => decide(r, "rejected")} disabled={requestBusy === r.id} className="text-destructive hover:bg-destructive/10">
                    {requestBusy === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />} {t("painel.nr_reject")}
                  </Button>
                </>
              )}
              {r.status === "code_issued" && (
                <Button size="sm" variant="outline" onClick={() => decide(r, "approved")} disabled={requestBusy === r.id}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Ativar Nitro agora
                </Button>
              )}
              {user?.role === "owner" && ['rejected', 'expired'].includes(r.status) && (
                <Button size="sm" variant="outline" onClick={() => reopenRequest(r)} disabled={requestBusy === r.id}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reabrir
                </Button>
              )}
            </div>
            </React.Fragment>
          );
        })}
          </div>
        </section>
      )}
    </div>
  );
}