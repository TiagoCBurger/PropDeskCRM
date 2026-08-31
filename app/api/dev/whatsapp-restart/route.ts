import { fail, ok } from "@/lib/api/wrappers";
import { credenciaisWahaDev, prepararSessaoParaQr } from "@/lib/waha/dev-whatsapp";

/** Reinicia sessão WAHA de dev (logout + start) para gerar QR novo. */
export async function POST() {
  const { apiKey } = credenciaisWahaDev();
  if (!apiKey) {
    return fail("waha_not_configured", "WAHA_API_KEY não configurada no servidor.", 503);
  }

  try {
    const status = await prepararSessaoParaQr(true);
    return ok({ status, session: "default" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail("waha_restart_failed", msg, 503);
  }
}
