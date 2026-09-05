import { describe, expect, it } from "vitest";

import {
  aplicarSecretsNoEnvLocal,
  escolherChaveDeIa,
  supabaseEhDevLocal,
} from "@/lib/dev/cursor-secrets";

describe("secrets do Cursor no .env.local", () => {
  const base = [
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
    "ANTHROPIC_API_KEY=",
    "",
  ].join("\n");

  it("grava a chave do painel por cima do placeholder vazio", () => {
    const r = aplicarSecretsNoEnvLocal(base, { ANTHROPIC_API_KEY: "sk-ant-teste" });
    expect(r.gravou).toEqual(["ANTHROPIC_API_KEY"]);
    expect(r.texto).toMatch(/^ANTHROPIC_API_KEY=sk-ant-teste$/m);
    expect(r.texto).toContain("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321");
  });

  it("não apaga o disco quando o painel não mandou a chave", () => {
    const comValor = "ANTHROPIC_API_KEY=ja-tinha\n";
    const r = aplicarSecretsNoEnvLocal(comValor, { ANTHROPIC_API_KEY: "  " });
    expect(r.gravou).toEqual([]);
    expect(r.texto).toBe("ANTHROPIC_API_KEY=ja-tinha\n");
  });

  it("escolhe Anthropic antes de OpenRouter", () => {
    expect(
      escolherChaveDeIa({
        ANTHROPIC_API_KEY: "sk-ant-x",
        OPENROUTER_API_KEY: "sk-or-x",
      }),
    ).toEqual({ provider: "anthropic", apiKey: "sk-ant-x" });
  });

  it("recusa seed contra um Supabase que não é local", () => {
    expect(supabaseEhDevLocal("https://abcd.supabase.co")).toBe(false);
    expect(supabaseEhDevLocal("http://127.0.0.1:54321")).toBe(true);
  });
});
