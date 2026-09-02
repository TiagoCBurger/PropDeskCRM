/**
 * GET/POST /api/v1/cron/sync-model-catalog — o catálogo que se atualiza sozinho.
 *
 * A OpenRouter publica ~400 modelos de ~58 fabricantes e a lista muda sozinha.
 * Até aqui, `ai_models` era semeada por migration: a cada modelo novo do
 * mercado, o self-hoster precisava esperar uma release do DeskcommCRM para
 * poder escolhê-lo — e o preço da tabela envelhecia junto, o que não é
 * cosmético: é o número que faz o teto de orçamento da organização disparar na
 * hora certa, ou não disparar.
 *
 * Este cron busca o catálogo público (sem chave — o endpoint de modelos da
 * OpenRouter é aberto), traduz e concilia. A regra da conciliação vive em
 * `lib/ai/catalogo/sincronizar.ts`; o I/O em `lib/ai/catalogo/executar.ts`
 * (o mesmo que o onboarding chama na hora, para ninguém esperar o dia seguinte).
 *
 * O que ele deliberadamente NÃO faz:
 *
 *  - **não apaga nada.** Modelo que sai da origem recebe `deprecated_at`. A
 *    linha continua referenciada pelo histórico de custo, e apagá-la faria o
 *    relatório do mês passado perder o preço com que a conta foi somada.
 *  - **não toca em linha de outra origem.** `source = 'manual'` é a curadoria
 *    que veio nas migrations; varrer a tabela inteira apagaria os defaults
 *    recomendados sem o operador nunca saber por quê.
 *  - **não aceita resposta suspeita.** Origem devolvendo menos da metade do que
 *    já conhecíamos aborta a rodada — ver o piso de sanidade. Catálogo
 *    desatualizado é recuperável; catálogo esvaziado por um soluço de rede
 *    custa a confiança na tela.
 *
 * Auth: mesmo contrato dos demais crons (Bearer `INTERNAL_CRON_SECRET` |
 * `INTERNAL_SECRET`, fail-closed).
 *
 * NOTA DE DEPLOY: o agendamento vive no serviço `scheduler` do
 * `docker-compose.prod.yml`, como os outros crons — não há `vercel.json` neste
 * repo. Cadência diária continua valendo para PREÇO e modelo novo no seletor;
 * o primeiro dia do wizard NÃO espera essa cadência.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { FONTE_OPENROUTER } from "@/lib/ai/catalogo/openrouter";
import { CatalogoSuspeitoError } from "@/lib/ai/catalogo/sincronizar";
import { buscarDaOpenRouter, sincronizarCatalogo } from "@/lib/ai/catalogo/executar";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export { sincronizarCatalogo };

function autorizado(req: NextRequest): boolean {
  const esperado = env.INTERNAL_CRON_SECRET || env.INTERNAL_SECRET;
  if (!esperado) return false; // fail-closed
  return req.headers.get("authorization") === `Bearer ${esperado}`;
}

async function handler(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizado(req)) {
    return fail("unauthorized", "cron secret ausente ou inválido", 401, { requestId });
  }
  try {
    const resultado = await sincronizarCatalogo(createAdminClient(), buscarDaOpenRouter);
    logger.info("[sync-model-catalog] concluído", { ...resultado, request_id: requestId });
    return ok(resultado, { requestId });
  } catch (err) {
    if (err instanceof CatalogoSuspeitoError) {
      logger.warn("[sync-model-catalog] rodada recusada pelo piso de sanidade", {
        recebidos: err.recebidos,
        conhecidos: err.conhecidos,
        request_id: requestId,
      });
      return ok(
        { fonte: FONTE_OPENROUTER, recusado: true, motivo: err.message },
        { requestId },
      );
    }
    const detalhe = err instanceof Error ? err.message : String(err);
    logger.error("[sync-model-catalog] falhou", { error: detalhe, request_id: requestId });
    return fail("cron_failed", detalhe, 500, { requestId });
  }
}

export const GET = handler;
export const POST = handler;
