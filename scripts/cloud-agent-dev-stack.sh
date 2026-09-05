#!/usr/bin/env bash
# =============================================================================
# Sobe Auth + PostgREST no Cloud Agent para o /login funcionar.
#
# `supabase start` aqui falha: o Docker usa driver vfs e o bridge entre
# containers não entrega TCP a tempo (GoTrue/PostgREST timeout no Postgres).
# Este script publica o Postgres na 54322 e corre GoTrue/PostgREST com
# `--network host`, falando via 127.0.0.1.
#
# Idempotente. Não commita .env.local. Não sobe o Next (isso é o terminal `dev`).
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

PG_IMAGE="${DEV_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.165}"
GOTRUE_IMAGE="${DEV_GOTRUE_IMAGE:-public.ecr.aws/supabase/gotrue:v2.196.0}"
PGRST_IMAGE="${DEV_PGRST_IMAGE:-public.ecr.aws/supabase/postgrest:v16.1}"
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
# Chaves oficiais do stack local do Supabase (issuer supabase-demo). Não são
# segredo de produção — todo `supabase start` emite as mesmas.
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

OWNER_EMAIL="${OWNER_EMAIL:-dev@deskcomm.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-DevLogin!1234}"
OWNER_ORG_NAME="${OWNER_ORG_NAME:-Dev Local}"
# Login extra de desenvolvimento — a mesma org do dono, senha conhecida.
# Não vai para o install.sh (produção). Só este stack local.
DEV_TEST_EMAIL="${DEV_TEST_EMAIL:-ticburger@gmail.com}"
DEV_TEST_PASSWORD="${DEV_TEST_PASSWORD:-Douglasti1@}"

precisa_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "[dev-stack] docker ausente — sem Auth o /login não autentica." >&2
    exit 0
  }
}

espera_tcp() {
  local host="$1" port="$2" tentativas="${3:-40}"
  for _ in $(seq 1 "$tentativas"); do
    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

sobe_postgres() {
  if docker ps --format '{{.Names}}' | grep -qx supabase_db_deskcomm-crm; then
    echo "[dev-stack] postgres já no ar."
    return 0
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx supabase_db_deskcomm-crm; then
    docker start supabase_db_deskcomm-crm >/dev/null
  else
    docker run -d --name supabase_db_deskcomm-crm \
      -p 54322:5432 \
      -e POSTGRES_HOST_AUTH_METHOD=trust \
      -e POSTGRES_PASSWORD=postgres \
      -v supabase_db_deskcomm-crm:/var/lib/postgresql/data \
      "$PG_IMAGE" >/dev/null
  fi
  espera_tcp 127.0.0.1 54322 || {
    echo "[dev-stack] postgres não abriu 54322" >&2
    return 1
  }
  echo "[dev-stack] postgres em :54322"
}

ajusta_senhas() {
  docker exec supabase_db_deskcomm-crm \
    psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    -c "alter user supabase_auth_admin with password 'postgres'; alter user authenticator with password 'postgres';" \
    >/dev/null
}

aplica_baseline_se_faltar() {
  local tem_org tem_quadro check_provider
  tem_org="$(PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -Atc \
    "select count(*) from information_schema.tables where table_schema='public' and table_name='organizations';" 2>/dev/null || echo 0)"
  tem_quadro="$(PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -Atc \
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_aplicar_quadro_do_onboarding';" 2>/dev/null || echo 0)"
  # Volume antigo do supabase start ainda tem o CHECK que recusa OpenRouter.
  check_provider="$(PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -Atc \
    "select count(*) from pg_constraint where conname='ai_provider_credentials_provider_check';" 2>/dev/null || echo 0)"

  if [[ "$check_provider" != "0" && -f supabase/migrations/20260807140000_0127_provider_vocabulario_aberto.sql ]]; then
    echo "[dev-stack] aplicando 0127 (vocabulário aberto de provedor)…"
    docker exec -i supabase_db_deskcomm-crm psql -U supabase_admin -d postgres -v ON_ERROR_STOP=0 \
      < supabase/migrations/20260807140000_0127_provider_vocabulario_aberto.sql >/dev/null \
      || true
    PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "notify pgrst, 'reload schema';" >/dev/null || true
  fi

  # Ter `organizations` NÃO prova o schema do produto: um volume do
  # `supabase start` incompleto deixa tabelas e sem as funções do baseline.
  # Medido no Cloud Agent em 2026-09-02: o onboarding falhava com
  # "Could not find the function public.fn_aplicar_quadro_do_onboarding".
  if [[ "$tem_org" == "1" && "$tem_quadro" != "0" ]]; then
    echo "[dev-stack] schema do produto presente (organizations + quadro do onboarding)."
    return 0
  fi
  if [[ -f supabase/baseline.sql ]] && command -v psql >/dev/null 2>&1; then
    echo "[dev-stack] aplicando baseline.sql…"
    PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=0 -q -f supabase/baseline.sql \
      || echo "[dev-stack] aviso: baseline teve erros (comum em reaplicação)."
  fi
  if [[ -f supabase/migrations/20260813120000_0156_quadro_do_onboarding.sql ]]; then
    docker exec -i supabase_db_deskcomm-crm psql -U supabase_admin -d postgres -v ON_ERROR_STOP=0 \
      < supabase/migrations/20260813120000_0156_quadro_do_onboarding.sql >/dev/null \
      || true
  fi
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "notify pgrst, 'reload schema';" >/dev/null || true
}

sobe_gotrue() {
  docker rm -f supabase_auth_deskcomm-crm >/dev/null 2>&1 || true
  docker run -d --name supabase_auth_deskcomm-crm --network host --restart unless-stopped \
    -e GOTRUE_API_HOST=0.0.0.0 \
    -e GOTRUE_API_PORT=9999 \
    -e API_EXTERNAL_URL=http://127.0.0.1:54321 \
    -e GOTRUE_DB_DRIVER=postgres \
    -e GOTRUE_DB_DATABASE_URL='postgres://supabase_auth_admin:postgres@127.0.0.1:54322/postgres' \
    -e GOTRUE_SITE_URL=http://localhost:3000 \
    -e GOTRUE_URI_ALLOW_LIST='http://localhost:3000/**' \
    -e GOTRUE_DISABLE_SIGNUP=false \
    -e GOTRUE_JWT_SECRET="$JWT_SECRET" \
    -e GOTRUE_JWT_EXP=3600 \
    -e GOTRUE_JWT_AUD=authenticated \
    -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
    -e GOTRUE_JWT_ADMIN_ROLES=service_role \
    -e GOTRUE_JWT_ISSUER=supabase-demo \
    -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
    -e GOTRUE_MAILER_AUTOCONFIRM=true \
    "$GOTRUE_IMAGE" >/dev/null
  espera_tcp 127.0.0.1 9999 || {
    echo "[dev-stack] GoTrue não abriu :9999" >&2
    docker logs supabase_auth_deskcomm-crm 2>&1 | tail -20 >&2
    return 1
  }
  echo "[dev-stack] GoTrue em :9999"
}

sobe_postgrest() {
  docker rm -f supabase_rest_deskcomm-crm >/dev/null 2>&1 || true
  docker run -d --name supabase_rest_deskcomm-crm --network host --restart unless-stopped \
    -e PGRST_DB_URI='postgres://authenticator:postgres@127.0.0.1:54322/postgres' \
    -e PGRST_DB_SCHEMAS=public,storage \
    -e PGRST_DB_ANON_ROLE=anon \
    -e PGRST_JWT_SECRET="$JWT_SECRET" \
    -e PGRST_SERVER_PORT=54331 \
    "$PGRST_IMAGE" >/dev/null
  espera_tcp 127.0.0.1 54331 || {
    echo "[dev-stack] PostgREST não abriu :54331" >&2
    return 1
  }
  echo "[dev-stack] PostgREST em :54331"
}

sobe_gateway() {
  if [[ -f /tmp/supabase-gateway.pid ]] && kill -0 "$(cat /tmp/supabase-gateway.pid)" 2>/dev/null; then
    echo "[dev-stack] gateway já no ar."
    return 0
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 54321/tcp >/dev/null 2>&1 || true
  fi
  nohup node scripts/dev-local-gateway.mjs >/tmp/supabase-gateway.log 2>&1 &
  echo $! >/tmp/supabase-gateway.pid
  espera_tcp 127.0.0.1 54321 || {
    echo "[dev-stack] gateway :54321 falhou" >&2
    cat /tmp/supabase-gateway.log >&2 || true
    return 1
  }
  echo "[dev-stack] gateway em :54321"
}

grava_chaves_no_env_local() {
  [[ -f .env.local ]] || bash scripts/cloud-agent-setup.sh
  # Só troca placeholder. Um .env.local apontando para um projeto real na nuvem
  # (JWT que não começa com o issuer supabase-demo nem é o placeholder) fica.
  python3 - "$ANON_KEY" "$SERVICE_KEY" <<'PY'
import pathlib, sys
anon, service = sys.argv[1], sys.argv[2]
p = pathlib.Path(".env.local")
lines, changed = [], False
for line in p.read_text().splitlines(True):
    raw = line.rstrip("\n")
    if raw.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY=") and (
        "dev-placeholder" in raw or raw.endswith("=")
    ):
        lines.append(f"NEXT_PUBLIC_SUPABASE_ANON_KEY={anon}\n")
        changed = True
    elif raw.startswith("SUPABASE_SERVICE_ROLE_KEY=") and (
        "dev-placeholder" in raw or raw.endswith("=")
    ):
        lines.append(f"SUPABASE_SERVICE_ROLE_KEY={service}\n")
        changed = True
    else:
        lines.append(line)
p.write_text("".join(lines))
print("[dev-stack] .env.local chaves locais" + (" atualizadas." if changed else " já ok."))
PY
}

# O compose local publica o WAHA em :3030. Sem URL+chave o onboarding trata
# o WhatsApp como "ainda não subiu" e nunca mostra o QR.
aponta_waha_local() {
  if ! docker inspect deskcomm-waha >/dev/null 2>&1; then
    echo "[dev-stack] WAHA container ausente — pulando."
    return 0
  fi
  [[ -f .env.local ]] || return 0
  local waha_key
  waha_key="$(docker inspect deskcomm-waha --format '{{range .Config.Env}}{{println .}}{{end}}' | awk -F= '/^WAHA_API_KEY=/{print substr($0,14); exit}')"
  if [ -z "$waha_key" ]; then
    echo "[dev-stack] WAHA_API_KEY vazia no container — pulando."
    return 0
  fi
  python3 - "$waha_key" <<'PY'
from pathlib import Path
import sys
key = sys.argv[1]
p = Path(".env.local")
lines = p.read_text().splitlines()
out, seen_url, seen_key = [], False, False
for line in lines:
    if line.startswith("WAHA_API_BASE_URL="):
        out.append("WAHA_API_BASE_URL=http://127.0.0.1:3030")
        seen_url = True
    elif line.startswith("WAHA_API_KEY="):
        out.append(f"WAHA_API_KEY={key}")
        seen_key = True
    else:
        out.append(line)
if not seen_url:
    out.append("WAHA_API_BASE_URL=http://127.0.0.1:3030")
if not seen_key:
    out.append(f"WAHA_API_KEY={key}")
p.write_text("\n".join(out) + "\n")
print("[dev-stack] WAHA apontado para deskcomm-waha:3030")
PY
}

semeia_dono() {
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "[dev-stack] pnpm ausente — pulei bootstrap-owner."
    return 0
  fi
  OWNER_EMAIL="$OWNER_EMAIL" OWNER_PASSWORD="$OWNER_PASSWORD" OWNER_ORG_NAME="$OWNER_ORG_NAME" \
    pnpm exec tsx scripts/bootstrap-owner.ts
}

# Segundo admin na mesma org. Reusa o bootstrap: org já existe (slug de
# OWNER_ORG_NAME), então só cria o usuário, associa como admin e promove.
semeia_usuario_de_teste() {
  if ! command -v pnpm >/dev/null 2>&1; then
    return 0
  fi
  if [[ -z "${DEV_TEST_EMAIL:-}" || -z "${DEV_TEST_PASSWORD:-}" ]]; then
    return 0
  fi
  OWNER_EMAIL="$DEV_TEST_EMAIL" OWNER_PASSWORD="$DEV_TEST_PASSWORD" OWNER_ORG_NAME="$OWNER_ORG_NAME" \
    pnpm exec tsx scripts/bootstrap-owner.ts
}

precisa_docker
sobe_postgres
ajusta_senhas
aplica_baseline_se_faltar
sobe_gotrue
sobe_postgrest
sobe_gateway
grava_chaves_no_env_local
aponta_waha_local
semeia_dono
semeia_usuario_de_teste
echo "[dev-stack] login local: ${OWNER_EMAIL} / (OWNER_PASSWORD no ambiente; padrão DevLogin!1234)"
echo "[dev-stack] login de teste: ${DEV_TEST_EMAIL}"
