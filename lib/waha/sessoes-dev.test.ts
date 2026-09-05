import { describe, expect, it } from "vitest";

import { parsearSessoesWaha, sessoesProntasParaOCrm, wahaEhRemoto } from "./sessoes-dev";

describe("sessões do canal para o seed local", () => {
  it("só reconcilia WORKING — SCAN_QR_CODE não finge número conectado", () => {
    const sessoes = parsearSessoesWaha([
      { name: "default", status: "WORKING", me: { id: "5511999887766@c.us", pushName: "Teste" } },
      { name: "outra", status: "SCAN_QR_CODE" },
    ]);
    const prontas = sessoesProntasParaOCrm(sessoes);
    expect(prontas).toHaveLength(1);
    expect(prontas[0]?.name).toBe("default");
    expect(prontas[0]?.phoneNumber).toBe("+5511999887766");
  });

  it("endpoint remoto é o que sobrevive a um pod novo", () => {
    expect(wahaEhRemoto("https://canal.exemplo.com")).toBe(true);
    expect(wahaEhRemoto("http://127.0.0.1:3030")).toBe(false);
  });
});
