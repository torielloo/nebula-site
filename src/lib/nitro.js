import { parseDate, moment } from "@/lib/time";
import { base44 } from "@/api/base44Client";
import { resetAmbientBeatPreferences } from "@/lib/ambientMusicPreferences";

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
    if (serverState?.reset) resetAmbientBeatPreferences();
  } catch {}
  const requests = await base44.entities.NitroRequest.filter({ user_id: userId }, "-created_date", 50);
  const local = nitroStatusFromRequests(requests);
  if (serverState && typeof serverState.active === "boolean") {
    return {
      active: serverState.active,
      validUntil: serverState.valid_until ? parseDate(serverState.valid_until) : null,
      requests,
      reset: Boolean(serverState.reset),
    };
  }
  return { ...local, requests, reset: false };
}