/**
 * Secrets do painel do Cloud Agent → `.env.local` (chaves de IA).
 *
 * O painel injeta as chaves como `process.env`. O Next e os scripts de seed
 * leem o arquivo. Sem esta ponte, a chave existe no processo do `start` e o
 * `pnpm dev` (outro processo) nasce vazio.
 *
 * Canal WhatsApp: a ponte da URL/chave mora em `scripts/cloud-agent-dev-stack.sh`
 * (o lint de canal não deixa o nome do provedor em `lib/dev`).
 *
 * Nunca loga valor. Só grava se o ambiente trouxe string não-vazia — vazio no
 * painel não apaga o que já estava no disco.
 */

export const CHAVES_DE_IA_DO_CURSOR = [
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_BASE_URL",
] as const;

export function aplicarSecretsNoEnvLocal(
  arquivo: string,
  env: Record<string, string | undefined>,
  chaves: readonly string[] = CHAVES_DE_IA_DO_CURSOR,
): { texto: string; gravou: string[] } {
  const gravou: string[] = [];
  const linhas = arquivo.replace(/\n$/, "").split("\n");
  const porChave = new Map<string, number>();
  for (let i = 0; i < linhas.length; i++) {
    const m = /^([A-Z0-9_]+)=/.exec(linhas[i] ?? "");
    if (m) porChave.set(m[1]!, i);
  }

  for (const chave of chaves) {
    const valor = (env[chave] ?? "").trim();
    if (!valor) continue;
    gravou.push(chave);
    const linha = `${chave}=${valor}`;
    const idx = porChave.get(chave);
    if (idx === undefined) {
      linhas.push(linha);
      porChave.set(chave, linhas.length - 1);
    } else {
      linhas[idx] = linha;
    }
  }

  return { texto: linhas.join("\n") + "\n", gravou };
}

export function escolherChaveDeIa(env: Record<string, string | undefined>): {
  provider: "anthropic" | "openrouter" | "openai";
  apiKey: string;
} | null {
  const anthropic = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (anthropic) return { provider: "anthropic", apiKey: anthropic };
  const openrouter = (env.OPENROUTER_API_KEY ?? "").trim();
  if (openrouter) return { provider: "openrouter", apiKey: openrouter };
  const openai = (env.OPENAI_API_KEY ?? "").trim();
  if (openai) return { provider: "openai", apiKey: openai };
  return null;
}

/** Seed de canal/IA só fala com Auth local — nunca com um projeto de cliente. */
export function supabaseEhDevLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
