/**
 * O job `deploy-vps` existe para ligar depois — a VPS ainda não foi alugada.
 * Sem este gate, o job nasce falhando o pipeline (secrets vazios = exit 1)
 * ou some e o operador não tem o interruptor documentado no YAML.
 *
 * Não é parser de YAML: strings que o job TEM de conter. Sem parser, um
 * regex que parou de casar não pode ficar verde vigiando nada — o job()
 * vazio reprova no primeiro caso.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const publish = fs.readFileSync(path.join(RAIZ, ".github/workflows/publish-image.yml"), "utf8");

function job(yml: string, nome: string): string {
  const linhas = yml.split("\n");
  const i = linhas.findIndex((l) => l === `  ${nome}:`);
  if (i === -1) return "";
  const fim = linhas.findIndex((l, n) => n > i && /^ {2}[a-z-]+:$/.test(l));
  return linhas.slice(i, fim === -1 ? undefined : fim).join("\n");
}

describe("deploy-vps é opt-in e não quebra o pipeline sem VPS", () => {
  const t = job(publish, "deploy-vps");

  it("o job existe depois de imagens-ok", () => {
    expect(t, "deploy-vps sumiu de publish-image.yml").not.toBe("");
    expect(t).toMatch(/needs:\s*\[[^\]]*imagens-ok/);
  });

  it("declara permissions: contents: read — sem escrita", () => {
    expect(t).toMatch(/^ {4}permissions:/m);
    expect(t).toMatch(/contents:\s*read/);
    expect(t).not.toMatch(/packages:\s*write/);
    expect(t).not.toMatch(/contents:\s*write/);
  });

  it("só no push do repo canônico — nunca em PR, nunca em fork", () => {
    expect(t).toContain("github.event_name == 'push'");
    expect(t).toContain("github.event.repository.fork == false");
    expect(t).toMatch(/refs\/heads\/main/);
  });

  it("sem VPS_HOST/USER/SSH_KEY o passo sai zero e escreve o resumo", () => {
    expect(t).toContain("VPS_HOST");
    expect(t).toContain("VPS_USER");
    expect(t).toContain("VPS_SSH_KEY");
    expect(t).toContain("GITHUB_STEP_SUMMARY");
    expect(t).toMatch(/skip=true/);
  });

  it("o caminho canônico é update.sh — não um protocolo paralelo", () => {
    expect(t).toContain("hostgator-setup-kit/update.sh");
    expect(t).toContain("docker-compose.prod.yml");
    expect(t).toContain("docker-compose.traefik.yml");
  });

  it("não ecoa a chave e não desliga StrictHostKeyChecking", () => {
    const semComentario = t
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");
    expect(semComentario).not.toMatch(/set\s+-x/);
    expect(semComentario).not.toMatch(/echo\s+\$\{?VPS_SSH_KEY/);
    expect(semComentario).not.toMatch(/StrictHostKeyChecking=no/);
  });
});
