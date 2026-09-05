import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const fonte = readFileSync("scripts/cloud-agent-dev-stack.sh", "utf8");

describe("persistência local do stack Cloud Agent", () => {
  it("grava Postgres e WAHA no worktree, não em volume Docker anônimo", () => {
    expect(fonte).toContain('.cursor/dev-persist');
    expect(fonte).toContain("PERSIST_PG=");
    expect(fonte).toContain("PERSIST_WAHA_SESS=");
    expect(fonte).toMatch(/\$PERSIST_PG:\/var\/lib\/postgresql\/data/);
    expect(fonte).toMatch(/\$PERSIST_WAHA_SESS:\/app\/\.sessions/);
    expect(fonte).not.toMatch(
      /-v supabase_db_deskcomm-crm:\/var\/lib\/postgresql\/data/,
    );
    expect(fonte).not.toMatch(/-v deskcomm-waha-sessions:\/app\/\.sessions/);
  });

  it("migra volume antigo para o disco sem docker volume rm", () => {
    expect(fonte).toMatch(/copia_volume_para_dir supabase_db_deskcomm-crm/);
    expect(fonte).toMatch(/copia_volume_para_dir deskcomm-waha-sessions/);
    expect(fonte).not.toMatch(/docker volume rm/);
  });

  it("reusa a chave WAHA persistida (sessão some se a chave girar)", () => {
    expect(fonte).toContain("PERSIST_WAHA_KEY=");
    expect(fonte).toMatch(/chave_waha_persistida/);
  });
});
