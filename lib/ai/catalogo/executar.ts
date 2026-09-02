/**
 * I/O do catálogo de modelos — o que o cron e o onboarding precisam fazer IGUAL.
 *
 * A regra (o que gravar / depreciar / ressuscitar) mora em `sincronizar.ts`.
 * Aqui é buscar na origem e aplicar o plano no banco. Extraído da rota de cron
 * porque o wizard NÃO PODE esperar o agendamento diário: quem cola a chave da
 * OpenRouter e cria o atendente no mesmo minuto precisa da lista NA HORA, senão
 * o funcionário nasce rascunho e a tela manda esperar até amanhã — um conselho
 * que nunca resolve o primeiro dia.
 *
 * O endpoint de modelos da OpenRouter é público (sem chave). Timeout curto: se
 * a origem não responde, o onboarding fala a verdade e oferece tentar de novo,
 * em vez de fingir que o problema é "a lista ainda não chegou".
 */
import {
  FONTE_OPENROUTER,
  traduzirCatalogo,
  type ModeloDaOpenRouter,
} from "@/lib/ai/catalogo/openrouter";
import {
  planejarSincronizacao,
  type ModeloExistente,
} from "@/lib/ai/catalogo/sincronizar";
import type { createAdminClient } from "@/lib/supabase/admin";

const ENDPOINT_DO_CATALOGO = "https://openrouter.ai/api/v1/models";
const TIMEOUT_MS = 20_000;

export interface ResultadoDaSincronizacao {
  fonte: string;
  recebidos: number;
  gravados: number;
  depreciados: number;
  ressuscitados: number;
}

export async function buscarDaOpenRouter(): Promise<ModeloDaOpenRouter[]> {
  const res = await fetch(ENDPOINT_DO_CATALOGO, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`catalogo_origem_status_${res.status}`);
  const json = (await res.json()) as { data?: ModeloDaOpenRouter[] };
  if (!Array.isArray(json.data)) {
    throw new Error("catalogo_origem_shape_inesperado — a resposta não trouxe `data` como lista");
  }
  return json.data;
}

export async function sincronizarCatalogo(
  admin: ReturnType<typeof createAdminClient>,
  buscar: () => Promise<ModeloDaOpenRouter[]> = buscarDaOpenRouter,
): Promise<ResultadoDaSincronizacao> {
  const daOrigem = traduzirCatalogo(await buscar());

  const { data: existentes, error: erroLeitura } = await admin
    .from("ai_models")
    .select("model_id, deprecated_at")
    .eq("source", FONTE_OPENROUTER);
  if (erroLeitura) throw new Error(`catalogo_leitura_falhou: ${erroLeitura.message}`);

  const plano = planejarSincronizacao(daOrigem, (existentes ?? []) as ModeloExistente[]);

  const agora = new Date().toISOString();

  if (plano.paraGravar.length > 0) {
    const { error } = await admin.from("ai_models").upsert(
      plano.paraGravar.map((l) => ({ ...l, synced_at: agora, deprecated_at: null })),
      { onConflict: "provider,model_id" },
    );
    if (error) throw new Error(`catalogo_upsert_falhou: ${error.message}`);
  }

  if (plano.paraDepreciar.length > 0) {
    const { error } = await admin
      .from("ai_models")
      .update({ deprecated_at: agora })
      .eq("source", FONTE_OPENROUTER)
      .in("model_id", plano.paraDepreciar);
    if (error) throw new Error(`catalogo_depreciacao_falhou: ${error.message}`);
  }

  return {
    fonte: FONTE_OPENROUTER,
    recebidos: daOrigem.length,
    gravados: plano.paraGravar.length,
    depreciados: plano.paraDepreciar.length,
    ressuscitados: plano.paraRessuscitar.length,
  };
}

/**
 * Uma ida à origem por vez. O wizard dispara na hora de guardar a chave E na
 * hora de criar o atendente: sem isto, dois cliques rápidos fariam duas listas
 * de 400 modelos competindo pelo mesmo upsert.
 */
let emVoo: Promise<ResultadoDaSincronizacao> | null = null;

export function sincronizarCatalogoComDedup(
  admin: ReturnType<typeof createAdminClient>,
  buscar?: () => Promise<ModeloDaOpenRouter[]>,
): Promise<ResultadoDaSincronizacao> {
  if (!emVoo) {
    emVoo = sincronizarCatalogo(admin, buscar).finally(() => {
      emVoo = null;
    });
  }
  return emVoo;
}

/** Só para testes — sem isto o dedup vaza estado entre casos. */
export function resetarDedupDoCatalogoParaTeste(): void {
  emVoo = null;
}
