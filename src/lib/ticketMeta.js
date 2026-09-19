import { base44 } from "@/api/base44Client";

export const TICKET_STATUS = {
  novo: { cls: "bg-sky-500/15 text-sky-400" },
  em_atendimento: { cls: "bg-amber-500/15 text-amber-400" },
  aguardando_usuario: { cls: "bg-violet-500/15 text-violet-400" },
  resolvido: { cls: "bg-emerald-500/15 text-emerald-400" },
  fechado: { cls: "bg-slate-500/15 text-slate-400" },
};

export const TICKET_CATEGORIES = {
  conta: { label: "Conta", desc: "Login, cadastro, Discord e segurança" },
  bugs: { label: "Bugs", desc: "Erros, falhas e problemas de interface" },
  downloads: { label: "Downloads", desc: "Arquivo quebrado, instalação e atualização" },
  ia: { label: "IA", desc: "Core OS, respostas e erros" },
  nitro: { label: "Nitro", desc: "Assinatura, benefícios e personalização" },
};

export const PRIORITY_META = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export async function logStaffAction(user, action, details, target_id) {
  try {
    await base44.entities.StaffLog.create({
      actor_name: user.full_name || (user.email || "Staff").split("@")[0],
      actor_id: user.id,
      action,
      details,
      target_id: target_id || "",
    });
  } catch {}
}