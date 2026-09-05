/**
 * Copia Secrets do processo (painel Cursor) para `.env.local`.
 * Rodado no `start` do Cloud Agent, antes do Next.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { aplicarSecretsNoEnvLocal, CHAVES_DE_IA_DO_CURSOR } from "../lib/dev/cursor-secrets";

const CHAVES_DO_CANAL = ["WAHA_API_BASE_URL", "WAHA_API_KEY", "WAHA_WEBHOOK_BASE_URL"] as const;

const arquivo = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(arquivo)) {
  console.log("[secrets] .env.local ausente — nada a copiar.");
  process.exit(0);
}
const r = aplicarSecretsNoEnvLocal(fs.readFileSync(arquivo, "utf8"), process.env, [
  ...CHAVES_DE_IA_DO_CURSOR,
  ...CHAVES_DO_CANAL,
]);
fs.writeFileSync(arquivo, r.texto);
console.log(
  r.gravou.length
    ? `[secrets] copiei do painel: ${r.gravou.join(", ")}`
    : "[secrets] painel sem chaves novas — .env.local intacto.",
);
