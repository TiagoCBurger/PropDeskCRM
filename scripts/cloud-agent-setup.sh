#!/usr/bin/env bash
# =============================================================================
# Bootstrap idempotente do ambiente de DESENVOLVIMENTO (Cloud Agent / dev local).
#
# Gera um `.env.local` MÍNIMO só se ele ainda não existir, com placeholders
# válidos e segredos LOCAIS descartáveis, para que `pnpm dev`/`pnpm build`
# subam sem erro fatal. NÃO substitui um `.env.local` já preenchido.
#
# Isto NÃO configura Supabase/WAHA/IA de verdade — para auth + banco reais,
# preencha as chaves conforme `docs/SETUP.md`. É apenas o piso para o app
# compilar, servir as telas públicas e responder a `/api/v1/health`.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then
  echo "[cloud-agent-setup] .env.local já existe — preservando."
  exit 0
fi

echo "[cloud-agent-setup] criando .env.local mínimo para dev…"

gen_hex() { openssl rand -hex "${1:-32}"; }
gen_b64() { openssl rand -base64 "${1:-32}"; }

cat > .env.local <<EOF
# =============================================================================
# .env.local — ambiente de DESENVOLVIMENTO (gerado por scripts/cloud-agent-setup.sh)
# NÃO commitar (está no .gitignore). Segredos abaixo são locais/descartáveis.
# Para auth + banco reais, preencha as chaves conforme docs/SETUP.md.
# =============================================================================

# --- Supabase (placeholder local — troque por um projeto real p/ auth+DB) ----
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=dev-placeholder-anon-key
SUPABASE_SERVICE_ROLE_KEY=dev-placeholder-service-role-key

# --- Cron / interno ----------------------------------------------------------
INTERNAL_SECRET=$(gen_hex 32)
INTERNAL_CRON_SECRET=

# --- Encryption keys (pgcrypto / AES) ----------------------------------------
CPF_ENCRYPTION_KEY=$(gen_hex 16)
WAHA_BYO_ENCRYPTION_KEY=$(gen_hex 16)
AI_CRED_AES_KEY=$(gen_b64 32)

# --- WAHA (vazio em dev sem WhatsApp) ----------------------------------------
WAHA_API_BASE_URL=http://localhost:3001
WAHA_API_KEY=
WAHA_WEBHOOK_BASE_URL=http://localhost:3000

# --- Upstash Redis (vazio = fallback em memória) -----------------------------
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# --- Impersonate / LGPD ------------------------------------------------------
IMPERSONATE_COOKIE_SECRET=$(gen_hex 32)
LGPD_SIGNING_KEY=$(gen_hex 24)

# --- App URLs ----------------------------------------------------------------
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3000
EOF

echo "[cloud-agent-setup] .env.local criado."
