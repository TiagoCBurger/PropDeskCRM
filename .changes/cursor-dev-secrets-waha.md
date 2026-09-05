---
impacto: nada_mudou
secao: adicionado
titulo: Secrets do Cursor e sessão WhatsApp no ambiente de desenvolvimento
---

O Cloud Agent copia a chave de IA do painel (OpenRouter basta) para o `.env.local` e grava Postgres + sessões WhatsApp em `.cursor/dev-persist/` neste worktree. Quem opera uma VPS não muda nada: o instalador não leva este seed.
