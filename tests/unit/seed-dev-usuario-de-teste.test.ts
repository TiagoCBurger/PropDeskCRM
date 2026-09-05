import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * O login extra de desenvolvimento mora só no stack local, nunca no instalador
 * da VPS. Sem este gate, o e-mail de teste entra no `install.sh` na próxima
 * cópia e nasce em produção.
 */
describe("usuário de teste do seed local", () => {
  const email = "ticburger@gmail.com";

  it("o stack local semeia o e-mail", () => {
    const fonte = readFileSync("scripts/cloud-agent-dev-stack.sh", "utf8");
    expect(fonte).toContain(`DEV_TEST_EMAIL="\${DEV_TEST_EMAIL:-${email}}"`);
    expect(fonte).toMatch(/semeia_usuario_de_teste/);
    expect(fonte).toMatch(/aplica_secrets_do_cursor/);
    expect(fonte).toMatch(/sobe_waha_local/);
    expect(fonte).toMatch(/semeia_ia_e_canal/);
  });

  it("o instalador da VPS não leva esse e-mail", () => {
    const fonte = readFileSync("hostgator-setup-kit/install.sh", "utf8");
    expect(fonte).not.toContain(email);
  });

  it("o instalador da VPS não sobe o seed de Secrets do Cursor", () => {
    const fonte = readFileSync("hostgator-setup-kit/install.sh", "utf8");
    expect(fonte).not.toContain("semeia-dev-ia-e-canal");
    expect(fonte).not.toContain("aplica-secrets-cursor");
  });
});
