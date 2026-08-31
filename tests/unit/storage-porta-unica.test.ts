/**
 * A porta `lib/storage` é o ÚNICO jeito de falar com object storage.
 *
 * Sem este gate, o adapter R2 existe e os call sites voltam a chamar
 * `admin.storage.from` — o `STORAGE_BACKEND=r2` fica verde no `.env` e a
 * mídia continua no Supabase. A allowlist só encolhe.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const RAIZES = ["app", "lib", "workers", "hooks"];
const PERMITIDOS = new Set([
  path.join("lib", "storage", "supabase.ts"),
]);

function eTeste(arquivo: string): boolean {
  return /\.test\.tsx?$/.test(arquivo);
}

function andar(dir: string): string[] {
  const saida: string[] = [];
  if (!fs.existsSync(dir)) return saida;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      saida.push(...andar(p));
      continue;
    }
    if (/\.(ts|tsx)$/.test(ent.name)) saida.push(p);
  }
  return saida;
}

describe("object storage tem uma porta só", () => {
  it("nenhum call site de produção chama .storage.from — só o adapter supabase", () => {
    const ofensoras: string[] = [];
    for (const raiz of RAIZES) {
      for (const arquivo of andar(path.join(RAIZ, raiz))) {
        const rel = path.relative(RAIZ, arquivo);
        if (eTeste(arquivo) || PERMITIDOS.has(rel)) continue;
        const texto = fs.readFileSync(arquivo, "utf8");
        // Comentário de linha não conta: o adapter documenta o que encapsula.
        const efetivo = texto
          .split("\n")
          .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
          .join("\n");
        if (/\.storage\.from\s*\(/.test(efetivo)) ofensoras.push(rel);
      }
    }
    expect(ofensoras, "chame objectStorage(bucket) — lib/storage").toEqual([]);
  });

  it("a fábrica existe (guarda de vacuidade)", () => {
    const fonte = fs.readFileSync(path.join(RAIZ, "lib/storage/index.ts"), "utf8");
    expect(fonte).toMatch(/export function objectStorage\(/);
    expect(fonte).toMatch(/portaFechada/);
  });
});
