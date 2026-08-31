"use client";

import { useCallback, useEffect, useState } from "react";

/** Página pública com QR do WhatsApp (via WAHA local). */
export default function DevQrPage() {
  const [erro, setErro] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);

  const recarregar = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    fetch("/api/dev/tunnel-url")
      .then((r) => r.json())
      .then((j: { data?: { url?: string } }) => setTunnelUrl(j.data?.url ?? null))
      .catch(() => setTunnelUrl(null));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Conectar WhatsApp</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Escaneie com o app WhatsApp em Aparelhos conectados. O QR renova automaticamente.
        </p>
      </div>

      <div className="flex min-h-[280px] min-w-[280px] items-center justify-center rounded-2xl border bg-card p-4 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={tick}
          src={`/api/dev/whatsapp-qr?t=${tick}`}
          alt="QR Code WhatsApp"
          className="max-h-64 max-w-64"
          onError={() => setErro("Não foi possível carregar o QR. Verifique se o WAHA está rodando (porta 3030).")}
          onLoad={() => setErro(null)}
        />
      </div>

      {erro ? <p className="max-w-md text-center text-sm text-destructive">{erro}</p> : null}

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={recarregar}
          className="rounded-full bg-[hsl(var(--color-spark))] px-4 py-2 text-sm font-medium"
        >
          Atualizar QR
        </button>
        <a href="/dev-sidebar-preview" className="rounded-full border px-4 py-2 text-sm">
          Voltar ao preview
        </a>
      </div>

      {tunnelUrl ? (
        <p className="max-w-lg text-center text-xs text-muted-foreground">
          URL pública do app:{" "}
          <a href={tunnelUrl} className="underline">
            {tunnelUrl}
          </a>
        </p>
      ) : null}
    </div>
  );
}
