"use client";

import { Sidebar } from "@/components/shell/Sidebar";
import { AuthProvider } from "@/hooks/auth/AuthProvider";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

const previewUser: AuthUser = {
  id: "preview-user",
  email: "admin@demo.test",
  full_name: "Admin Demo",
  avatar_url: null,
  is_platform_admin: false,
  locale: "pt-BR",
  idioma: "pt-BR",
  organizations: [
    {
      organization_id: "org-demo",
      organization_name: "Clínica Demo",
      role: "admin",
      locale: "pt-BR",
    },
  ],
};

const previewOrg: ActiveOrg = {
  orgId: "org-demo",
  name: "Clínica Demo",
  role: "admin",
};

const TELAS = [
  { id: "inbox", rotulo: "Conversas", descricao: "Caixa de entrada e atendimento ao vivo." },
  { id: "pipeline", rotulo: "Pipeline", descricao: "Funil de vendas com leads e etapas." },
  { id: "painel", rotulo: "Painel", descricao: "Métricas e visão geral do negócio." },
  { id: "conexoes", rotulo: "Conexões", descricao: "WhatsApp por QR e canais oficiais." },
  { id: "config", rotulo: "Configurações", descricao: "Equipe, segurança e preferências." },
] as const;

type TelaId = (typeof TELAS)[number]["id"];

function ConteudoDaTela({ tela }: { tela: TelaId }) {
  const meta = TELAS.find((t) => t.id === tela) ?? TELAS[0];

  if (tela === "inbox") {
    return (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fila</p>
          <ul className="mt-3 space-y-2">
            {["Maria Silva", "João Costa", "Ana Lima"].map((nome) => (
              <li key={nome} className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
                {nome}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Conversa selecionada</p>
          <p className="mt-2 text-lg font-medium">Olá! Gostaria de agendar uma consulta.</p>
        </div>
      </div>
    );
  }

  if (tela === "pipeline") {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {["Novo", "Em contato", "Ganho"].map((coluna) => (
          <div key={coluna} className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-medium">{coluna}</p>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl bg-[hsl(var(--color-spark)/0.12)] px-3 py-2 text-sm">Lead demo</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tela === "painel") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { rotulo: "Conversas hoje", valor: "24" },
          { rotulo: "Leads novos", valor: "8" },
          { rotulo: "Taxa de resposta", valor: "92%" },
          { rotulo: "Agente ativo", valor: "Sim" },
        ].map((kpi) => (
          <div key={kpi.rotulo} className="rounded-2xl border bg-card p-5 shadow-sm">
            <p className="text-xs text-muted-foreground">{kpi.rotulo}</p>
            <p className="mt-1 text-2xl font-semibold">{kpi.valor}</p>
          </div>
        ))}
      </div>
    );
  }

  if (tela === "conexoes") {
    return (
      <div className="flex flex-col items-start gap-6 rounded-2xl border bg-card p-6 shadow-sm md:flex-row">
        <div className="flex h-48 w-48 items-center justify-center rounded-xl border-2 border-dashed bg-muted/40">
          <p className="px-4 text-center text-sm text-muted-foreground">
            QR do WhatsApp aparece aqui após login + WAHA
          </p>
        </div>
        <div>
          <p className="font-medium">Conectar WhatsApp</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Com WAHA rodando, escaneie o QR real em{" "}
            <a href="/dev-qr" className="text-foreground underline">
              /dev-qr
            </a>{" "}
            ou no dashboard do WAHA na porta 3030.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <p className="font-medium">{meta.rotulo}</p>
      <p className="mt-2 text-sm text-muted-foreground">{meta.descricao}</p>
    </div>
  );
}

/** Preview público do layout VibeFly — um menu só, sem login. */
export function SidebarPreviewShell({
  collapsed,
  tela = "inbox",
}: {
  collapsed: boolean;
  tela?: TelaId;
}) {
  const telaAtiva = TELAS.some((t) => t.id === tela) ? tela : "inbox";

  return (
    <IdiomaProvider locale="pt-BR">
      <AuthProvider user={previewUser} activeOrg={previewOrg}>
        <div className="flex min-h-screen w-full bg-background">
          <Sidebar collapsed={collapsed} />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex h-14 flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
              <p className="text-sm text-muted-foreground">Preview VibeFly (sem login)</p>
              <nav className="flex flex-wrap gap-2 text-sm">
                <a href="/dev-sidebar-preview" className="text-foreground underline-offset-4 hover:underline">
                  Expandida
                </a>
                <a
                  href="/dev-sidebar-preview?collapsed=1"
                  className="text-muted-foreground underline-offset-4 hover:underline"
                >
                  Recolhida
                </a>
                <a href="/dev-qr" className="text-foreground underline-offset-4 hover:underline">
                  QR WhatsApp
                </a>
                <a href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
                  Login
                </a>
              </nav>
            </header>
            <div className="border-b px-4 py-2 sm:px-6">
              <nav className="flex flex-wrap gap-2">
                {TELAS.map((t) => {
                  const href = `/dev-sidebar-preview?screen=${t.id}${collapsed ? "&collapsed=1" : ""}`;
                  return (
                    <a
                      key={t.id}
                      href={href}
                      className={cn(
                        "rounded-full px-3 py-1 text-sm transition-colors",
                        telaAtiva === t.id
                          ? "bg-[hsl(var(--color-spark))] text-[hsl(var(--foreground))]"
                          : "bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.rotulo}
                    </a>
                  );
                })}
              </nav>
            </div>
            <main className="flex-1 overflow-auto p-4 sm:p-6">
              <h1 className="text-2xl font-semibold tracking-tight">
                {TELAS.find((t) => t.id === telaAtiva)?.rotulo}
              </h1>
              <p className="mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">
                {TELAS.find((t) => t.id === telaAtiva)?.descricao}
              </p>
              <ConteudoDaTela tela={telaAtiva} />
            </main>
          </div>
        </div>
      </AuthProvider>
    </IdiomaProvider>
  );
}
