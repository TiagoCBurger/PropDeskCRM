# Topologia alvo — app na VPS, banco no Supabase Cloud, mídia no R2

> Interruptor, não contrato: a VPS **ainda não foi alugada**. Este runbook
> descreve o que **já existe** no repositório e o que o operador preenche
> depois (secrets, projeto Supabase, bucket R2). Nada aqui exige editar
> `.env` numa instalação que já roda — default continua Supabase Storage,
> e o job de deploy sai verde sem secrets.

Marcações: **CONFIRMADO** = medido em código neste commit.
**INFERIDO** = lacuna que o operador fecha depois de alugar a VPS / criar
o projeto Cloud / o bucket R2. Não inventa SLA nem regra de produto.

O deploy canônico (dois `-f`, `update.sh`, não construir na VPS) continua em
[`deploy.md`](./deploy.md) e na doutrina [`../doctrine/packaging.md`](../doctrine/packaging.md).

---

## 1. O que já funciona (CONFIRMADO)

| Peça | Onde | O que faz |
|---|---|---|
| Imagens Docker genéricas | `.github/workflows/publish-image.yml` | Publica `deskcommcrm`, `deskcomm-worker`, `deskcomm-scheduler` no GHCR em push na `main` e em tag `v*`. Em PR: constrói e **não** publica. |
| Gate `imagens-ok` | o mesmo workflow | Status check obrigatório da `main`. |
| Demais checks | `ci.yml`, `e2e.yml`, `perf.yml` | `verify`, `invariants`, `e2e`, `build-and-size` — disparam em PR para `main`. |
| Compose de produção | `docker-compose.prod.yml` + `docker-compose.traefik.yml` | App/worker/scheduler **puxam** imagem. Com Traefik na VPS, os dois `-f` são obrigatórios (`deploy.md`). |
| Atualização na VPS | `hostgator-setup-kit/update.sh` | Puxa a **tag** publicada, backup, baseline, `dc pull` + `dc up -d`. Não constrói na VPS no caminho normal. |
| Supabase (URL/keys) | `lib/env.ts`, `.env.example` | `NEXT_PUBLIC_SUPABASE_URL`, anon key, service role, `SUPABASE_DB_URL`. O app **já** aponta para um projeto remoto — Cloud ou self-host é o valor, não o código. |
| Object storage pluggable | `lib/storage/` | `STORAGE_BACKEND=supabase` (default) ou `r2`. Call sites passam por `objectStorage(bucket)`. |
| Deploy opt-in | job `deploy-vps` em `publish-image.yml` | Sem `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`, **sai verde** e grava o resumo. Com os três: exige também `VPS_SSH_KNOWN_HOSTS` (sem TOFU) e SSH + `update.sh`. |

`latest` no GHCR = topo da `main`, não a última release. Quem opera cliente usa o **número** da tag. `stable` = última release. CONFIRMADO em `publish-image.yml` e `docs/doctrine/packaging.md`.

---

## 2. O que muda com Supabase Cloud (em vez de Postgres na VPS)

**CONFIRMADO.** O app nunca “é” o banco. Ele lê:

- `NEXT_PUBLIC_SUPABASE_URL` — Auth, Realtime, PostgREST, Storage (se o backend for supabase)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` — workers, crons, scripts que falam Postgres direto

Self-host (kit) sobe um Postgres local **ou** aponta essas chaves para um projeto. Cloud = as mesmas chaves, URL `https://<ref>.supabase.co`.

**O que o operador faz depois (INFERIDO — fora deste repo):**

1. Criar o projeto no Supabase Cloud (região à escolha dele; residência de dados é decisão do operador, não uma regra daqui).
2. Aplicar o schema: o kit self-host aplica `supabase/baseline.sql`. Num projeto Cloud, o mesmo arquivo (ou a cadeia `supabase/migrations/`) precisa ser aplicado **uma vez** no SQL Editor / `psql` da conexão do projeto. Este runbook **não** inventa um segundo instalador.
3. Colar URL e keys no `.env` da VPS (nunca no git, nunca em `.cursor/environment.json`).
4. Auth e Realtime usam o mesmo projeto. Redirect URLs do GoTrue (`https://SEU-DOMINIO/...`) continuam sendo configuração do projeto, como no self-host.

**O que NÃO muda:** RLS, `organization_id`, service role filtrando na mão. Cloud não afrouxa tenancy.

**INFERIDO.** Quota e preço do plano Cloud são do operador. O runbook de cota (`custo-e-cota-do-supabase.md`) continua válido para o **Postgres**; mídia no R2 deixa de contar na cota de Storage do projeto.

---

## 3. Como o R2 substitui o Supabase Storage

**CONFIRMADO.** `lib/storage/objectStorage()` escolhe o backend na hora da chamada:

- `STORAGE_BACKEND` ausente, vazio ou qualquer valor ≠ `r2` → adapter Supabase (`lib/storage/supabase.ts`). Instalação existente não declara a chave e não quebra.
- `STORAGE_BACKEND=r2` **sem** `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` → **fail-closed**: upload/download/assinatura devolvem `{ error }` e **não** caem no Supabase. Log: `[storage] R2 selecionado mas incompleto` (nomes das chaves, nunca os valores).
- Com credenciais: SigV4 à mão (`lib/storage/r2-assinatura.ts`), sem `@aws-sdk` na imagem.

Buckets **lógicos** não mudam: `whatsapp-media`, `ai-policy`, `lgpd-exports`, `skill-assets`, `brand-logos`. Paths no Postgres (`{org}/…`) não mudam. Sem migration.

| Chave | Obrigatória? | Papel |
|---|---|---|
| `STORAGE_BACKEND` | não (default `supabase`) | `supabase` ou `r2` |
| `R2_ACCOUNT_ID` | se `r2` | account Cloudflare |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | se `r2` | token S3. **Nunca** em query string; só no header da assinatura |
| `R2_ENDPOINT` | não | vazio = `https://<account>.r2.cloudflarestorage.com` |
| `R2_REGION` | não (default `auto`) | R2 exige `auto` |
| `R2_BUCKET` | não | vazio = um bucket S3 por nome lógico. Preenchido = um bucket físico, lógicos viram prefixo |
| `R2_PUBLIC_BASE_URL` | para logos | CDN / custom domain. Sem ela, `logoDaCamada` cai em `APP_LOGO_URL`. Não é segredo (vai ao browser) |

**Rollback:** `STORAGE_BACKEND=supabase` (e as chaves R2 podem ficar no `.env` sem efeito). Objetos já gravados só no R2 **não** voltam sozinhos — dual-write e backfill ainda são roadmap (`docs/roadmap/migracao-storage-r2.md`, fases 2–3). CONFIRMADO: fase 1 (porta + call sites) está no código; fases 2–5 **não**.

**LGPD.** Redact continua apagando pelo path no backend ativo (`lib/lgpd/storage-redaction-queue.ts`). Sem dual-write, um cutover sem backfill deixa objeto órfão no lado antigo. INFERIDO: o operador planeja a virada.

API keys **nunca** em query string. URL pré-assinada leva `X-Amz-Signature` (HMAC), não o secret. Teste em `lib/storage/storage.test.ts`.

---

## 4. GitHub: secrets e o interruptor de deploy

O CI de **teste** já roda em todo PR para `main` (`ci.yml` `on.pull_request`, `e2e.yml`, `perf.yml`, `publish-image.yml` em PR só constrói). Não enfraquecer esses checks.

**Job `deploy-vps`** (depois de `imagens-ok`, só `push` na `main` ou tag `v*`, nunca fork, nunca PR):

| Nome | Onde | Obrigatório para ligar? |
|---|---|---|
| `VPS_HOST` | Environment `production` (ou secret do repo) | sim |
| `VPS_USER` | idem | sim |
| `VPS_SSH_KEY` | idem (chave **privada**, PEM) | sim |
| `VPS_PORT` | secret, default 22 | não |
| `VPS_SSH_KNOWN_HOSTS` | secret | **obrigatório quando o deploy está ligado**. Sem ele o job falha fechado. Não há `ssh-keyscan` no runner (TOFU/MITM no primeiro deploy). Como obter: numa máquina que **já** confia no host, `ssh-keyscan -p <porta> <host>`. Sem os três secrets de SSH, o job **não** pede este — continua skip verde. |
| `VPS_PROJECT_DIR` | **variable** do repo, default `/var/www/crm` | não |
| `VPS_DEPLOY_MODE` | variable, default `update-sh` | não. `compose-pull` puxa `:latest` / o que o `.env` da VPS aponta — só para quem **escolheu** acompanhar a `main`. `update.sh` instala a maior tag `v*` (CONFIRMADO no script) |

Sem os três primeiros, o job escreve no summary “VPS não configurada” e **exit 0**. O pipeline de publicação não fica vermelho.

**Environment GitHub `production`.** O job declara `environment: production`. O operador pode depois ligar required reviewers nesse environment — isso **não** está ligado neste commit (INFERIDO: política da org).

**Não** coloque o job `deploy-vps` na branch protection até a VPS existir. `imagens-ok` continua sendo o gate de imagem.

**Protocolo remoto (CONFIRMADO no YAML):** `bash hostgator-setup-kit/update.sh` no diretório do projeto. `compose-pull` só se `VPS_DEPLOY_MODE=compose-pull`; se `.env` tem `REVERSE_PROXY=traefik` — com ou sem aspas (`REVERSE_PROXY="traefik"` é o que o `install.sh` grava via `envq`) — usa os dois `-f`; senão só `docker-compose.prod.yml` (o mesmo critério de `dc()` em `hostgator-setup-kit/_common.sh`). Default do job continua `update-sh`.

Chave SSH: `IdentitiesOnly=yes`, `StrictHostKeyChecking=yes`, `BatchMode=yes`. Sem `set -x`. A chave é apagada no runner ao fim.

### Como ligar depois (checklist do operador)

1. Alugar a VPS, instalar com `hostgator-setup-kit/install.sh` (ou apontar o `.env` para Supabase Cloud).
2. Criar um usuário SSH de deploy (não root, se a política da VPS permitir) com a **chave pública** em `authorized_keys`.
3. No GitHub: Settings → Environments → `production` → secrets acima, **incluindo `VPS_SSH_KNOWN_HOSTS`**. Variable `VPS_PROJECT_DIR` se o path não for `/var/www/crm`.
4. Merge na `main` (ou tag `v*`) → `imagens-ok` → `deploy-vps` SSH.
5. Conferir o domínio: 307 para o login, não 404 (`deploy.md` §2).

---

## 5. Cursor Cloud (este agente) no dia a dia

**CONFIRMADO.** `.cursor/environment.json` declara `install` (`scripts/cloud-agent-setup.sh` + `pnpm install --frozen-lockfile`), `start` (`scripts/cloud-agent-dev-stack.sh` — Auth local + WAHA + seed) e um terminal `pnpm dev`.

`scripts/cloud-agent-setup.sh` cria `.env.local` **só se não existir**, com placeholders. `STORAGE_BACKEND=supabase`.

**Secrets do painel** (não commitar, não pôr em `environment.json`): uma chave de IA basta — `OPENROUTER_API_KEY`, ou Anthropic, ou OpenAI. `WAHA_API_BASE_URL` + `WAHA_API_KEY` só se o WhatsApp tiver de sobreviver a um **pod novo** (WAHA numa VPS). Sem URL remota, o `start` sobe WAHA local e persiste Postgres + sessões em `.cursor/dev-persist/` (gitignore). O QR vale para esta VM e para o snapshot do ambiente **depois** da pasta ter dados.

**Supabase Cloud + R2:** os nomes são os de `lib/env.ts`. Nunca commitar valores.

Node 22 (`.nvmrc`) e pnpm via `packageManager` do `package.json`.

---

## 6. Fluxo PR → teste → merge → imagem → VPS

```
branch → PR para main → verify + invariants + e2e + build-and-size + imagens-ok
       → merge → publish-image publica GHCR (:latest na main; :X.Y.Z e :stable na tag)
       → deploy-vps: skip (hoje) ou update.sh (quando os secrets existirem)
```

Quem já instalou e **não** ligou o job continua atualizando pela tela (`agent.sh`) ou `bash hostgator-setup-kit/update.sh` na VPS — CONFIRMADO, não foi substituído.

---

## 7. Segurança (não negociável)

- Secrets só no GitHub Environment / painel Cursor / `.env` da VPS (gitignore).
- Fail-closed: R2 incompleto não “tenta supabase”. Webhook HMAC já era fail-closed quando o secret falta.
- API key / token **nunca** em query string.
- Service role continua filtrando `organization_id` de fonte confiável, não do body.
- Job de deploy não roda em fork nem em `pull_request`.
- Fingerprint SSH do deploy vem de `VPS_SSH_KNOWN_HOSTS`, nunca de `ssh-keyscan` no runner.
- Não logar `R2_SECRET_ACCESS_KEY`, `VPS_SSH_KEY`, service role, CPF, telefone, e-mail.

---

## 8. Lacunas que o operador fecha depois (INFERIDO)

- Alugar a VPS e o domínio; DNS → Traefik/Caddy conforme a hospedagem (`deploy.md`, `cloudpanel.md`).
- Criar o projeto Supabase Cloud e aplicar `supabase/baseline.sql` (ou migrations) **nesse** banco.
- Criar buckets R2 (cinco lógicos, ou um físico + `R2_BUCKET`) e o token S3 com permissão só nesses buckets.
- Custom domain / Worker para `R2_PUBLIC_BASE_URL` (logos). Sem isto, logo em R2 não tem URL pública.
- Dual-write e backfill de objetos já no Supabase Storage: **não implementados**.
- `update.sh` segue a **maior tag `v*`**, não cada commit da `main`. Acompanhar a `main` em tempo real exige `APP_IMAGE=…:latest` na VPS **e** `VPS_DEPLOY_MODE=compose-pull` — é escolha explícita, não o default do kit.
- GHCR precisa estar acessível na VPS (`docker login` se o pacote for privado). O kit já trata isso no install.
