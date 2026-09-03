"use server";

/**
 * A CHAVE DA INTELIGÊNCIA, PEDIDA ONDE ELA FALTA.
 *
 * O passo 1 já MEDE se a instalação trouxe chave, e quando não trouxe escrevia
 * "Falta a chave da inteligência artificial" — um diagnóstico correto e um beco:
 * a pessoa lê que falta e não tem o que fazer com a informação. Ela teria de
 * descobrir sozinha que existe uma tela de credenciais, e onde.
 *
 * Aqui ela cola a chave no passo em que a chave passa a importar — o de treinar,
 * imediatamente antes de o funcionário ser criado com ela.
 *
 * ⚠️ O MIOLO NÃO MORA AQUI. Cifrar, gravar, auditar e validar é
 * `lib/ai/credenciais/guardar.ts`, o mesmo caminho que a rota REST usa: cada
 * item dessa lista tem consequência de segurança se as duas cópias divergirem.
 */
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { guardarCredencial, mensagemAoFalharGuardar } from "@/lib/ai/credenciais/guardar";
import {
  ehProvedorLiberadoParaEscolha,
  IDS_DE_PROVEDOR,
  MENSAGEM_PROVEDOR_AINDA_NAO_LIBERADO,
} from "@/lib/ai/pontos/provedores";
import type { Provider } from "@/lib/ai/provider-validators";
import { requireOnboardingCtx, OnboardingError } from "./_shared";

export type ResultadoDaChave = { ok: true; final: string } | { ok: false; erro: string };

export async function salvarChaveDaIa(formData: FormData): Promise<ResultadoDaChave> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
    throw err;
  }

  // Guardar chave de provedor é ação de administrador, igual à rota REST. Quem
  // faz o onboarding é o dono, mas o papel é verificado e não presumido.
  if (ctx.role !== "admin") {
    return { ok: false, erro: "Só um administrador pode cadastrar a chave da inteligência artificial." };
  }

  const provider = String(formData.get("provider") ?? "");
  if (!(IDS_DE_PROVEDOR as readonly string[]).includes(provider)) {
    return { ok: false, erro: "Escolha qual inteligência artificial você contratou." };
  }
  if (!ehProvedorLiberadoParaEscolha(provider)) {
    return { ok: false, erro: MENSAGEM_PROVEDOR_AINDA_NAO_LIBERADO };
  }

  const apiKey = String(formData.get("api_key") ?? "").trim();
  if (apiKey.length < 8) {
    return { ok: false, erro: "Essa chave parece incompleta. Cole a chave inteira, do começo ao fim." };
  }

  const r = await guardarCredencial({
    admin: createAdminClient(),
    orgId: ctx.orgId,
    userId: ctx.userId,
    provider: provider as Provider,
    // O nome existe para a pessoa reconhecer a chave depois, na tela de
    // credenciais — não é identificador.
    label: "Chave do onboarding",
    apiKey,
  });

  if (!r.ok) {
    return { ok: false, erro: mensagemAoFalharGuardar(r) };
  }

  // Sem isto, a chave OpenRouter fica no cofre e o runtime continua lendo
  // `settings.llm.provider = anthropic` (o default do trigger). O retrato e o
  // agente procuram a chave do provedor errado.
  await alinharProvedorDaOrg(ctx.orgId, provider);

  // O passo lê o retrato da instalação no servidor; sem invalidar, ele seguiria
  // dizendo que falta a chave que acabou de ser cadastrada.
  revalidatePath("/onboarding", "layout");
  return { ok: true, final: r.last4 };
}

async function alinharProvedorDaOrg(orgId: string, provider: string): Promise<void> {
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const settings = ((org as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<
    string,
    unknown
  >;
  const llm = ((settings["llm"] as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  if (llm["provider"] === provider) return;
  await admin
    .from("organizations")
    .update({ settings: { ...settings, llm: { ...llm, provider } } } as never)
    .eq("id", orgId);
}
