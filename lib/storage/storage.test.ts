/**
 * Porta de storage: seleção do backend, fail-closed do R2, URL assinada
 * (SigV4) sem SDK. Nenhum bucket real — fetch e o relógio são dublados.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { backendDeStorage, credenciaisR2, chavePublicaR2 } from "@/lib/storage/backend";
import { objectStorage } from "@/lib/storage";
import { amzDate, awsUriEncode, urlPreAssinadaGet } from "@/lib/storage/r2-assinatura";

const ORIG: Record<string, string | undefined> = {};
const CHAVES = [
  "STORAGE_BACKEND",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_ENDPOINT",
  "R2_REGION",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

function gravar() {
  for (const k of CHAVES) ORIG[k] = process.env[k];
}

function restaurar() {
  for (const k of CHAVES) {
    if (ORIG[k] === undefined) delete process.env[k];
    else process.env[k] = ORIG[k];
  }
}

function r2Completo() {
  process.env.STORAGE_BACKEND = "r2";
  process.env.R2_ACCOUNT_ID = "acct123";
  process.env.R2_ACCESS_KEY_ID = "AKIA_TESTE";
  process.env.R2_SECRET_ACCESS_KEY = "segredo-nunca-logado";
  process.env.R2_ENDPOINT = "https://acct123.r2.cloudflarestorage.com";
  process.env.R2_REGION = "auto";
  process.env.R2_BUCKET = "";
  process.env.R2_PUBLIC_BASE_URL = "https://cdn.exemplo.test";
}

describe("backendDeStorage", () => {
  afterEach(restaurar);
  it("ausente ou lixo cai em supabase (não derruba quem já instalou)", () => {
    gravar();
    delete process.env.STORAGE_BACKEND;
    expect(backendDeStorage()).toBe("supabase");
    process.env.STORAGE_BACKEND = "S3";
    expect(backendDeStorage()).toBe("supabase");
    process.env.STORAGE_BACKEND = "R2";
    expect(backendDeStorage()).toBe("r2");
  });

  it("chavePublicaR2: bucket físico vazio = só o path; preenchido = lógico/path", () => {
    gravar();
    delete process.env.R2_BUCKET;
    expect(chavePublicaR2("brand-logos", "platform/a.png")).toBe("platform/a.png");
    process.env.R2_BUCKET = "unico";
    expect(chavePublicaR2("brand-logos", "platform/a.png")).toBe("brand-logos/platform/a.png");
  });
});

describe("credenciaisR2 — fail-closed", () => {
  afterEach(restaurar);

  it("lista só os NOMES das chaves que faltam, nunca o valor", () => {
    gravar();
    process.env.STORAGE_BACKEND = "r2";
    delete process.env.R2_ACCOUNT_ID;
    process.env.R2_ACCESS_KEY_ID = "AKIA_VAZOU";
    delete process.env.R2_SECRET_ACCESS_KEY;
    const c = credenciaisR2();
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.motivo).toContain("R2_ACCOUNT_ID");
    expect(c.motivo).toContain("R2_SECRET_ACCESS_KEY");
    expect(c.motivo).not.toContain("AKIA_VAZOU");
    expect(c.motivo).not.toContain("segredo");
  });

  it("completo devolve endpoint derivado do account id quando R2_ENDPOINT vazio", () => {
    gravar();
    r2Completo();
    delete process.env.R2_ENDPOINT;
    const c = credenciaisR2();
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.creds.endpoint).toBe("https://acct123.r2.cloudflarestorage.com");
    expect(c.creds.region).toBe("auto");
  });
});

describe("objectStorage — fail-closed quando r2 está incompleto", () => {
  afterEach(restaurar);

  it("upload/download/assinatura devolvem error e não lançam", async () => {
    gravar();
    process.env.STORAGE_BACKEND = "r2";
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;

    const porta = objectStorage("whatsapp-media");
    const up = await porta.upload("org/a.jpg", Buffer.from("x"), { contentType: "image/jpeg" });
    expect(up.data).toBeNull();
    expect(up.error?.message).toMatch(/STORAGE_BACKEND=r2/);
    expect(up.error?.message).not.toMatch(/segredo/i);

    const dl = await porta.download("org/a.jpg");
    expect(dl.data).toBeNull();
    expect(dl.error).not.toBeNull();

    const sign = await porta.createSignedUrl("org/a.jpg", 60);
    expect(sign.data).toBeNull();
    expect(sign.error).not.toBeNull();
  });
});

describe("url pré-assinada (SigV4)", () => {
  it("é determinística para o mesmo relógio e NÃO contém o secret", () => {
    const agora = new Date("2026-08-31T12:00:00.000Z");
    const args = {
      endpoint: "https://acct123.r2.cloudflarestorage.com",
      bucket: "whatsapp-media",
      key: "org/conv/msg.jpg",
      region: "auto",
      accessKeyId: "AKIA_TESTE",
      secretAccessKey: "segredo-nunca-logado",
      expiresInSeconds: 600,
      agora,
    };
    const a = urlPreAssinadaGet(args);
    const b = urlPreAssinadaGet(args);
    expect(a).toBe(b);
    expect(a).toContain("X-Amz-Signature=");
    expect(a).toContain("X-Amz-Expires=600");
    expect(a).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(a).not.toContain("segredo-nunca-logado");
    expect(a.startsWith("https://acct123.r2.cloudflarestorage.com/whatsapp-media/org/conv/msg.jpg?")).toBe(
      true,
    );
  });

  it("secret diferente produz assinatura diferente", () => {
    const agora = new Date("2026-08-31T12:00:00.000Z");
    const base = {
      endpoint: "https://acct123.r2.cloudflarestorage.com",
      bucket: "whatsapp-media",
      key: "org/conv/msg.jpg",
      region: "auto",
      accessKeyId: "AKIA_TESTE",
      expiresInSeconds: 60,
      agora,
    };
    const a = urlPreAssinadaGet({ ...base, secretAccessKey: "aaa" });
    const b = urlPreAssinadaGet({ ...base, secretAccessKey: "bbb" });
    expect(a).not.toBe(b);
  });

  it("amzDate formata UTC estável", () => {
    expect(amzDate(new Date("2026-08-31T12:00:00.000Z"))).toEqual({
      amz: "20260831T120000Z",
      dateStamp: "20260831",
    });
  });

  it("awsUriEncode preserva barra no path e percent-encode o resto", () => {
    expect(awsUriEncode("org/conv/a b.jpg", false)).toBe("org/conv/a%20b.jpg");
    expect(awsUriEncode("whatsapp-media", true)).toBe("whatsapp-media");
  });
});

describe("porta R2 — upload/download via fetch dublado", () => {
  afterEach(() => {
    restaurar();
    vi.unstubAllGlobals();
  });

  it("PUT 200 → data.path; GET devolve Blob; GET 404 → not_found", async () => {
    gravar();
    r2Completo();

    const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      if (method === "PUT") return new Response("", { status: 200 });
      if (method === "GET") {
        if (String(url).includes("sumiu.jpg")) return new Response("", { status: 404 });
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }
      if (method === "DELETE") return new Response("", { status: 204 });
      return new Response("", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const porta = objectStorage("whatsapp-media");
    const up = await porta.upload("org/a.jpg", Buffer.from("abc"), { contentType: "image/jpeg" });
    expect(up.error).toBeNull();
    expect(up.data?.path).toBe("org/a.jpg");
    expect(fetchMock).toHaveBeenCalled();
    const putUrl = String(fetchMock.mock.calls[0]![0]);
    expect(putUrl).toContain("/whatsapp-media/org/a.jpg");
    // o secret não viaja na URL
    expect(putUrl).not.toContain("segredo-nunca-logado");

    const dl = await porta.download("org/a.jpg");
    expect(dl.error).toBeNull();
    expect(dl.data).toBeInstanceOf(Blob);
    expect(await dl.data!.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);

    const miss = await porta.download("sumiu.jpg");
    expect(miss.error?.message).toBe("not_found");

    const sign = await porta.createSignedUrl("org/a.jpg", 120);
    expect(sign.error).toBeNull();
    expect(sign.data?.signedUrl).toContain("X-Amz-Signature=");
    expect(sign.data?.signedUrl).not.toContain("segredo-nunca-logado");

    const pub = porta.getPublicUrl("org/logo.png");
    expect(pub.data.publicUrl).toBe("https://cdn.exemplo.test/org/logo.png");
  });

  it("R2_BUCKET preenchido prefixa o nome lógico na chave e na URL pública", async () => {
    gravar();
    r2Completo();
    process.env.R2_BUCKET = "midia-unica";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 })),
    );

    const porta = objectStorage("whatsapp-media");
    await porta.upload("org/a.jpg", Buffer.from("x"), { contentType: "image/jpeg" });
    const putUrl = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(putUrl).toContain("/midia-unica/whatsapp-media/org/a.jpg");
    expect(porta.getPublicUrl("org/logo.png").data.publicUrl).toBe(
      "https://cdn.exemplo.test/whatsapp-media/org/logo.png",
    );
  });
});
