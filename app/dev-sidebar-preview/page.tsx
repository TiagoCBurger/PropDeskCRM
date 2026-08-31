import { SidebarPreviewShell } from "./SidebarPreviewShell";

const TELAS = ["inbox", "pipeline", "painel", "conexoes", "config"] as const;
type TelaId = (typeof TELAS)[number];

function parseTela(screen?: string): TelaId {
  if (screen && (TELAS as readonly string[]).includes(screen)) {
    return screen as TelaId;
  }
  return "inbox";
}

export default async function DevSidebarPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ collapsed?: string; screen?: string }>;
}) {
  const { collapsed, screen } = await searchParams;
  return <SidebarPreviewShell collapsed={collapsed === "1"} tela={parseTela(screen)} />;
}
