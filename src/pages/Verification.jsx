import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import PageShell from "@/components/PageShell";
import VerificationStatus from "@/components/verification/VerificationStatus";
import VerificationAppealForm from "@/components/verification/VerificationAppealForm";
import { Loader2, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function Verification() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [beginning, setBeginning] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await base44.functions.invoke("manageVerification", { action: "my_status" });
      setData(response.data || {});
    } catch (e) {
      setError(e?.response?.data?.error || t("verification.load_error"));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const begin = async () => {
    if (!data?.case?.id || beginning) return;
    setBeginning(true);
    setNotice("");
    try {
      await base44.functions.invoke("manageVerification", { action: "begin", case_id: data.case.id });
      setNotice(t("verification.started"));
      await load();
    } catch (e) {
      setNotice(e?.response?.data?.error || t("verification.start_error"));
    } finally {
      setBeginning(false);
    }
  };

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  return (
    <PageShell className="mx-auto max-w-4xl" label={t("security.title")} title={t("verification.title")} subtitle={t("verification.subtitle")}>
      {error ? <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : !data?.case ? (
        <div className="rounded-3xl border border-border/50 bg-card/60 p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-emerald-400" /><h2 className="mt-4 font-heading text-xl font-bold">{t("verification.none_title")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("verification.none_body")}</p></div>
      ) : <div className="space-y-5"><VerificationStatus item={data.case} onBegin={begin} beginning={beginning} />{notice && <p role="status" className="rounded-2xl border border-border/50 bg-secondary/40 p-3 text-sm font-semibold">{notice}</p>}{data.case.appeal_available && <VerificationAppealForm caseId={data.case.id} disabled={(data.appeals || []).some((item) => ["pending", "needs_info"].includes(item.status))} onDone={load} />}</div>}
    </PageShell>
  );
}