import { fail } from "@/lib/api/wrappers";
import { buscarImagemQrWaha, credenciaisWahaDev } from "@/lib/waha/dev-whatsapp";

/** Proxy do QR do WAHA para dev/preview — rota pública. */
export async function GET() {
  const { apiKey } = credenciaisWahaDev();
  if (!apiKey) {
    return fail("waha_not_configured", "WAHA_API_KEY não configurada no servidor.", 503);
  }

  try {
    return await buscarImagemQrWaha();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail("qr_unavailable", msg, 503);
  }
}
