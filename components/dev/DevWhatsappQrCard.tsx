"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Status =
  | "INIT"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED"
  | "STOPPED"
  | "ERROR"
  | "UNCONFIGURED"
  | "UNREACHABLE"
  | string;

type Props = {
  compacto?: boolean;
  className?: string;
};

/** Card com polling de status + QR do WAHA (dev). */
export function DevWhatsappQrCard({ compacto = false, className }: Props) {
  const [status, setStatus] = useState<Status>("INIT");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qrUrlRef = useRef<string | null>(null);

  const revogarQr = useCallback(() => {
    if (qrUrlRef.current) {
      URL.revokeObjectURL(qrUrlRef.current);
      qrUrlRef.current = null;
    }
    setQrUrl(null);
  }, []);

  const carregarQr = useCallback(async () => {
    revogarQr();
    const res = await fetch("/api/dev/whatsapp-qr", { cache: "no-store" });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(json?.error?.message ?? `QR indisponível (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    qrUrlRef.current = url;
    setQrUrl(url);
  }, [revogarQr]);

  const lerStatus = useCallback(async (iniciar = false) => {
    const res = await fetch(`/api/dev/whatsapp-status?start=${iniciar ? "1" : "0"}`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { status?: Status };
      error?: { message?: string };
    } | null;
    if (!res.ok || !json?.data?.status) {
      throw new Error(json?.error?.message ?? `Status indisponível (${res.status})`);
    }
    return json.data.status;
  }, []);

  const reiniciar = useCallback(async () => {
    setBusy(true);
    setErro(null);
    revogarQr();
    try {
      const res = await fetch("/api/dev/whatsapp-restart", { method: "POST" });
      const json = (await res.json().catch(() => null)) as {
        data?: { status?: Status };
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.data?.status) {
        throw new Error(json?.error?.message ?? "Não consegui reiniciar a sessão");
      }
      setStatus(json.data.status);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setStatus("ERROR");
    } finally {
      setBusy(false);
    }
  }, [revogarQr]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setBusy(true);
      setErro(null);
      try {
        const s = await lerStatus(true);
        if (!cancelado) setStatus(s);
      } catch (e) {
        if (!cancelado) {
          setErro(e instanceof Error ? e.message : String(e));
          setStatus("ERROR");
        }
      } finally {
        if (!cancelado) setBusy(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [lerStatus]);

  useEffect(() => {
    if (status === "WORKING" || status === "FAILED" || status === "ERROR") return;
    const id = setInterval(async () => {
      try {
        const s = await lerStatus(false);
        setStatus(s);
      } catch {
        /* polling silencioso — erro aparece no carregamento do QR */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [status, lerStatus]);

  useEffect(() => {
    if (status !== "SCAN_QR_CODE") {
      revogarQr();
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        await carregarQr();
        if (!cancelado) setErro(null);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [status, carregarQr, revogarQr]);

  useEffect(() => () => revogarQr(), [revogarQr]);

  const preparando = busy || status === "INIT" || status === "STARTING" || status === "STOPPED";

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border bg-card shadow-sm",
          compacto ? "h-44 w-44 p-3" : "h-[280px] w-[280px] p-4",
        )}
      >
        {preparando ? (
          <p className="px-4 text-center text-sm text-muted-foreground">Preparando o QR…</p>
        ) : status === "WORKING" ? (
          <p className="px-4 text-center text-sm font-medium text-emerald-600">WhatsApp conectado</p>
        ) : qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrUrl}
            alt="QR Code WhatsApp"
            className={cn("object-contain", compacto ? "max-h-36 max-w-36" : "max-h-64 max-w-64")}
          />
        ) : (
          <p className="px-4 text-center text-sm text-muted-foreground">Aguardando QR…</p>
        )}
      </div>

      {erro ? <p className="max-w-sm text-center text-sm text-destructive">{erro}</p> : null}

      {(status === "FAILED" || status === "ERROR") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void reiniciar()}
          className="rounded-full bg-[hsl(var(--color-spark))] px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Gerar novo QR
        </button>
      )}

      {!compacto && status === "SCAN_QR_CODE" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void reiniciar()}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Atualizar código
        </button>
      )}
    </div>
  );
}
