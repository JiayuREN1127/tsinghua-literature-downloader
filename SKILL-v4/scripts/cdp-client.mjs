// Shared CDP proxy HTTP client.
// v3 foundation module. New scripts (probe.mjs) import from here.
// Existing scripts (browser_pdf_downloader.mjs, cdp_open_url.mjs) keep their
// inline copies for now; refactoring them onto this module is a follow-up task.

export const DEFAULT_PROXY = "http://127.0.0.1:3456";

export async function httpJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 60000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

export async function proxyGet(proxy, endpoint, params = {}, timeoutMs = 60000) {
  const u = new URL(endpoint, proxy);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return httpJson(u.toString(), { timeoutMs });
}

export async function proxyPost(proxy, endpoint, body = "", timeoutMs = 60000) {
  const u = new URL(endpoint, proxy);
  return httpJson(u.toString(), { method: "POST", body, timeoutMs });
}

export async function proxyEval(proxy, target, js, timeoutMs = 60000) {
  const u = new URL("/eval", proxy);
  u.searchParams.set("target", target);
  return httpJson(u.toString(), { method: "POST", body: js, timeoutMs });
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Resolve the CDP proxy base, trimming a trailing slash.
export function normalizeProxy(p) {
  return (p || DEFAULT_PROXY).replace(/\/$/, "");
}

// Parse --arg key=value repeated flags into an object.
export function parseKVPairs(arr = []) {
  const out = {};
  for (const kv of arr) {
    const idx = kv.indexOf("=");
    if (idx === -1) continue;
    out[kv.slice(0, idx)] = kv.slice(idx + 1);
  }
  return out;
}
