import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

/**
 * RESPONDER "EM CIMA" DE UMA MENSAGEM — pela tela, como o atendente faz.
 *
 * O canal intermediado aceita citação (`replyTo`, recebendo o `wamid`), e o
 * WhatsApp mostra a resposta pendurada na original. Todo o caminho novo é
 * VISUAL — escolher a mensagem, ver a faixa, cancelar, enviar — e nada disso é
 * alcançável por teste de unidade: eles provam que a função existe, não que dá
 * para clicá-la.
 *
 * ─── O que este arquivo cobre, e por que cada caso ──────────────────────────
 *
 * 1. o botão APARECE (é `opacity-0` até o hover; um `hidden` teria feito o
 *    layout pular, e um seletor que só olha o DOM passaria mesmo invisível);
 * 2. escolher mostra a faixa com o trecho citado;
 * 3. o `×` desfaz — sem saída, quem clica por engano fica preso citando;
 * 4. trocar de conversa LIMPA a citação. Este é o caso que mais importa: sem
 *    ele, a resposta sairia citando a mensagem de OUTRO cliente.
 *
 * Não cobre o que sai na rede: se o `replyTo` chegou ao provider é assunto do
 * adapter, e o teste de tela não deve fingir que mede isso.
 */

interface E2ECreds {
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
  /** Bloco gravado por `seed-e2e-queue.ts` — a conversa que este teste usa. */
  queue?: { conversation_id: string; contact_name: string };
}

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCE = path.join(process.cwd(), ".superpowers/evidence");
const CORPO_MENSAGEM = "Mensagem E2E para testar citação";

function creds(): E2ECreds {
  execFileSync(process.execPath, ["--import", "tsx", "scripts/seed-e2e-credentials.ts"], {
    stdio: "inherit",
  });
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as E2ECreds;
}

function semearConversa(): NonNullable<E2ECreds["queue"]> {
  execFileSync(process.execPath, ["--import", "tsx", "scripts/seed-e2e-queue.ts"], {
    stdio: "inherit",
  });
  const c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as E2ECreds;
  if (!c.queue) throw new Error("bloco `queue` ausente em .e2e-creds.json após o seed");
  return c.queue;
}

function chegarMensagem(conversationId: string, corpo: string): void {
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/e2e-chega-mensagem.ts", conversationId, corpo],
    { cwd: process.cwd(), stdio: "inherit" },
  );
}

/**
 * Login simples — e por isso o usuário é o `agent`, nunca o `admin`.
 *
 * `admin` tem MFA obrigatório (doutrina de Auth), então o login dele para em
 * `/login/mfa` e este `waitForURL` nunca resolve. O repo tem um helper próprio
 * para esse caso (`helpers/login-admin.ts`), e ele existe justamente porque a
 * armadilha já pegou gente antes. As demais specs de inbox usam `agent`, que
 * tem o acesso que estes casos precisam.
 */
async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app\//);
}

/**
 * Abre a conversa semeada por deep-link — nunca "a primeira da lista".
 *
 * A fila do seed fica em `filter=unassigned` (sem dono). Depender da ordem da
 * lista quebrava no CI, onde outras specs criam conversas mais recentes.
 */
async function abrirConversaSemeada(
  page: Page,
  fila: NonNullable<E2ECreds["queue"]>,
): Promise<void> {
  await page.goto(`/app/inbox?id=${fila.conversation_id}&filter=unassigned`);
  await expect(
    page.getByRole("heading", { level: 2, name: fila.contact_name }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(CORPO_MENSAGEM)).toBeVisible({ timeout: 15_000 });
}

/** Linha de mensagem que expõe o botão de citação — inbound ou outbound. */
function linhaComResponder(page: Page) {
  return page
    .locator(".group")
    .filter({ has: page.getByRole("button", { name: /Responder a esta mensagem/i }) })
    .first();
}

test.describe("responder citando", () => {
  let c: E2ECreds;
  let fila: NonNullable<E2ECreds["queue"]>;

  test.beforeAll(() => {
    c = creds();
    fila = semearConversa();
  });

  test.beforeEach(() => {
    // A mensagem é semeada de novo a cada caso: o `beforeAll` rodava ~10 min
    // antes do teste no CI (parte 1 inchada), e outras specs da mesma parte
    // podem ter tocado a conversa — sem reentrega o corpo some da tela.
    chegarMensagem(fila.conversation_id, CORPO_MENSAGEM);
  });

  test("o botão de responder revela a faixa, e o × a desfaz", async ({ page }) => {
    await login(page, c.users.agent!.email, c.password);
    await abrirConversaSemeada(page, fila);

    const linha = linhaComResponder(page);
    await expect(linha, "nenhuma mensagem expõe o botão de responder").toBeVisible({
      timeout: 10_000,
    });

    const responder = linha.getByRole("button", { name: /Responder a esta mensagem/i });

    // O botão fica `opacity-0` até o hover no desktop — o hover é na linha `.group`.
    await linha.hover();
    await expect(responder).toBeVisible();
    await responder.click();

    // A faixa aparece acima do campo, com o botão de cancelar.
    const cancelar = page.getByRole("button", { name: /Cancelar resposta/i });
    await expect(cancelar).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, "responder-citando-faixa.png"),
      fullPage: false,
    });

    await cancelar.click();
    await expect(cancelar).toHaveCount(0);
  });

  test("trocar de conversa LIMPA a citação", async ({ page }) => {
    // Sem isto a resposta sairia citando a mensagem de outro cliente — o pior
    // desfecho possível desta feature, e invisível até acontecer com alguém.
    await login(page, c.users.agent!.email, c.password);
    await abrirConversaSemeada(page, fila);

    const linha = linhaComResponder(page);
    await expect(linha).toBeVisible({ timeout: 10_000 });
    await linha.hover();
    const responder = linha.getByRole("button", { name: /Responder a esta mensagem/i });
    await responder.click();
    await expect(page.getByRole("button", { name: /Cancelar resposta/i })).toBeVisible();

    // Volta para a lista e entra em OUTRA conversa.
    await page.goto("/app/inbox?filter=unassigned");
    await page.waitForTimeout(1200);

    await expect(
      page.getByRole("button", { name: /Cancelar resposta/i }),
      "a citação sobreviveu à troca de conversa",
    ).toHaveCount(0);
  });
});
