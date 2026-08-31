import { DevWhatsappQrCard } from "@/components/dev/DevWhatsappQrCard";

/** Página pública com QR do WhatsApp (via WAHA local). */
export default function DevQrPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Conectar WhatsApp</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Escaneie com o app WhatsApp em Aparelhos conectados. O código renova sozinho enquanto
          estiver visível.
        </p>
      </div>

      <DevWhatsappQrCard />

      <a href="/dev-sidebar-preview?screen=conexoes" className="rounded-full border px-4 py-2 text-sm">
        Voltar ao preview
      </a>
    </div>
  );
}
