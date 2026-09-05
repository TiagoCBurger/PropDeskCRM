/**
 * Interpreta a lista de sessões do WAHA para o seed de desenvolvimento.
 *
 * O CRM precisa de uma linha em `channel_sessions` com o mesmo nome que o
 * WAHA já tem no disco. Sem isso o operador reconecta o celular e o app
 * continua no onboarding pedindo QR.
 */

export interface SessaoWahaDev {
  name: string;
  status: string;
  phoneNumber: string | null;
  displayName: string | null;
}

export function parsearSessoesWaha(json: unknown): SessaoWahaDev[] {
  const lista = Array.isArray(json) ? json : json && typeof json === "object" && Array.isArray((json as { sessions?: unknown }).sessions)
    ? (json as { sessions: unknown[] }).sessions
    : [];
  const out: SessaoWahaDev[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    if (!name) continue;
    const status = typeof row.status === "string" ? row.status : "UNKNOWN";
    const me = (row.me && typeof row.me === "object" ? row.me : {}) as Record<string, unknown>;
    out.push({
      name,
      status,
      phoneNumber: telefoneDeMe(me),
      displayName: typeof me.pushName === "string" ? me.pushName : typeof me.name === "string" ? me.name : null,
    });
  }
  return out;
}

export function sessoesProntasParaOCrm(sessoes: SessaoWahaDev[]): SessaoWahaDev[] {
  return sessoes.filter((s) => s.status.toUpperCase() === "WORKING");
}

/**
 * WAHA nesta máquina (Docker) vs WAHA que vive fora do pod.
 *
 * Só o segundo sobrevive a um Cloud Agent novo: volume Docker morre com a VM.
 */
export function wahaEhRemoto(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
  try {
    const host = new URL(u).hostname;
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return false;
  }
}

function telefoneDeMe(me: Record<string, unknown>): string | null {
  const id = typeof me.id === "string" ? me.id : typeof me.jid === "string" ? me.jid : "";
  if (!id) return typeof me.phone === "string" ? me.phone : null;
  const numero = id.replace(/@.*$/, "").replace(/\D/g, "");
  return numero ? `+${numero}` : null;
}
