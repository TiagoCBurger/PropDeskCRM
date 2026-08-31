import { fail } from "@/lib/api/wrappers";

const WAHA_BASE = process.env.WAHA_API_BASE_URL ?? "http://127.0.0.1:3030";
const WAHA_KEY = process.env.WAHA_API_KEY ?? "";
const SESSION = "default";

async function iniciarSessao(): Promise<string> {
  const headers = { "X-Api-Key": WAHA_KEY, "Content-Type": "application/json" };

  await fetch(`${WAHA_BASE}/api/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: SESSION, config: {} }),
  }).catch(() => null);

  const start = await fetch(`${WAHA_BASE}/api/sessions/${SESSION}/start`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  if (!start.ok && start.status !== 422 && start.status !== 409) {
    const body = await start.text().catch(() => "");
    throw new Error(`waha_start_${start.status}: ${body.slice(0, 200)}`);
  }

  const statusRes = await fetch(`${WAHA_BASE}/api/sessions/${SESSION}`, {
    headers: { "X-Api-Key": WAHA_KEY },
  });
  const statusJson = (await statusRes.json().catch(() => ({}))) as { status?: string };
  return statusJson.status ?? "UNKNOWN";
}

/** Proxy do QR do WAHA para dev/preview — rota pública. */
export async function GET() {
  if (!WAHA_KEY) {
    return fail("waha_not_configured", "WAHA_API_KEY não configurada no servidor.", 503);
  }

  try {
    await iniciarSessao();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail("waha_unreachable", `WAHA indisponível: ${msg}`, 503);
  }

  const qrRes = await fetch(`${WAHA_BASE}/api/${SESSION}/auth/qr?format=image`, {
    headers: { "X-Api-Key": WAHA_KEY, Accept: "image/png" },
  });

  if (!qrRes.ok) {
    const body = await qrRes.text().catch(() => "");
    return fail("qr_unavailable", `QR ainda não disponível (${qrRes.status}): ${body.slice(0, 120)}`, 503);
  }

  const buf = Buffer.from(await qrRes.arrayBuffer());
  return new Response(buf, {
    headers: {
      "Content-Type": qrRes.headers.get("content-type") ?? "image/png",
      "Cache-Control": "no-store",
    },
  });
}
