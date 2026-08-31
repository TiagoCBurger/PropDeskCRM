---
impacto: capacidade_nova
secao: adicionado
titulo: Storage em R2 e deploy na VPS ligáveis sem editar o que já roda
---

Quem já instalou não precisa mexer em nada: o object storage continua no
Supabase Storage. Passa a existir o interruptor `STORAGE_BACKEND=r2` (com
as chaves `R2_*` no `.env`) e um job de deploy no GitHub que, sem os secrets
`VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`, simplesmente não faz nada. Quem
ligar o job depois precisa também de `VPS_SSH_KNOWN_HOSTS` — o runner não
consulta a chave do host na hora. Dual-write e cópia dos arquivos antigos
ainda não existem — ligar R2 vale para objetos novos. O caminho de
atualização na VPS continua sendo `update.sh`.
