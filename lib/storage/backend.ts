/**
 * Resolução do backend de storage. Módulo propositalmente SEM `node:*` e SEM
 * `@/lib/env`: `lib/branding/logo.ts` roda nos dois lados da fronteira, e puxar
 * o adapter R2 (crypto, fetch) para o bundle do navegador quebraria o login.
 *
 * Lê `process.env` / `window.__PUBLIC_ENV__` na HORA DA CHAMADA, não no import:
 * teste consegue setar `STORAGE_BACKEND=r2` sem reimportar `lib/env.ts`.
 */

import type { CredenciaisR2, StorageBackend } from "./types";

function ler(chave: string): string {
  if (typeof window !== "undefined") {
    const runtime = window.__PUBLIC_ENV__ as unknown as Record<string, string | undefined> | undefined;
    return (runtime?.[chave] ?? "").trim();
  }
  return ((process.env as Record<string, string | undefined>)[chave] ?? "").trim();
}

/**
 * Default `supabase`: instalação existente não declara a chave e continua no
 * Storage do projeto. Valor desconhecido também cai em `supabase` — um typo
 * no `.env` não pode derrubar o app inteiro (o `safeParse` de `lib/env.ts`
 * lança, e o healthcheck TCP deixaria o contêiner `healthy` com 500).
 */
export function backendDeStorage(): StorageBackend {
  return ler("STORAGE_BACKEND").toLowerCase() === "r2" ? "r2" : "supabase";
}

export function basePublicaR2(): string {
  return ler("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
}

/**
 * Bucket físico único, se o operador preencheu `R2_BUCKET`. Não é segredo —
 * o browser precisa para montar a URL pública do logo igual à da porta.
 */
export function bucketFisicoR2(): string {
  return ler("R2_BUCKET");
}

/**
 * Chave pública de um objeto — a mesma regra da porta (`lib/storage/r2.ts`),
 * sem credenciais: bucket físico preenchido ⇒ o nome lógico vira prefixo.
 */
export function chavePublicaR2(logico: string, path: string): string {
  const limpo = path.replace(/^\/+/, "");
  return bucketFisicoR2() ? `${logico}/${limpo}` : limpo;
}

/**
 * Credenciais R2. NÃO devolve os valores secretos em `motivo` — só os NOMES
 * das chaves que faltam. Fail-closed: incompleto nunca cai em supabase.
 */
export function credenciaisR2(): { ok: true; creds: CredenciaisR2 } | { ok: false; motivo: string } {
  const accountId = ler("R2_ACCOUNT_ID");
  const accessKeyId = ler("R2_ACCESS_KEY_ID");
  const secretAccessKey = ler("R2_SECRET_ACCESS_KEY");
  const region = ler("R2_REGION") || "auto";
  const bucket = ler("R2_BUCKET");
  const publicBaseUrl = ler("R2_PUBLIC_BASE_URL");
  const endpointRaw = ler("R2_ENDPOINT");

  const faltando: string[] = [];
  if (!accountId) faltando.push("R2_ACCOUNT_ID");
  if (!accessKeyId) faltando.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) faltando.push("R2_SECRET_ACCESS_KEY");
  if (faltando.length > 0) {
    return {
      ok: false,
      motivo: `STORAGE_BACKEND=r2 mas faltam ${faltando.join(", ")}. Preencha-as ou volte STORAGE_BACKEND=supabase.`,
    };
  }

  const endpoint = (endpointRaw || `https://${accountId}.r2.cloudflarestorage.com`).replace(
    /\/+$/,
    "",
  );

  return {
    ok: true,
    creds: {
      accountId,
      accessKeyId,
      secretAccessKey,
      endpoint,
      region,
      bucket,
      publicBaseUrl,
    },
  };
}
