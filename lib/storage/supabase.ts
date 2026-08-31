/**
 * Adapter Supabase Storage — o default. Encapsula o client admin para os
 * call sites não falarem com `.storage.from` direto. Mock de `createAdminClient`
 * nos testes existentes continua valendo: esta função é quem o chama.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { StoragePort } from "./types";

export function portaSupabase(bucket: string): StoragePort {
  const inner = createAdminClient().storage.from(bucket);
  return {
    upload: (path, body, options) => inner.upload(path, body, options),
    download: (path) => inner.download(path),
    remove: (paths) => inner.remove(paths),
    createSignedUrl: (path, expiresInSeconds) => inner.createSignedUrl(path, expiresInSeconds),
    getPublicUrl: (path) => inner.getPublicUrl(path),
  };
}
