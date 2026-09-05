# Persistência local do Cloud Agent

Esta pasta guarda o Postgres e as sessões do WAHA **deste** ambiente Cursor.

- `postgres/` — dados do Auth/CRM local (`ticburger@gmail.com`, org Dev Local)
- `waha-sessions/` e `waha-media/` — sessão WhatsApp depois do QR
- `waha-api-key` — a mesma chave com que o WAHA gravou a sessão

O conteúdo está no `.gitignore`. Não commite. O `start`
(`scripts/cloud-agent-dev-stack.sh`) copia volumes Docker antigos para cá
uma vez, sem apagar a base.

**O que sobrevive**

- Reiniciar o `start` nesta VM
- Snapshot do ambiente **depois** desta pasta ter dados (o worktree entra no snapshot; volume Docker anônimo não)

**O que não sobrevive**

- Um Cloud Agent **novo** (disco vazio), a menos que o snapshot já tivesse esta pasta
- Abrir o repo noutro computador sem copiar estes arquivos

WhatsApp remoto (VPS) continua sendo o único jeito de a sessão do celular
sobreviver a qualquer pod novo. OpenRouter fica só nos Secrets do painel —
não mora aqui.
