/**
 * Fábrica da porta de object storage. Único ponto em que o backend é escolhido.
 *
 * `STORAGE_BACKEND=r2` sem credenciais NÃO cai em supabase (fail-closed).
 * Default `supabase` para quem já instalou e não declara a chave.
 */

import { logger } from "@/lib/logger";
import { backendDeStorage, credenciaisR2 } from "./backend";
import { portaFechada, portaR2 } from "./r2";
import { portaSupabase } from "./supabase";
import type { StoragePort } from "./types";

export type { StoragePort, StorageBackend, StorageErro } from "./types";
export { backendDeStorage, credenciaisR2, basePublicaR2, chavePublicaR2 } from "./backend";

let avisouR2Incompleto = false;

export function objectStorage(bucket: string): StoragePort {
  if (backendDeStorage() === "r2") {
    const c = credenciaisR2();
    if (!c.ok) {
      if (!avisouR2Incompleto) {
        avisouR2Incompleto = true;
        logger.error("[storage] R2 selecionado mas incompleto", { motivo: c.motivo });
      }
      return portaFechada(c.motivo);
    }
    return portaR2(bucket, c.creds);
  }
  return portaSupabase(bucket);
}
