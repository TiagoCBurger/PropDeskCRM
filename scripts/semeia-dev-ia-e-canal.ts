/**
 * Semeia no tenant local a chave de IA dos Secrets do Cursor e as sessões
 * WORKING que o WAHA já tem no disco (ou num WAHA remoto apontado no painel).
 *
 * Só roda contra Auth em 127.0.0.1 / localhost — recusa nuvem.
 * Idempotente. Não imprime chave nem telefone.
 *
 *   pnpm exec tsx scripts/semeia-dev-ia-e-canal.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { escolherChaveDeIa, supabaseEhDevLocal } from "../lib/dev/cursor-secrets";
import { anunciarDestino, credenciaisSupabaseDeTeste } from "./lib/env-de-teste";
import { parsearSessoesWaha, sessoesProntasParaOCrm } from "../lib/waha/sessoes-dev";

const LABEL = "Chave do ambiente Cursor";
const ORG_SLUG = (process.env.OWNER_ORG_NAME ?? "Dev Local")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 40) || "dev-local";

async function main(): Promise<void> {
  const credenciais = credenciaisSupabaseDeTeste();
  anunciarDestino("semeia-dev-ia-e-canal", credenciais);
  if (!supabaseEhDevLocal(credenciais.url)) {
    console.error("[seed-dev] recusei: este script só grava no Auth local.");
    process.exit(1);
  }

  for (const [k, v] of Object.entries(lerArquivoDotenv(".env.local"))) {
    if (!process.env[k]) process.env[k] = v;
  }

  const admin = createClient(credenciais.url, credenciais.serviceRole, {
    auth: { persistSession: false },
  });

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, settings")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (orgErr || !org) {
    console.error("[seed-dev] org local não encontrada; rode o bootstrap-owner antes.");
    process.exit(1);
  }
  const orgId = (org as { id: string }).id;

  const { data: users } = await admin.auth.admin.listUsers();
  const dono =
    users.users.find((u) => u.email === (process.env.DEV_TEST_EMAIL ?? process.env.OWNER_EMAIL)) ??
    users.users[0];
  if (!dono) {
    console.error("[seed-dev] nenhum usuário no Auth local.");
    process.exit(1);
  }

  await semearIa(admin, orgId, dono.id, (org as { settings?: Record<string, unknown> }).settings);
  await semearCanal(admin, orgId);
}

async function semearIa(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  settings: Record<string, unknown> | undefined,
): Promise<void> {
  const escolhida = escolherChaveDeIa(process.env);
  if (!escolhida) {
    console.log("[seed-dev] nenhuma chave de IA no ambiente (ANTHROPIC_API_KEY / OPENROUTER_API_KEY).");
    return;
  }

  const { encryptKey, bufToBytea } = await import("../lib/crypto/aes_gcm");
  const encrypted = encryptKey(escolhida.apiKey);

  const { data: existente } = await admin
    .from("ai_provider_credentials")
    .select("id, api_key_last4")
    .eq("organization_id", orgId)
    .eq("provider", escolhida.provider)
    .eq("label", LABEL)
    .maybeSingle();

  const last4 = encrypted.last4;
  if (existente && (existente as { api_key_last4: string }).api_key_last4 === last4) {
    console.log(`[seed-dev] chave de IA já no tenant (${escolhida.provider}, final ${last4}).`);
  } else if (existente) {
    const { error } = await admin
      .from("ai_provider_credentials")
      .update({
        api_key_encrypted: bufToBytea(encrypted.ciphertext),
        api_key_iv: bufToBytea(encrypted.iv),
        api_key_tag: bufToBytea(encrypted.tag),
        api_key_last4: last4,
        is_active: true,
        validated_at: new Date().toISOString(),
      })
      .eq("id", (existente as { id: string }).id)
      .eq("organization_id", orgId);
    if (error) throw new Error(`atualizar credencial: ${error.message}`);
    console.log(`[seed-dev] chave de IA atualizada (${escolhida.provider}, final ${last4}).`);
  } else {
    const { guardarCredencial } = await import("../lib/ai/credenciais/guardar");
    const r = await guardarCredencial({
      admin: admin as never,
      orgId,
      userId,
      provider: escolhida.provider,
      label: LABEL,
      apiKey: escolhida.apiKey,
    });
    if (!r.ok) throw new Error(`guardar credencial: ${r.motivo}`);
    await admin
      .from("ai_provider_credentials")
      .update({ validated_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("organization_id", orgId);
    console.log(`[seed-dev] chave de IA semeada (${escolhida.provider}, final ${r.last4}).`);
  }

  const llm = ((settings?.llm as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  if (llm.provider !== escolhida.provider) {
    await admin
      .from("organizations")
      .update({
        settings: { ...(settings ?? {}), llm: { ...llm, provider: escolhida.provider } },
      } as never)
      .eq("id", orgId);
  }
}

async function semearCanal(
  admin: ReturnType<typeof createClient>,
  orgId: string,
): Promise<void> {
  const baseUrl = (process.env.WAHA_API_BASE_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.WAHA_API_KEY ?? "";
  if (!baseUrl || !apiKey) {
    console.log("[seed-dev] WAHA sem URL/chave — pulando reconciliação de canal.");
    return;
  }

  let json: unknown;
  try {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      headers: { "X-Api-Key": apiKey },
    });
    if (!res.ok) {
      console.log(`[seed-dev] WAHA listou sessões com HTTP ${res.status} — pulando canal.`);
      return;
    }
    json = await res.json();
  } catch {
    console.log("[seed-dev] WAHA inacessível — pulando canal.");
    return;
  }

  const prontas = sessoesProntasParaOCrm(parsearSessoesWaha(json));
  if (prontas.length === 0) {
    console.log("[seed-dev] WAHA no ar, nenhuma sessão WORKING (escaneie o QR uma vez neste volume).");
    return;
  }

  for (const s of prontas) {
    const { data: existente } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("waha_session_name", s.name)
      .maybeSingle();

    const linha = {
      organization_id: orgId,
      provider: "waha",
      waha_session_name: s.name,
      status: "WORKING",
      phone_number: s.phoneNumber,
      display_name: s.displayName ?? s.name,
      webhook_secret_encrypted: "\\x00",
    };

    if (existente) {
      const { error } = await admin
        .from("channel_sessions")
        .update(linha)
        .eq("id", (existente as { id: string }).id)
        .eq("organization_id", orgId);
      if (error) throw new Error(`atualizar canal: ${error.message}`);
    } else {
      const { error } = await admin.from("channel_sessions").insert(linha as never);
      if (error) throw new Error(`inserir canal: ${error.message}`);
    }
    console.log(`[seed-dev] canal reconcilado (sessão ${s.name}, WORKING).`);
  }
}

function lerArquivoDotenv(arquivo: string): Record<string, string> {
  const p = path.join(process.cwd(), arquivo);
  if (!fs.existsSync(p)) return {};
  const env: Record<string, string> = {};
  for (const linha of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
    if (m) env[m[1]!] = (m[2] ?? "").replace(/^"(.*)"$/, "$1").trim();
  }
  return env;
}

void main().catch((err) => {
  console.error("[seed-dev]", err instanceof Error ? err.message : err);
  process.exit(1);
});
