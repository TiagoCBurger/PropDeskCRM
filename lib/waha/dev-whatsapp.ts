import { CONVERSAS_IGNORADAS } from "@/lib/waha/client";

const SESSION = "default";

function headers(apiKey: string) {
  return { "X-Api-Key": apiKey, "Content-Type": "application/json" };
}

export function credenciaisWahaDev() {
  const baseUrl = process.env.WAHA_API_BASE_URL ?? "http://127.0.0.1:3030";
  const apiKey = process.env.WAHA_API_KEY ?? "";
  return { baseUrl, apiKey, session: SESSION };
}

export async function statusSessaoWahaDev(): Promise<string> {
  const { baseUrl, apiKey, session } = credenciaisWahaDev();
  if (!apiKey) return "UNCONFIGURED";

  const res = await fetch(`${baseUrl}/api/sessions/${session}`, {
    headers: { "X-Api-Key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) return "UNREACHABLE";
  const json = (await res.json().catch(() => ({}))) as { status?: string };
  return json.status ?? "UNKNOWN";
}

async function postIgnorando422409(url: string, apiKey: string, body?: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok && res.status !== 422 && res.status !== 409 && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`${url} → ${res.status}: ${text.slice(0, 160)}`);
  }
}

/** Sobe ou reinicia a sessão dev até ficar pronta para QR ou falhar de vez. */
export async function prepararSessaoParaQr(reiniciar = false): Promise<string> {
  const { baseUrl, apiKey, session } = credenciaisWahaDev();
  if (!apiKey) throw new Error("WAHA_API_KEY não configurada");

  if (reiniciar) {
    await postIgnorando422409(`${baseUrl}/api/sessions/${session}/stop`, apiKey);
    await postIgnorando422409(`${baseUrl}/api/sessions/${session}/logout`, apiKey);
  }

  await postIgnorando422409(`${baseUrl}/api/sessions`, apiKey, {
    name: session,
    config: { ignore: CONVERSAS_IGNORADAS },
  });

  const atual = await statusSessaoWahaDev();
  if (atual === "FAILED" || atual === "STOPPED" || reiniciar) {
    await postIgnorando422409(`${baseUrl}/api/sessions/${session}/start`, apiKey);
  }

  for (let i = 0; i < 25; i++) {
    const status = await statusSessaoWahaDev();
    if (status === "SCAN_QR_CODE" || status === "WORKING") return status;
    if (status === "FAILED") {
      await postIgnorando422409(`${baseUrl}/api/sessions/${session}/logout`, apiKey);
      await postIgnorando422409(`${baseUrl}/api/sessions/${session}/start`, apiKey);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  return statusSessaoWahaDev();
}

export async function buscarImagemQrWaha(): Promise<Response> {
  const { baseUrl, apiKey, session } = credenciaisWahaDev();
  const status = await prepararSessaoParaQr(false);
  if (status !== "SCAN_QR_CODE") {
    throw new Error(`Sessão em ${status}; QR indisponível`);
  }

  const qrRes = await fetch(`${baseUrl}/api/${session}/auth/qr?format=image`, {
    headers: { "X-Api-Key": apiKey, Accept: "image/png" },
    cache: "no-store",
  });
  if (!qrRes.ok) {
    const body = await qrRes.text().catch(() => "");
    throw new Error(`QR ${qrRes.status}: ${body.slice(0, 120)}`);
  }

  const buf = Buffer.from(await qrRes.arrayBuffer());
  return new Response(buf, {
    headers: {
      "Content-Type": qrRes.headers.get("content-type") ?? "image/png",
      "Cache-Control": "no-store",
    },
  });
}
