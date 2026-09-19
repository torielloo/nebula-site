import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Cpu, Loader2, Play, Power, Save, ShieldCheck, Search, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { logStaffAction } from "@/lib/ticketMeta";
import CoreOS from "@/pages/CoreOS";
import { invalidateCoreOsVoiceConfig, playAiVoice, playCoreOsVoice, stopCoreOsVoice, unlockAiVoice } from "@/lib/coreOsVoice";

const MODELS = [
  { id: "base44_original", label: "Base44 IA original · roteamento nativo · usa créditos" },
];

const VOICES = [
  { id: "marin", label: "Marin", note: "natural" },
  { id: "cedar", label: "Cedar", note: "encorpada" },
  { id: "coral", label: "Coral", note: "clara" },
  { id: "nova", label: "Nova", note: "suave" },
  { id: "sage", label: "Sage", note: "calma" },
  { id: "shimmer", label: "Shimmer", note: "leve" },
  { id: "alloy", label: "Alloy", note: "equilibrada" },
  { id: "ash", label: "Ash", note: "firme" },
  { id: "ballad", label: "Ballad", note: "expressiva" },
  { id: "echo", label: "Echo", note: "direta" },
  { id: "fable", label: "Fable", note: "narrativa" },
  { id: "onyx", label: "Onyx", note: "grave" },
  { id: "verse", label: "Verse", note: "dinâmica" },
];

const DEFAULTS = {
  active: true,
  model: "base44_original",
  persona_name: "Core OS",
  tone: "natural, confiante, inteligente, direta e contextual; personalidade própria sem soar robótica",
  rules: "",
  owner_persona_name: "Core OS Owner",
  owner_tone: "estratégica, inteligente, confiante, direta e contextual",
  owner_rules: "Converse normalmente com o Owner, responda dúvidas sobre o Nébula OS e use o conhecimento real do site. Só peça ID quando uma ação realmente exigir um alvo específico. Explique recursos, segurança, tickets, páginas e áreas do painel quando perguntado. Execute apenas ações permitidas e validadas pelo backend.",
  staff_persona_name: "Core OS Staff",
  staff_tone: "rápida, prática, colaborativa, clara e contextual",
  staff_rules: "Converse normalmente com a Staff e responda dúvidas sobre o Nébula OS, painel, tickets e recursos do site antes de pedir dados específicos. Só peça ID quando a solicitação depender de um item específico. Nunca simule acesso de Owner.",
  security_persona_name: "Core OS Segurança",
  security_tone: "analítica, cautelosa, objetiva e orientada a evidências",
  security_rules: "Converse normalmente sobre o Nébula OS e segurança. Explique Prompt Guard, Core Security AI, relatórios, incidentes e caminhos do site usando apenas contexto autorizado. Investigue e contenha riscos somente com permissões próprias de segurança; nunca revele segredos, credenciais ou mecanismos internos sensíveis.",
  mixer_persona_name: "Nébula Mixer IA",
  mixer_tone: "criativa, musical, objetiva e original",
  mixer_rules: "Crie somente conteúdo original do Mixer e não acesse dados administrativos ou privados.",
  support_persona_name: "Nebulaticos IA",
  support_tone: "rápida, humana, prestativa, confiante, clara e direta; sem soar robótica",
  support_rules: "Converse como uma IA de suporte de verdade. Responda saudações, dúvidas gerais e perguntas sobre o site normalmente. Saiba informar Discord oficial, tickets, downloads, versões, soluções e erros conhecidos usando contexto público. Só entre em diagnóstico técnico quando a mensagem realmente for sobre erro e nunca invente diagnóstico.",
  knowledge: "",
  voice_enabled: true,
  voice_model: "browser-speech",
  voice_name: "marin",
  voice_instructions: "Voz natural, conversacional, calma e confiante. Fale como numa conversa real, sem tom de locutor, sem teatralidade e sem exagerar na entonação.",
  voice_auto_speak: true,
  support_voice_enabled: true,
  support_voice_model: "browser-speech",
  support_voice_name: "coral",
  support_voice_instructions: "Voz natural, prestativa, clara e conversacional. Fale no mesmo idioma da resposta, sem tom robótico.",
  support_voice_auto_speak: true,
  server_monitoring: true,
  notify_staff: true,
  notify_owner: true,
  auto_actions: false,
  scan_interval_minutes: 5,
};

export default function CoreOsControl({ user }) {
  const { t } = useI18n();
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditResult, setAuditResult] = useState("");
  const [voicePreviewBusy, setVoicePreviewBusy] = useState(false);
  const [voicePreviewResult, setVoicePreviewResult] = useState("");
  const [supportVoicePreviewBusy, setSupportVoicePreviewBusy] = useState(false);
  const [supportVoicePreviewResult, setSupportVoicePreviewResult] = useState("");

  const load = async () => {
    const list = await base44.entities.CoreOsConfig.list();
    let c = list[0];
    if (!c) {
      c = await base44.entities.CoreOsConfig.create({ ...DEFAULTS });
    }
    setConfig({ ...DEFAULTS, ...c });
  };

  useEffect(() => {
    load().catch(() => setConfig({ ...DEFAULTS }));
  }, []);

  const patch = (data) => {
    setConfig({ ...config, ...data });
    setSaved(false);
  };

  const save = async () => {
    if (!config.id || saving) return;
    setSaving(true);
    try {
      await base44.entities.CoreOsConfig.update(config.id, {
        active: config.active,
        model: "base44_original",
        persona_name: config.persona_name,
        tone: config.tone,
        rules: config.rules,
        knowledge: config.knowledge,
        owner_persona_name: config.owner_persona_name || DEFAULTS.owner_persona_name,
        owner_tone: config.owner_tone || DEFAULTS.owner_tone,
        owner_rules: config.owner_rules || DEFAULTS.owner_rules,
        staff_persona_name: config.staff_persona_name || DEFAULTS.staff_persona_name,
        staff_tone: config.staff_tone || DEFAULTS.staff_tone,
        staff_rules: config.staff_rules || DEFAULTS.staff_rules,
        security_persona_name: config.security_persona_name || DEFAULTS.security_persona_name,
        security_tone: config.security_tone || DEFAULTS.security_tone,
        security_rules: config.security_rules || DEFAULTS.security_rules,
        mixer_persona_name: config.mixer_persona_name || DEFAULTS.mixer_persona_name,
        mixer_tone: config.mixer_tone || DEFAULTS.mixer_tone,
        mixer_rules: config.mixer_rules || DEFAULTS.mixer_rules,
        support_persona_name: config.support_persona_name || DEFAULTS.support_persona_name,
        support_tone: config.support_tone || DEFAULTS.support_tone,
        support_rules: config.support_rules || DEFAULTS.support_rules,
        voice_enabled: config.voice_enabled !== false,
        voice_model: "browser-speech",
        voice_name: config.voice_name || "marin",
        voice_instructions: config.voice_instructions || DEFAULTS.voice_instructions,
        voice_auto_speak: config.voice_auto_speak !== false,
        support_voice_enabled: config.support_voice_enabled !== false,
        support_voice_model: "browser-speech",
        support_voice_name: config.support_voice_name || "coral",
        support_voice_instructions: config.support_voice_instructions || DEFAULTS.support_voice_instructions,
        support_voice_auto_speak: config.support_voice_auto_speak !== false,
        server_monitoring: config.server_monitoring !== false,
        notify_staff: config.notify_staff !== false,
        notify_owner: config.notify_owner !== false,
        auto_actions: false,
        scan_interval_minutes: 5,
      });
      await logStaffAction(
        user,
        "core_os_config",
        `Core OS atualizada — modelo: ${config.model}, ativa: ${config.active ? "sim" : "não"}`,
        config.id
      );
      invalidateCoreOsVoiceConfig();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const previewVoice = async () => {
    if (voicePreviewBusy) return;
    unlockAiVoice();
    setVoicePreviewBusy(true);
    setVoicePreviewResult("");
    try {
      const result = await playCoreOsVoice(
        t("corectl.preview_text"),
        {
          preview: true,
          voice: config.voice_name || "marin",
          instructions: config.voice_instructions || DEFAULTS.voice_instructions,
        }
      );
      setVoicePreviewResult(result?.provider === "gpt" ? t("corectl.preview_gpt") : t("corectl.preview_browser"));
    } finally {
      setVoicePreviewBusy(false);
    }
  };

  const previewSupportVoice = async () => {
    if (supportVoicePreviewBusy) return;
    unlockAiVoice();
    setSupportVoicePreviewBusy(true);
    setSupportVoicePreviewResult("");
    try {
      const result = await playAiVoice(
        t("corectl.support_preview_text"),
        {
          assistant: "nebulaticos",
          preview: true,
          voice: config.support_voice_name || "coral",
          instructions: config.support_voice_instructions || DEFAULTS.support_voice_instructions,
        }
      );
      setSupportVoicePreviewResult(result?.provider === "gpt" ? t("corectl.preview_gpt") : t("corectl.preview_browser"));
    } finally {
      setSupportVoicePreviewBusy(false);
    }
  };

  useEffect(() => () => stopCoreOsVoice(), []);

  const auditNow = async () => {
    setAuditBusy(true);
    setAuditResult("");
    try {
      const res = await base44.functions.invoke("coreOsAudit", { manual: true });
      const s = res.data?.summary || {};
      setAuditResult(t("corectl.audit_result", { tickets: s.open_tickets || 0, reports: s.pending_reports || 0, blocks: s.critical_blocks_15m || 0, review: s.content_for_human_review || 0 }));
    } catch (error) {
      setAuditResult(error?.response?.data?.error || t("corectl.audit_unavailable"));
    } finally {
      setAuditBusy(false);
    }
  };

  if (!config) {
    return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/40 bg-secondary/40 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-sm font-bold">{t("corectl.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("corectl.subtitle")}</p>
          </div>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
              config.active ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-white"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", config.active ? "bg-emerald-500" : "bg-white")} />
            {config.active ? t("common.online") : t("painel.core_offline")}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => patch({ active: !config.active })}
          >
            <Power className="mr-1 h-3.5 w-3.5" />
            {config.active ? t("painel.core_disable") : t("painel.core_enable")}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("painel.core_name")}</p>
            <Input
              value={config.persona_name || ""}
              onChange={(e) => patch({ persona_name: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("painel.core_model")}</p>
            <select
              value={config.model}
              onChange={(e) => patch({ model: e.target.value })}
              className="h-9 w-full rounded-md border border-white/10 bg-transparent px-3 text-xs text-foreground"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-card">
                  {m.id === "automatic" ? t(m.label) : m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">O modelo selecionado é usado pela Nebulaticos IA, Core OS Owner/Staff/Segurança, Core Security AI e Nébula Mixer IA.</p>
            <p className="mt-1 text-[10px] font-medium text-emerald-300">
              Todas as IAs usam o InvokeLLM original da Base44, sem forçar um ID de modelo. É o mesmo padrão das primeiras versões do site e consome os créditos normalmente.
            </p>
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("painel.core_tone")}</p>
          <Input value={config.tone || ""} onChange={(e) => patch({ tone: e.target.value })} />
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {[
            ["Owner", "owner_persona_name", "owner_tone", "owner_rules", "Visão global autorizada e ações administrativas."],
            ["Staff", "staff_persona_name", "staff_tone", "staff_rules", "Assistência operacional limitada às permissões reais da sessão."],
            ["Segurança", "security_persona_name", "security_tone", "security_rules", "Investigação e contenção com permissões próprias de segurança."],
            ["Mixer", "mixer_persona_name", "mixer_tone", "mixer_rules", "Criatividade musical sem acesso administrativo."],
          ].map(([title, nameKey, toneKey, rulesKey, description]) => (
            <div key={title} className="rounded-2xl border border-border/50 bg-secondary/20 p-4">
              <div className="mb-3">
                <p className="text-sm font-extrabold">Personalidade · {title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Nome</p>
                  <Input value={config[nameKey] || ""} onChange={(e) => patch({ [nameKey]: e.target.value })} />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tom</p>
                  <Input value={config[toneKey] || ""} onChange={(e) => patch({ [toneKey]: e.target.value })} />
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Regras próprias</p>
                <Textarea rows={3} value={config[rulesKey] || ""} onChange={(e) => patch({ [rulesKey]: e.target.value })} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-border/50 bg-secondary/20 p-4">
          <div className="mb-3">
            <p className="text-sm font-extrabold">Personalidade da Nebulaticos IA</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Separada da Core OS: suporte rápido, humano e sem acesso administrativo.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Nome</p>
              <Input
                value={config.support_persona_name || ""}
                onChange={(e) => patch({ support_persona_name: e.target.value })}
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tom</p>
              <Input
                value={config.support_tone || ""}
                onChange={(e) => patch({ support_tone: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Regras próprias do suporte</p>
            <Textarea
              rows={3}
              value={config.support_rules || ""}
              onChange={(e) => patch({ support_rules: e.target.value })}
              placeholder="Como a Nebulaticos deve conversar e atender."
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Volume2 className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">{t("corectl.voice_title")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("corectl.voice_desc")}</p>
            </div>
            <label className="flex items-center gap-2 rounded-full border border-border/50 bg-background/40 px-3 py-2 text-xs font-bold">
              <input type="checkbox" checked={config.voice_enabled !== false} onChange={(e) => patch({ voice_enabled: e.target.checked })} />
              {t("corectl.voice_active")}
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("corectl.voice_label")}</p>
              <select
                value={config.voice_name || "marin"}
                onChange={(e) => patch({ voice_name: e.target.value })}
                disabled={config.voice_enabled === false}
                className="h-10 w-full rounded-xl border border-white/10 bg-background/50 px-3 text-xs text-foreground disabled:opacity-50"
              >
                {VOICES.map((voice) => <option key={voice.id} value={voice.id} className="bg-card">{voice.label} · {t(`corectl.voice_note.${voice.id}`)}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">{t("corectl.model_tts")}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("corectl.voice_direction")}</p>
              <Textarea
                rows={3}
                value={config.voice_instructions || ""}
                onChange={(e) => patch({ voice_instructions: e.target.value })}
                disabled={config.voice_enabled === false}
                placeholder={t("corectl.voice_ph")}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant="outline" onClick={previewVoice} disabled={voicePreviewBusy || config.voice_enabled === false}>
              {voicePreviewBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              {t("corectl.preview")}
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={config.voice_auto_speak !== false} onChange={(e) => patch({ voice_auto_speak: e.target.checked })} disabled={config.voice_enabled === false} />
              {t("corectl.auto_speak")}
            </label>
            {voicePreviewResult && <span className="text-[11px] font-medium text-muted-foreground">{voicePreviewResult}</span>}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/50 bg-secondary/20 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Volume2 className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">{t("corectl.support_voice_title")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("corectl.support_voice_desc")}</p>
            </div>
            <label className="flex items-center gap-2 rounded-full border border-border/50 bg-background/40 px-3 py-2 text-xs font-bold">
              <input type="checkbox" checked={config.support_voice_enabled !== false} onChange={(e) => patch({ support_voice_enabled: e.target.checked })} />
              {t("corectl.voice_active")}
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("corectl.voice_label")}</p>
              <select
                value={config.support_voice_name || "coral"}
                onChange={(e) => patch({ support_voice_name: e.target.value })}
                disabled={config.support_voice_enabled === false}
                className="h-10 w-full rounded-xl border border-white/10 bg-background/50 px-3 text-xs text-foreground disabled:opacity-50"
              >
                {VOICES.map((voice) => <option key={voice.id} value={voice.id} className="bg-card">{voice.label} · {t(`corectl.voice_note.${voice.id}`)}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">{t("corectl.model_tts")}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("corectl.voice_direction")}</p>
              <Textarea
                rows={3}
                value={config.support_voice_instructions || ""}
                onChange={(e) => patch({ support_voice_instructions: e.target.value })}
                disabled={config.support_voice_enabled === false}
                placeholder={t("corectl.support_voice_ph")}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant="outline" onClick={previewSupportVoice} disabled={supportVoicePreviewBusy || config.support_voice_enabled === false}>
              {supportVoicePreviewBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              {t("corectl.preview")}
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={config.support_voice_auto_speak !== false} onChange={(e) => patch({ support_voice_auto_speak: e.target.checked })} disabled={config.support_voice_enabled === false} />
              {t("corectl.auto_speak")}
            </label>
            {supportVoicePreviewResult && <span className="text-[11px] font-medium text-muted-foreground">{supportVoicePreviewResult}</span>}
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("painel.core_rules")}</p>
            <Textarea
              rows={4}
              value={config.rules || ""}
              onChange={(e) => patch({ rules: e.target.value })}
              placeholder={t("painel.core_rules_ph")}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("painel.core_kb")}</p>
            <Textarea
              rows={4}
              value={config.knowledge || ""}
              onChange={(e) => patch({ knowledge: e.target.value })}
              placeholder={t("painel.core_kb_ph")}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/10 p-3 text-xs sm:grid-cols-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={config.server_monitoring !== false} onChange={(e) => patch({ server_monitoring: e.target.checked })} /> {t("corectl.audit_periodic")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={config.notify_staff !== false} onChange={(e) => patch({ notify_staff: e.target.checked })} /> {t("corectl.notify_staff")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={config.notify_owner !== false} onChange={(e) => patch({ notify_owner: e.target.checked })} /> {t("corectl.notify_owner")}</label>
          <p className="text-[11px] text-muted-foreground sm:col-span-3">{t("corectl.safety_hint")}</p>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving || !config.id}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            {t("painel.core_save")}
          </Button>
          <Button size="sm" variant="outline" onClick={auditNow} disabled={auditBusy}>
            {auditBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1 h-3.5 w-3.5" />}
            {t("corectl.check_server")}
          </Button>
          {saved && <span className="text-xs font-semibold text-emerald-400">{t("painel.core_saved")}</span>}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{t("corectl.audit_hint")}</span>
        </div>
        {auditResult && <p className="text-xs font-semibold text-emerald-400">{auditResult}</p>}
      </div>

      <CoreOS mode="owner" />
    </div>
  );
}