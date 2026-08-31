import { fail, ok } from "@/lib/api/wrappers";
import { credenciaisWahaDev, prepararSessaoParaQr, statusSessaoWahaDev } from "@/lib/waha/dev-whatsapp";

/** Status da sessão WAHA de dev (JSON para polling na tela). */
export async function GET(req: Request) {
  const { apiKey } = credenciaisWahaDev();
  if (!apiKey) {
    return fail("waha_not_configured", "WAHA_API_KEY não configurada no servidor.", 503);
  }

  const url = new URL(req.url);
  const iniciar = url.searchParams.get("start") === "1";

  try {
    const status = iniciar ? await prepararSessaoParaQr(false) : await statusSessaoWahaDev();
    return ok({ status, session: "default" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail("waha_unreachable", msg, 503);
  }
}
