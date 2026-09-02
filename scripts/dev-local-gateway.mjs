#!/usr/bin/env node
/**
 * Gateway mínimo no lugar do Kong do `supabase start`.
 *
 * No Cloud Agent o Docker bridge entre containers estoura timeout (GoTrue/
 * PostgREST não alcançam o Postgres pelo DNS interno). Os serviços sobem com
 * `--network host` e este processo junta `/auth/v1` e `/rest/v1` na porta
 * 54321 — a mesma URL que o `.env.local` já espera.
 */
import http from "node:http";

const AUTH = process.env.DEV_AUTH_ORIGIN ?? "http://127.0.0.1:9999";
const REST = process.env.DEV_REST_ORIGIN ?? "http://127.0.0.1:54331";
const PORT = Number(process.env.DEV_GATEWAY_PORT ?? "54321");

const rotas = [
  { prefix: "/auth/v1", target: AUTH },
  { prefix: "/rest/v1", target: REST },
];

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const match = rotas.find(
    (r) => url === r.prefix || url.startsWith(`${r.prefix}/`) || url.startsWith(`${r.prefix}?`),
  );
  if (!match) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found", path: url }));
    return;
  }
  const stripped = url.slice(match.prefix.length) || "/";
  const dest = new URL(stripped, match.target);
  const headers = { ...req.headers, host: dest.host };
  const up = http.request(dest, { method: req.method, headers }, (incoming) => {
    res.writeHead(incoming.statusCode || 502, incoming.headers);
    incoming.pipe(res);
  });
  up.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ error: "bad_gateway", message: String(err) }));
  });
  req.pipe(up);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[dev-local-gateway] :${PORT} auth=${AUTH} rest=${REST}`);
});
