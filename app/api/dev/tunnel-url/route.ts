import { readFile } from "node:fs/promises";

import { ok } from "@/lib/api/wrappers";

const TUNNEL_FILE = "/tmp/deskcomm-tunnel-url.txt";

/** Lê URL do túnel cloudflared gravada em /tmp (dev). */
export async function GET() {
  try {
    const url = (await readFile(TUNNEL_FILE, "utf8")).trim();
    if (!url.startsWith("https://")) {
      return ok({ url: null });
    }
    return ok({ url });
  } catch {
    return ok({ url: null });
  }
}
