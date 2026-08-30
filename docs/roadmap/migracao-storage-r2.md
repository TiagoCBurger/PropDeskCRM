---
type: roadmap
project: PropDeskCRM
status: planned
last_updated: 2026-08-30
owner: TiagoCBurger
---

# Migração de storage para Cloudflare R2

> **Intenção declarada do PropDeskCRM:** sair do Supabase Storage como backend
> primário de binários e passar a usar **Cloudflare R2** (API S3-compatível),
> mantendo Postgres/Auth/Realtime no Supabase.

Este documento descreve **por quê**, **o que migra**, **como** (fases) e **o que
não muda** ainda. Não é spec de implementação — quando a fase 1 começar, vira
ADR + spec em `docs/specs/`.

---

## Por quê

| Motivo | Detalhe |
|---|---|
| **Custo previsível** | R2 não cobra egress para a internet; mídia de WhatsApp e exports LGPD crescem com o uso. |
| **Escala de objetos** | Buckets de mídia e RAG podem ficar grandes; R2 é desenhado para object storage barato. |
| **Desacoplamento** | Supabase continua forte em Postgres + Auth + Realtime; storage de arquivos vira responsabilidade nossa, não do tier do projeto Supabase. |
| **S3-compatível** | SDK `@aws-sdk/client-s3` + presigned URLs — pouca reinventada. |

**O que não motiva a mudança:** abandonar Supabase. Só o **Storage** entra no escopo.

---

## Estado atual (Supabase Storage)

Buckets registrados no `baseline.sql` e usados em runtime:

| Bucket | Visibilidade | Uso principal | Código / worker |
|---|---|---|---|
| `whatsapp-media` | privado | mídia inbound/outbound WhatsApp, avatares | `workers/media-persist-worker.ts`, `media-derive-worker.ts`, inbox |
| `ai-policy` | privado | fontes RAG (PDF/DOC upload) | `lib/ai/rag/ingest/documento.ts` |
| `lgpd-exports` | privado (RLS por org) | PDF/JSON de exportação LGPD | `workers/lgpd-export-worker.ts` |
| `skill-assets` | privado | referências de skills (marketplace) | `lib/ai/skills/install.ts`, `skill-references.ts` |
| `brand-logos` | **público** | logo da marca (white-label) | `lib/branding/logo.ts`, `app/api/v1/marca/logo/` |

Padrão de acesso hoje:

- **Upload/download server-side** via `createAdminClient().storage.from(bucket)...`
- **URLs assinadas** para mídia sensível (`createSignedUrl`)
- **URLs públicas** só para `brand-logos` (`/storage/v1/object/public/...`)

Metadados (caminho do objeto, bucket, org) ficam em **Postgres** — isso **permanece**.

---

## Estado alvo (R2)

```
                    ┌─────────────────┐
  App / Workers ──► │ lib/storage/    │ ──► Cloudflare R2
                    │ (adapter S3)    │     (buckets por domínio)
                    └─────────────────┘
                              │
                    Postgres (paths, org_id, lifecycle)
```

### Buckets R2 propostos

Mesmos nomes lógicos (facilita migração e leitura de código):

| Bucket R2 | Equivalente atual | Notas |
|---|---|---|
| `propdesk-whatsapp-media` | `whatsapp-media` | maior volume; lifecycle por org |
| `propdesk-ai-policy` | `ai-policy` | objetos de ingestão RAG |
| `propdesk-lgpd-exports` | `lgpd-exports` | TTL / expiração já existe em produto |
| `propdesk-skill-assets` | `skill-assets` | manifest + arquivos de skill |
| `propdesk-brand-logos` | `brand-logos` | público via custom domain ou Worker |

Custom domain (ex.: `cdn.propdesk.app`) fica como decisão de deploy — não bloqueia fase 1.

### Variáveis de ambiente (planejadas)

```bash
# Backend de storage: supabase | r2  (default supabase até cutover)
STORAGE_BACKEND=supabase

# R2 (S3-compatible)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_REGION=auto
R2_PUBLIC_BASE_URL=https://cdn.example.com   # só brand-logos / assets públicos
```

Validação em `lib/env.ts` quando `STORAGE_BACKEND=r2`.

---

## Fases de implementação

### Fase 0 — Documentação e contrato (este doc) ✅

- Intenção registrada em README, `ARCHITECTURE.md`, `VISION.md`.
- Nenhuma mudança de runtime.

### Fase 1 — Adapter único

- Criar `lib/storage/` com interface mínima:
  - `upload`, `download`, `remove`, `createSignedUrl`, `publicUrl`
- Implementações: `supabase-storage.ts` (wrapper do client atual) e `r2-storage.ts` (AWS SDK v3).
- Selecionar backend via `STORAGE_BACKEND`.
- **Testes unitários** com mock S3; nenhum bucket real no CI.

### Fase 2 — Escrita dual (opcional, recomendada)

- Novos uploads vão para R2 **e** Supabase (flag `STORAGE_DUAL_WRITE=1`).
- Leitura: tenta R2, fallback Supabase (por `storage_backend` na linha ou prefixo de path).
- Permite validar integridade antes de desligar Supabase.

### Fase 3 — Backfill

- Script `scripts/migrar-storage-para-r2.ts`:
  - lista objetos por bucket Supabase
  - copia para R2 preservando path `{org_id}/...`
  - registra progresso em tabela `storage_migration_checkpoint`
- Rodável por org (multi-tenant) e retomável.

### Fase 4 — Cutover leitura

- `STORAGE_BACKEND=r2`, dual-write off.
- Supabase Storage read-only por período de rollback (ex.: 30 dias).

### Fase 5 — Limpeza

- Remover policies Supabase Storage obsoletas do baseline (com apêndice idempotente).
- Atualizar runbooks de backup (R2 lifecycle + replicação).
- Documentar custo operacional em `docs/runbooks/`.

---

## Impacto em self-host

Quem instala **hoje** continua com Supabase Storage até publicarmos R2 como opção
documentada no `hostgator-setup-kit`.

| Cenário | Comportamento |
|---|---|
| Instalação nova (antes do cutover) | Supabase Storage, sem ação extra |
| Instalação nova (depois do cutover) | `.env` pede credenciais R2 **ou** Supabase S3 bridge |
| Instalação existente | `update.sh` + migração backfill; sem perda se dual-write rodou |

**Regra de packaging:** nenhum bump pode exigir que o operador edite arquivos na mão
sem script — ver [`docs/doctrine/packaging.md`](../doctrine/packaging.md).

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| URLs públicas de logo quebram | Manter `R2_PUBLIC_BASE_URL` ou Worker de redirect durante transição |
| Signed URL TTL diferente | Unificar TTL em constante (`SIGNED_TTL_S` já existe para mídia) |
| LGPD / residência de dados | Documentar região R2 escolhida; DPA Cloudflare na instalação enterprise |
| Workers sem credencial R2 | Service role server-side only — nunca expor keys no browser |

---

## Critérios de pronto (Definition of Done da migração)

- [ ] Adapter `lib/storage/` com cobertura unitária
- [ ] Todos os call sites de `admin.storage.from(...)` migrados para o adapter
- [ ] Backfill testado em org de staging com ≥10k objetos
- [ ] Runbook de rollback (voltar `STORAGE_BACKEND=supabase`) documentado
- [ ] `CHANGELOG.md` com seção **⚠️ Requer atenção** para quem self-hosta
- [ ] Nenhuma regressão nos workers `media-persist`, `lgpd-export`, `storage-cleanup`

---

## Referências

- [Cloudflare R2 — S3 API](https://developers.cloudflare.com/r2/api/s3/api/)
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — camada Storage
- [`docs/specs/08-spec-deploy-observability.md`](../specs/08-spec-deploy-observability.md) — já cita endpoint S3 do Supabase como precedente
- Upstream histórico: [melgarafael/DeskcommCRM](https://github.com/melgarafael/DeskcommCRM)
