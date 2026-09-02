import { describe, expect, it } from "vitest";

import { mensagemAoFalharGuardar } from "./guardar";

describe("mensagemAoFalharGuardar", () => {
  it("label duplicado aponta para a tela de credenciais", () => {
    expect(mensagemAoFalharGuardar({ ok: false, motivo: "label_em_uso" })).toMatch(/IA › Credenciais/);
  });

  it("CHECK pré-0127 não pede para tentar de novo", () => {
    const msg = mensagemAoFalharGuardar({
      ok: false,
      motivo: "banco",
      detalhe:
        'new row for relation "ai_provider_credentials" violates check constraint "ai_provider_credentials_provider_check"',
    });
    expect(msg).toMatch(/0127/);
    expect(msg).not.toMatch(/Tente de novo/);
  });

  it("falha genérica de banco continua pedindo para tentar de novo", () => {
    expect(mensagemAoFalharGuardar({ ok: false, motivo: "banco", detalhe: "connection reset" })).toMatch(
      /Tente de novo/,
    );
  });
});
