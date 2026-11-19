// Dev server + Jev proxy.
// Keeps TYPESAFE_API_KEY on the server; the browser only talks to /api/jev.
// With no key set, /api/jev returns 501 and the browser falls back to its local mock brain.
import "dotenv/config";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 5173);
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const JEV_BASE_URL = process.env.JEV_BASE_URL?.trim();
const API_KEY = process.env.TYPESAFE_API_KEY?.trim();
const MODEL = process.env.JEV_MODEL ?? "jev-latest";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

async function callJev(body, attempt = 0) {
  const res = await fetch(JEV_BASE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: MODEL }),
  });
  // Docs: retry 429 / 529 with exponential backoff.
  if ((res.status === 429 || res.status === 529) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt + Math.random() * 100));
    return callJev(body, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(text || res.statusText), { status: res.status });
  return JSON.parse(text);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 256_000) throw Object.assign(new Error("payload too large"), { status: 413 });
  }
  return JSON.parse(raw);
}

function send(res, status, data, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");

      if (url.pathname === "/api/jev/status") {
        const live = Boolean(API_KEY && JEV_BASE_URL);
        return send(res, 200, { live, model: live ? MODEL : "mock" });
      }

      if (url.pathname === "/api/jev" && req.method === "POST") {
        const body = await readJson(req);
        if (!body?.questions || typeof body.questions !== "object") {
          return send(res, 422, { error: "questions required" });
        }
        if (!API_KEY) return send(res, 501, { error: "TYPESAFE_API_KEY not set" });
        if (!JEV_BASE_URL) return send(res, 501, { error: "JEV_BASE_URL not set" });
        const t0 = performance.now();
        const out = await callJev(body);
        return send(res, 200, { ...out, _latencyMs: Math.round(performance.now() - t0) });
      }

      const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
      if (rel.includes("..")) return send(res, 400, "bad path", "text/plain");
      const file = await readFile(join(ROOT, rel));
      send(res, 200, file, MIME[extname(rel)] ?? "application/octet-stream");
    } catch (err) {
      if (err.code === "ENOENT") return send(res, 404, "not found", "text/plain");
      console.error(err);
      send(res, err.status ?? 500, { error: String(err.message ?? err) });
    }
  });
}

export function startServer({ port = PORT } = {}) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(server);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().then((server) => {
    const address = server.address();
    console.log(`Jev3D server listening on http://127.0.0.1:${address.port}`);
    console.log(API_KEY && JEV_BASE_URL
      ? `Jev: LIVE (${MODEL})`
      : "Jev: MOCK mode (set TYPESAFE_API_KEY and JEV_BASE_URL for the real model)");
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
