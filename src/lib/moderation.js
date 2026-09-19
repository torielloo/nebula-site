import { base44 } from "@/api/base44Client";
import { parseDate } from "./time";

export const MUTE_DURATIONS = [
  { value: "1h", label: "1 hora", hours: 1 },
  { value: "6h", label: "6 horas", hours: 6 },
  { value: "24h", label: "24 horas", hours: 24 },
  { value: "7d", label: "7 dias", hours: 168 },
  { value: "30d", label: "30 dias", hours: 720 },
  { value: "perm", label: "Permanente", hours: null },
];

// Verifica se o usuário atual está silenciado (via backend, punições são privadas)
export async function fetchMyMute() {
  try {
    const res = await base44.functions.invoke("getMyMute", {});
    const d = res && res.data;
    return d && d.muted ? d : null;
  } catch {
    return null;
  }
}

export const muteUntilLabel = (date) => parseDate(date).format("DD/MM/YYYY [às] HH:mm");