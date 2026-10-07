#!/usr/bin/env node
// Download a PDF through an already-authenticated Chrome page controlled by the
// web-access CDP proxy. Does not bypass logins, CAPTCHA, Cloudflare, paywalls,
// or publisher restrictions.
//
// v3 changes vs v1:
//   - imports shared helpers from ./cdp-client.mjs (no more duplicated code)
//   - writes to <out>.partial and atomically renames on success, so a corrupt
//     half-PDF can never appear at the final path (row 8)
//   - retries once on transient errors (timeout / network); never retries on
//     verification/non-PDF/HTTP-4xx-class problems (row 9)

import fs from "node:fs";
import path from "node:path";
import { proxyGet, proxyEval, sleep, normalizeProxy } from "./cdp-client.mjs";

function usage() {
  console.log(`Usage:
  node browser_pdf_downloader.mjs --url <pdf-url> --out <file.pdf> [--proxy http://127.0.0.1:3456] [--close] [--allow-non-pdf]
  node browser_pdf_downloader.mjs --target <targetId> --out <file.pdf> [--proxy http://127.0.0.1:3456]

Downloads a PDF through an already-authenticated Chrome page controlled by the web-access CDP proxy.
It does not bypass logins, CAPTCHA, Cloudflare, paywalls, or publisher restrictions.`);
}

function parseArgs(argv) {
  const args = { chunkSize: 262144 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--url") args.url = argv[++i];
    else if (a === "--target") args.target = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--proxy") args.proxy = argv[++i];
    else if (a === "--close") args.close = true;
    else if (a === "--allow-non-pdf") args.allowNonPdf = true;
    else if (a === "--chunk-size") args.chunkSize = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

// Transient = timeout or network/transport. Verification failures, non-PDF
// responses, and HTTP error statuses are NOT transient and must not be retried.
function isTransient(err) {
  const name = (err && err.name) || "";
  const msg = (err && err.message) || String(err);
  return (
    name === "TimeoutError" ||
    /fetch failed|econnreset|etimedout|esockettimedout|socket hang up|network error|aborted/i.test(msg)
  );
}

// Retry once on transient errors. Non-transient errors propagate immediately.
async function withRetry(fn, label) {
  try {
    return await fn();
  } catch (e) {
    if (isTransient(e)) {
      await sleep(1500);
      return fn();
    }
    const wrapped = new Error(`${label} failed: ${e && e.message ? e.message : e}`);
    wrapped.cause = e;
    wrapped.transient = false;
    throw wrapped;
  }
}

async function waitForComplete(proxy, target, maxMs = 45000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < maxMs) {
    try {
      last = await proxyGet(proxy, "/info", { target }, 10000);
      if (last.ready === "complete") return last;
    } catch (_) {}
    await sleep(1000);
  }
  return last;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }
  if (!args.out) throw new Error("--out is required");
  if (!args.url && !args.target) throw new Error("Provide --url or --target");

  const proxy = normalizeProxy(args.proxy);
  let target = args.target;
  let openedByScript = false;

  if (!target) {
    const newUrl = proxy + "/new";
    const response = await fetch(newUrl, {
      method: "POST",
      body: args.url,
      signal: AbortSignal.timeout(60000),
    });
    const created = await response.json();
    if (!response.ok) throw new Error(`POST /new failed: ${JSON.stringify(created)}`);
    target = created.targetId;
    openedByScript = true;
    await waitForComplete(proxy, target);
  } else if (args.url) {
    const navUrl = proxy + "/navigate?target=" + target;
    const navResp = await fetch(navUrl, {
      method: "POST",
      body: args.url,
      signal: AbortSignal.timeout(60000),
    });
    if (!navResp.ok) throw new Error(`POST /navigate failed: ${await navResp.text()}`);
    await waitForComplete(proxy, target);
  }

  const initJs = `(
    async () => {
      const r = await fetch(location.href, { credentials: "include" });
      const ct = r.headers.get("content-type") || "";
      const ab = await r.arrayBuffer();
      window.__thuLiteratureDownloaderBytes = new Uint8Array(ab);
      return {
        ok: r.ok,
        status: r.status,
        contentType: ct,
        size: window.__thuLiteratureDownloaderBytes.length,
        url: location.href,
        head: Array.from(window.__thuLiteratureDownloaderBytes.slice(0, 8))
      };
    }
  )()`;

  const init = await withRetry(() => proxyEval(proxy, target, initJs, 120000), "page-context fetch");
  const meta = init.value;
  if (!meta || !meta.ok) {
    throw new Error(`Browser fetch failed: ${JSON.stringify(meta)}`);
  }

  const headAscii = Buffer.from(meta.head || []).toString("ascii");
  if (!args.allowNonPdf && !headAscii.startsWith("%PDF")) {
    throw new Error(
      `Downloaded content is not a PDF. content-type=${meta.contentType}, head=${JSON.stringify(meta.head)}. ` +
      `If this is expected, rerun with --allow-non-pdf.`
    );
  }

  // Write to <out>.partial, then atomically rename on success. A crash or
  // mid-transfer error leaves only the .partial file — never a corrupt file at
  // the final path, so downstream verification cannot mistake it for success.
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  const finalPath = path.resolve(args.out);
  const partialPath = finalPath + ".partial";
  const size = Number(meta.size);
  let transferred = 0;

  try {
    const stream = fs.createWriteStream(partialPath);
    const done = new Promise((resolve, reject) => {
      stream.on("error", reject);
      stream.on("finish", resolve);
    });

    for (let start = 0; start < size; start += args.chunkSize) {
      const end = Math.min(start + args.chunkSize, size);
      const chunkJs = `(
        () => {
          const bytes = window.__thuLiteratureDownloaderBytes.slice(${start}, ${end});
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          return btoa(bin);
        }
      )()`;
      const chunk = await withRetry(() => proxyEval(proxy, target, chunkJs, 120000), `chunk ${start}-${end}`);
      const buf = Buffer.from(chunk.value, "base64");
      transferred += buf.length;
      if (!stream.write(buf)) await new Promise((r) => stream.once("drain", r));
    }
    stream.end();
    await done;
    fs.renameSync(partialPath, finalPath);
  } catch (e) {
    // Clean up the partial file; surface a clear error.
    try { fs.unlinkSync(partialPath); } catch (_) {}
    throw new Error(`transfer aborted at ${transferred}/${size} bytes after cleanup: ${e && e.message ? e.message : e}`);
  }

  const saved = fs.readFileSync(finalPath);
  const savedHead = saved.subarray(0, 8).toString("ascii");
  const result = {
    out: finalPath,
    bytes: saved.length,
    contentType: meta.contentType,
    sourceUrl: meta.url,
    signature: savedHead,
    pdf: savedHead.startsWith("%PDF"),
  };
  console.log(JSON.stringify(result, null, 2));

  if (args.close && openedByScript) {
    try { await proxyGet(proxy, "/close", { target }, 10000); } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
