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
  });

  it("o instalador da VPS não leva esse e-mail", () => {
    const fonte = readFileSync("hostgator-setup-kit/install.sh", "utf8");
    expect(fonte).not.toContain(email);
  });
});
