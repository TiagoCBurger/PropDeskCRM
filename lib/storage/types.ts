/**
 * Porta de object storage — o único jeito de subir, baixar, apagar ou assinar
 * um arquivo. Os call sites não conhecem Supabase Storage nem R2: escolhem um
 * bucket lógico (`whatsapp-media`, `ai-policy`, …) e a porta resolve o backend
 * via `STORAGE_BACKEND` (default `supabase`, para quem já instalou).
 *
 * A forma de erro espelha o client do Supabase (`{ data, error: { message } }`)
 * para a troca nos call sites ser mecânica. Não logue o conteúdo de
 * `R2_SECRET_ACCESS_KEY` / `R2_ACCESS_KEY_ID` — nem em `message`.
 */

export type StorageBackend = "supabase" | "r2";

export interface StorageErro {
  message: string;
}

export interface StorageUploadOpts {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
}

export type StorageBody = Buffer | Uint8Array | ArrayBuffer | Blob | File;

export interface StoragePort {
  upload(
    path: string,
    body: StorageBody,
    options?: StorageUploadOpts,
  ): Promise<{ data: { path: string } | null; error: StorageErro | null }>;

  download(path: string): Promise<{ data: Blob | null; error: StorageErro | null }>;

  remove(
    paths: string[],
  ): Promise<{ data: unknown; error: StorageErro | null }>;

  createSignedUrl(
    path: string,
    expiresInSeconds: number,
  ): Promise<{ data: { signedUrl: string } | null; error: StorageErro | null }>;

  getPublicUrl(path: string): { data: { publicUrl: string } };
}

export interface CredenciaisR2 {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
  /** Bucket físico. Vazio = o nome lógico (`whatsapp-media`, …) é o bucket S3. */
  bucket: string;
  publicBaseUrl: string;
}
