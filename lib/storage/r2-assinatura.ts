/**
 * AWS Signature Version 4 para a API S3-compatível do Cloudflare R2.
 *
 * Sem SDK de propósito: o adapter só precisa de PUT/GET/DELETE e URL
 * pré-assinada, e puxar `@aws-sdk/client-s3` para toda instalação que continua
 * no Supabase Storage (o default) inflaria a imagem que o self-hoster baixa.
 *
 * Região do R2 é `auto` (documentado pela Cloudflare). Nunca logue `secretKey`.
 */

import { createHash, createHmac } from "node:crypto";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

export function chaveDeAssinatura(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/**
 * Encode de URI no estilo AWS: unreserved intacto; `/` só quando `encodeSlash`
 * é verdadeiro. Itera code points para não quebrar UTF-8 no meio do byte.
 */
export function awsUriEncode(input: string, encodeSlash = true): string {
  let out = "";
  for (const ch of input) {
    if (/[A-Za-z0-9._~-]/.test(ch)) {
      out += ch;
    } else if (ch === "/" && !encodeSlash) {
      out += "/";
    } else {
      const buf = Buffer.from(ch, "utf8");
      for (const b of buf) {
        out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

export function amzDate(agora: Date): { amz: string; dateStamp: string } {
  const iso = agora.toISOString(); // 2013-05-24T00:00:00.000Z
  const dateStamp = iso.slice(0, 10).replace(/-/g, "");
  const time = iso.slice(11, 19).replace(/:/g, "");
  return { amz: `${dateStamp}T${time}Z`, dateStamp };
}

export interface RequisicaoS3 {
  method: "GET" | "PUT" | "DELETE";
  endpoint: string;
  bucket: string;
  key: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  headers?: Record<string, string>;
  payloadHash: string;
  agora?: Date;
}

export function urlDoObjeto(endpoint: string, bucket: string, key: string): string {
  const base = endpoint.replace(/\/+$/, "");
  const caminho = `/${awsUriEncode(bucket, true)}/${awsUriEncode(key, false)}`;
  return `${base}${caminho}`;
}

function hostDoEndpoint(endpoint: string): string {
  return new URL(endpoint).host;
}

export function cabecalhosAssinados(req: RequisicaoS3): Record<string, string> {
  const { amz, dateStamp } = amzDate(req.agora ?? new Date());
  const host = hostDoEndpoint(req.endpoint);
  const extras = req.headers ?? {};
  const headers: Record<string, string> = {
    host,
    "x-amz-date": amz,
    "x-amz-content-sha256": req.payloadHash,
    ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k.toLowerCase(), v])),
  };

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((n) => `${n}:${headers[n]!.trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalUri = `/${awsUriEncode(req.bucket, true)}/${awsUriEncode(req.key, false)}`;
  const canonicalRequest = [
    req.method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    req.payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${req.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hmac(
    chaveDeAssinatura(req.secretAccessKey, dateStamp, req.region, "s3"),
    stringToSign,
  ).toString("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${req.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

export function urlPreAssinadaGet(req: Omit<RequisicaoS3, "method" | "payloadHash"> & {
  expiresInSeconds: number;
}): string {
  const agora = req.agora ?? new Date();
  const { amz, dateStamp } = amzDate(agora);
  const host = hostDoEndpoint(req.endpoint);
  const expires = Math.max(1, Math.min(604800, Math.floor(req.expiresInSeconds)));
  const scope = `${dateStamp}/${req.region}/s3/aws4_request`;
  const credential = `${req.accessKeyId}/${scope}`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${awsUriEncode(k)}=${awsUriEncode(query[k]!)}`)
    .join("&");

  const canonicalUri = `/${awsUriEncode(req.bucket, true)}/${awsUriEncode(req.key, false)}`;
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(
    chaveDeAssinatura(req.secretAccessKey, dateStamp, req.region, "s3"),
    stringToSign,
  ).toString("hex");

  const base = req.endpoint.replace(/\/+$/, "");
  return `${base}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
