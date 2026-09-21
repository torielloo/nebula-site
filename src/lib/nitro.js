import { parseDate, moment } from "@/lib/time";
import { base44 } from "@/api/base44Client";
import { resetAmbientBeatPreferences } from "@/lib/ambientMusicPreferences";
import { setNitroCallSoundEnabled } from "@/lib/nitroSoundPreferences";
import { resetNebulaMusicQueueStorage } from "@/lib/nebulaMusicQueue";

const PLAN_DAYS = { nitro_mensal: 30, nitro_anual: 365, nitro_90: 90 };

export function nitroStatusFromRequests(requests) {
  const approved = (requests || []).filter((r) => r.status === "approved");
  const validUntil = approved.length
    ? moment.max(approved.map((r) => r.expires_at
        ? parseDate(r.expires_at)
        : parseDate(r.approved_at || r.updated_date || r.created_date).add(PLAN_DAYS[r.plan] || 30, "days")))
    : null;
  return { active: !!validUntil && validUntil.isAfter(moment()), validUntil };
}

export async function fetchNitroStatus(userId) {
  let serverState = null;
  try {
    const res = await base44.functions.invoke("nitroState", { action: "sync" });
    serverState = res?.data || res || null;
    if (serverState?.reset) {
      resetAmbientBeatPreferences();
      setNitroCallSoundEnabled(true);
      resetNebulaMusicQueueStorage();
      try { window.sessionStorage.removeItem("nebula:uistudio:entitlement"); } catch {}
    }
  } catch {}

  let requests = Array.isArray(serverState?.requests) ? serverState.requests : [];
  if (!serverState && !requests.length) {
    requests = await base44.entities.NitroRequest
      .filter({ user_id: userId }, "-created_date", 100)
      .catch(() => []);
  }

  let purchaseCodes = Array.isArray(serverState?.purchase_codes) ? serverState.purchase_codes : [];
  if (!purchaseCodes.length) {
    try {
      const res = await base44.functions.invoke("nitroCodes", { action: "my_purchase_codes" });
      purchaseCodes = Array.isArray(res?.data?.codes) ? res.data.codes : [];
    } catch {}
  }

  const codesById = new Map(purchaseCodes.map((row) => [row.id, row]));
  const codesByRequest = new Map(
    purchaseCodes.map((row) => [row.request_id, row]).filter(([requestId]) => requestId)
  );

  const hydratedRequests = (requests || []).map((row) => {
    const linkedCode =
      (row.nitro_code_id && codesById.get(row.nitro_code_id))
      || codesByRequest.get(row.id)
      || null;

    if (!linkedCode) return row;

    return {
      ...row,
      issued_code: linkedCode.code || "",
      issued_code_status: linkedCode.status || "",
      issued_code_generated_at: linkedCode.generated_at || "",
      issued_code_used_at: linkedCode.used_at || "",
    };
  });

  const local = nitroStatusFromRequests(hydratedRequests);
  if (serverState && typeof serverState.active === "boolean") {
    // nitroState é autoritativo quando respondeu com sucesso. Uma leitura
    // local atrasada nunca pode manter benefícios depois de uma remoção manual.
    const active = serverState.active === true;
    const validUntil = active && serverState.valid_until ? parseDate(serverState.valid_until) : null;
    return {
      active,
      validUntil,
      requests: hydratedRequests,
      reset: Boolean(serverState.reset),
    };
  }

  return { ...local, requests: hydratedRequests, reset: false };
}
