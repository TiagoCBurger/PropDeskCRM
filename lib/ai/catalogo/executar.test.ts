import { afterEach, describe, expect, it } from "vitest";

import {
  resetarDedupDoCatalogoParaTeste,
  sincronizarCatalogo,
  sincronizarCatalogoComDedup,
} from "@/lib/ai/catalogo/executar";
import type { ModeloDaOpenRouter } from "@/lib/ai/catalogo/openrouter";

afterEach(() => {
  resetarDedupDoCatalogoParaTeste();
});

function origem(id: string): ModeloDaOpenRouter {
  return {
    id,
    name: id,
    supported_parameters: ["tools"],
    pricing: { prompt: "0.000001", completion: "0.000002" },
  };
}

function adminFalso(opts?: { existentes?: { model_id: string; deprecated_at: string | null }[] }) {
  const upserts: unknown[] = [];
  const updates: unknown[] = [];
  return {
    upserts,
    updates,
    from: (_t: string) => {
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        upsert: (payload: unknown) => {
          upserts.push(payload);
          return Promise.resolve({ error: null });
        },
        update: (payload: unknown) => {
          updates.push(payload);
          return b;
        },
        then: (ok: (r: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: opts?.existentes ?? [], error: null }).then(ok),
      };
      return b;
    },
  };
}

describe("sincronizarCatalogo", () => {
  it("grava o que a origem devolveu", async () => {
    const admin = adminFalso();
    const r = await sincronizarCatalogo(admin as never, async () => [origem("acme/modelo")]);
    expect(r.recebidos).toBe(1);
    expect(r.gravados).toBe(1);
    expect(admin.upserts).toHaveLength(1);
  });
});

describe("sincronizarCatalogoComDedup", () => {
  it("duas chamadas no ar compartilham a mesma ida à origem", async () => {
    let buscas = 0;
    const buscar = async () => {
      buscas += 1;
      await new Promise((r) => setTimeout(r, 20));
      return [origem("acme/modelo")];
    };
    const a = adminFalso();
    const p1 = sincronizarCatalogoComDedup(a as never, buscar);
    const p2 = sincronizarCatalogoComDedup(a as never, buscar);
    await Promise.all([p1, p2]);
    expect(buscas).toBe(1);
  });
});
