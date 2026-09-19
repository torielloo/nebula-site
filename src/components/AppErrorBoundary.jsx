import React from "react";

const CHUNK_RELOAD_KEY = "nebula:chunk-reload-at";

function looksLikeChunkFailure(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    text.includes("failed to fetch dynamically imported module") ||
    text.includes("loading chunk") ||
    text.includes("chunkloaderror") ||
    text.includes("importing a module script failed")
  );
}

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (!looksLikeChunkFailure(error)) return;

    try {
      const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      const now = Date.now();
      if (!lastReload || now - lastReload > 30_000) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
        window.location.reload();
      }
    } catch {
      // A tela de recuperação abaixo continua disponível.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="fixed inset-0 z-[9999] grid place-items-center bg-background p-5 text-foreground">
        <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
            Nébula OS · recuperação
          </p>
          <h1 className="mt-2 font-heading text-xl font-bold">Esta tela encontrou uma falha inesperada.</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Seus dados não foram apagados. Recarregue a interface para buscar a versão mais recente do site.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Recarregar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = "/"; }}
              className="rounded-xl border border-border/70 px-4 py-2 text-sm font-bold"
            >
              Ir para o início
            </button>
          </div>
        </div>
      </div>
    );
  }
}
