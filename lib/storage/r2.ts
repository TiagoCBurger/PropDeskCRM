/**
 * Adapter R2 (S3-compatível). Um bucket físico (`R2_BUCKET`) com prefixo do
 * bucket lógico, ou — se `R2_BUCKET` vazio — o próprio nome lógico como bucket
 * S3. Paths no Postgres não mudam: `{org}/…` continua sendo a chave.
 */

import { logger } from "@/lib/logger";
import { backendDeStorage, credenciaisR2 } from "./backend";
import {
  cabecalhosAssinados,
  sha256Hex,
  urlDoObjeto,
  urlPreAssinadaGet,
} from "./r2-assinatura";
import type { CredenciaisR2, StorageBody, StorageErro, StoragePort, StorageUploadOpts } from "./types";

function bucketFisico(logico: string, creds: CredenciaisR2): string {
  return creds.bucket || logico;
}

function chave(logico: string, path: string, creds: CredenciaisR2): string {
  const limpo = path.replace(/^\/+/, "");
  // Um bucket físico: o nome lógico vira prefixo. Vários buckets S3: a chave
  // é só o path, igual ao que o Postgres já guarda.
  return creds.bucket ? `${logico}/${limpo}` : limpo;
}

async function corpoParaBuffer(body: StorageBody): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(await (body as Blob).arrayBuffer());
}

function erro(message: string): { data: null; error: StorageErro } {
  return { data: null, error: { message } };
}

export function portaFechada(motivo: string): StoragePort {
  return {
    async upload() {
      return erro(motivo);
    },
    async download() {
      return erro(motivo);
    },
    async remove() {
      return { data: null, error: { message: motivo } };
    },
    async createSignedUrl() {
      return erro(motivo);
    },
    getPublicUrl() {
      return { data: { publicUrl: "" } };
    },
  };
}

async function s3(
  creds: CredenciaisR2,
  method: "GET" | "PUT" | "DELETE",
  bucket: string,
  keyPath: string,
  body?: Buffer,
  contentType?: string,
): Promise<{ status: number; body: Buffer; headers: Headers }> {
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = method === "GET" || method === "DELETE" ? sha256Hex(Buffer.alloc(0)) : sha256Hex(payload);
  const headers = cabecalhosAssinados({
    method,
    endpoint: creds.endpoint,
    bucket,
    key: keyPath,
    region: creds.region,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    payloadHash,
    headers: contentType ? { "content-type": contentType } : undefined,
  });
  const url = urlDoObjeto(creds.endpoint, bucket, keyPath);
  const res = await fetch(url, {
    method,
    headers,
    body: method === "PUT" ? new Uint8Array(payload) : undefined,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: buf, headers: res.headers };
}

export function portaR2(logico: string, creds: CredenciaisR2): StoragePort {
  const fisico = bucketFisico(logico, creds);

  return {
    async upload(path, body, options?: StorageUploadOpts) {
      try {
        const buf = await corpoParaBuffer(body);
        const keyPath = chave(logico, path, creds);
        const { status } = await s3(
          creds,
          "PUT",
          fisico,
          keyPath,
          buf,
          options?.contentType,
        );
        if (status >= 200 && status < 300) {
          return { data: { path }, error: null };
        }
        return erro(`r2_upload_falhou: http_${status}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "r2_upload_falhou";
        logger.error("[storage.r2] upload falhou", { bucket: logico });
        return erro(message);
      }
    },

    async download(path) {
      try {
        const keyPath = chave(logico, path, creds);
        const { status, body, headers } = await s3(creds, "GET", fisico, keyPath);
        if (status === 404) return erro("not_found");
        if (status >= 200 && status < 300) {
          const tipo = headers.get("content-type") ?? "application/octet-stream";
          return { data: new Blob([new Uint8Array(body)], { type: tipo }), error: null };
        }
        return erro(`r2_download_falhou: http_${status}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "r2_download_falhou";
        logger.error("[storage.r2] download falhou", { bucket: logico });
        return erro(message);
      }
    },

    async remove(paths) {
      try {
        for (const path of paths) {
          const keyPath = chave(logico, path, creds);
          const { status } = await s3(creds, "DELETE", fisico, keyPath);
          // 404 = já não está lá. A fila de redação LGPD trata "not found"
          // como sucesso (idempotente); espelhamos isso no R2.
          if (status !== 404 && (status < 200 || status >= 300)) {
            return { data: null, error: { message: `r2_remove_falhou: http_${status}` } };
          }
        }
        return { data: paths.map((p) => ({ name: p })), error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "r2_remove_falhou";
        logger.error("[storage.r2] remove falhou", { bucket: logico });
        return { data: null, error: { message } };
      }
    },

    async createSignedUrl(path, expiresInSeconds) {
      try {
        const keyPath = chave(logico, path, creds);
        const signedUrl = urlPreAssinadaGet({
          endpoint: creds.endpoint,
          bucket: fisico,
          key: keyPath,
          region: creds.region,
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          expiresInSeconds,
        });
        return { data: { signedUrl }, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "r2_sign_falhou";
        return erro(message);
      }
    },

    getPublicUrl(path) {
      const limpo = path.replace(/^\/+/, "");
      const base = creds.publicBaseUrl.replace(/\/+$/, "");
      if (!base) return { data: { publicUrl: "" } };
      const keyPath = chave(logico, limpo, creds);
      return { data: { publicUrl: `${base}/${keyPath}` } };
    },
  };
}

/**
 * Porta R2 a partir do env atual. Se o backend não é r2, não use isto —
 * `objectStorage()` escolhe. Exportada para teste direto.
 */
export function portaR2DoEnv(logico: string): StoragePort {
  if (backendDeStorage() !== "r2") {
    return portaFechada("portaR2DoEnv chamada com STORAGE_BACKEND != r2");
  }
  const c = credenciaisR2();
  if (!c.ok) return portaFechada(c.motivo);
  return portaR2(logico, c.creds);
}
