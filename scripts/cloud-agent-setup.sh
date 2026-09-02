#!/usr/bin/env bash
# =============================================================================
# Bootstrap idempotente do ambiente de DESENVOLVIMENTO (Cloud Agent / dev local).
#
#  1. Gera um `.env.local` MÍNIMO só se ele ainda não existir, com JWT demo do
#     stack local do Supabase e segredos LOCAIS descartáveis, para que
#     `pnpm dev` suba. NÃO substitui um `.env.local` já preenchido.
#  2. Instala o Claude Code CLI (`claude`) se ainda não estiver no PATH —
#     best-effort, nunca derruba o setup do projeto.
#
# Auth de verdade (GoTrue + PostgREST na :54321) sobe em
# `scripts/cloud-agent-dev-stack.sh`, chamado pelo `start` do
# `.cursor/environment.json`. Sem isso o /login da tela não autentica:
# a URL aponta para 127.0.0.1:54321 e não há processo escutando.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# --- 1. .env.local mínimo (idempotente) --------------------------------------
if [[ -f .env.local ]]; then
  echo "[cloud-agent-setup] .env.local já existe — preservando."
else
  echo "[cloud-agent-setup] criando .env.local mínimo para dev…"

  gen_hex() { openssl rand -hex "${1:-32}"; }
  gen_b64() { openssl rand -base64 "${1:-32}"; }

  cat > .env.local <<EOF
# =============================================================================
# .env.local — ambiente de DESENVOLVIMENTO (gerado por scripts/cloud-agent-setup.sh)
# NÃO commitar (está no .gitignore). Segredos abaixo são locais/descartáveis.
# Para auth + banco reais, preencha as chaves conforme docs/SETUP.md.
# =============================================================================

# --- Supabase local (JWT demo do stack oficial; o start sobe GoTrue na 54321) -
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

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

# --- Object storage (default supabase; R2 = Secrets do painel, nunca aqui) --
STORAGE_BACKEND=supabase
EOF

  echo "[cloud-agent-setup] .env.local criado."
fi

# --- 2. Claude Code CLI (opcional, best-effort, idempotente) ------------------
# Login NÃO é feito aqui. A forma que NÃO pede /login a cada boot é setar
# ANTHROPIC_API_KEY no painel de Secrets do Cloud Agent (injetado como env var).
if command -v claude >/dev/null 2>&1; then
  echo "[cloud-agent-setup] claude já disponível ($(command -v claude))."
else
  echo "[cloud-agent-setup] instalando Claude Code CLI…"
  # Prefixo cujo bin já está no PATH: o do node do nvm (NVM_BIN); com fallback.
  claude_prefix="${NVM_BIN:+$(dirname "$NVM_BIN")}"
  [[ -z "$claude_prefix" ]] && claude_prefix="$HOME/.npm-global"
  if npm install -g @anthropic-ai/claude-code --prefix "$claude_prefix" >/dev/null 2>&1; then
    echo "[cloud-agent-setup] Claude Code instalado em $claude_prefix/bin."
    # Garante o bin no PATH de shells futuros quando não for o prefixo do nvm.
    case ":$PATH:" in
      *":$claude_prefix/bin:"*) : ;;
      *)
        linha="export PATH=\"$claude_prefix/bin:\$PATH\""
        grep -qxF "$linha" "$HOME/.bashrc" 2>/dev/null || echo "$linha" >> "$HOME/.bashrc"
        ;;
    esac
  else
    echo "[cloud-agent-setup] aviso: falha ao instalar Claude Code (segue sem)."
  fi
fi
