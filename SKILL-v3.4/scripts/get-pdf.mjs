#!/usr/bin/env node
// get-pdf.mjs — the v3 download path. One command per paper.
//
//   node scripts/get-pdf.mjs --target <id> --publisher <name> [--arg k=v ...] --out file.pdf
//
// It runs the publisher's ACTION module (which knows HOW to reach the PDF for
// that site — fetch / POST / new-tab presigned / click-to-download / PDF.js),
// gets back a tiny FETCH PLAN, then executes the plan and saves the PDF. The
// agent sees only the final compact result; plan details go to stderr.
//
// Modes (decided by the action's plan):
//   fetch          in-page fetch(url,{method,credentials}); cross-origin => new tab
//   newtab-fetch   action already clicked View PDF; find the popped tab, fetch it
//   click-download action already clicked Download; watch the download dir for the file
//   pdfjs          read bytes from an in-page PDF.js viewer (iframe)
//
// Does not bypass logins, CAPTCHA, Cloudflare, paywalls, or publisher restrictions.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { proxyGet, proxyPost, proxyEval, sleep, normalizeProxy, parseKVPairs } from "./cdp-client.mjs";
import * as actions from "../actions/index.mjs";

function usage() {
  console.log(`Usage:
  node scripts/get-pdf.mjs --target <id> --publisher <name> [--arg k=v ...] --out file.pdf
  node scripts/get-pdf.mjs --target <id> --plan '<json>' --out file.pdf

Options:
  --target <id>       Chrome tab with the authenticated article page
  --publisher <name>  Action module to run for discovery (see --list)
  --plan '<json>'     Execute a literal plan instead of discovering one
  --out <path>        Output PDF path (required)
  --arg k=v           Action argument, repeatable (e.g. --arg doi=10.1002/...)
  --proxy <url>       CDP proxy URL, default http://127.0.0.1:3456
  --download-dir <p>  Native-download watch dir for click-download mode (default ~/Downloads)
  --allow-non-pdf     Save even when content does not start with %PDF
  --show-plan         Print the discovered plan to stdout (debug)
  --list              List action modules and exit
  --help, -h`);
}

function parseArgs(argv) {
  const a = { args: [], chunkSize: 262144 };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--help" || t === "-h") a.help = true;
    else if (t === "--list") a.list = true;
    else if (t === "--target") a.target = argv[++i];
    else if (t === "--publisher") a.publisher = argv[++i];
    else if (t === "--plan") a.plan = argv[++i];
    else if (t === "--out") a.out = argv[++i];
    else if (t === "--arg") a.args.push(argv[++i]);
    else if (t === "--proxy") a.proxy = argv[++i];
    else if (t === "--download-dir") a.downloadDir = argv[++i];
    else if (t === "--allow-non-pdf") a.allowNonPdf = true;
    else if (t === "--show-plan") a.showPlan = true;
    else if (t === "--chunk-size") a.chunkSize = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${t}`);
  }
  return a;
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

// Fetch inside the page, store bytes to window.__getPdfBytes, return small meta.
async function pageFetchToWindow(proxy, target, url, method, credentials) {
  const js = `(async()=>{
    var r = await fetch(${JSON.stringify(url || "location.href")}, {
      method: ${JSON.stringify((method || "GET").toUpperCase())},
      credentials: ${JSON.stringify(credentials || "include")}
    });
    var ct = r.headers.get("content-type") || "";
    var ab = await r.arrayBuffer();
    window.__getPdfBytes = new Uint8Array(ab);
    return { ok: r.ok, status: r.status, contentType: ct, size: window.__getPdfBytes.length, url: ${JSON.stringify(url || "")} || location.href, head: Array.from(window.__getPdfBytes.slice(0,8)) };
  })()`;
  const res = await proxyEval(proxy, target, js, 180000);
  return res.value;
}

// Read bytes from an in-page PDF.js viewer (iframe) into window.__getPdfBytes.
async function pdfjsToWindow(proxy, target, iframeSelector) {
  const js = `(async()=>{
    var f = document.querySelector(${JSON.stringify(iframeSelector || "iframe")});
    if (!f || !f.contentWindow || !f.contentWindow.PDFViewerApplication) return { ok:false, status:0, note:"no PDFViewerApplication in iframe" };
    var data = await f.contentWindow.PDFViewerApplication.pdfDocument.getData();
    window.__getPdfBytes = new Uint8Array(data);
    return { ok:true, status:200, contentType:"application/pdf", size: window.__getPdfBytes.length, head: Array.from(window.__getPdfBytes.slice(0,8)) };
  })()`;
  const res = await proxyEval(proxy, target, js, 180000);
  return res.value;
}

// Transfer window.__getPdfBytes to disk in base64 chunks. Writes <out>.partial
// then atomically renames, so a half-PDF can never appear at the final path.
async function transferBytes(proxy, target, size, out, chunkSize) {
  const finalPath = path.resolve(out);
  const partialPath = finalPath + ".partial";
  let transferred = 0;
  try {
    const stream = fs.createWriteStream(partialPath);
    const done = new Promise((resolve, reject) => {
      stream.on("error", reject);
      stream.on("finish", resolve);
    });
    for (let start = 0; start < size; start += chunkSize) {
      const end = Math.min(start + chunkSize, size);
      const chunkJs = `(() => {
        var b = window.__getPdfBytes.slice(${start}, ${end});
        var s = "";
        for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
        return btoa(s);
      })()`;
      const chunk = await proxyEval(proxy, target, chunkJs, 180000);
      const buf = Buffer.from(chunk.value, "base64");
      transferred += buf.length;
      if (!stream.write(buf)) await new Promise((r) => stream.once("drain", r));
    }
    stream.end();
    await done;
    fs.renameSync(partialPath, finalPath);
  } catch (e) {
    try { fs.unlinkSync(partialPath); } catch (_) {}
    throw new Error(`transfer aborted at ${transferred}/${size} bytes after cleanup: ${e && e.message ? e.message : e}`);
  }
  return finalPath;
}

// newtab-fetch: find a tab whose host contains `hint` that appeared after start.
async function findNewTab(proxy, hint, maxMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    let tabs = [];
    try { tabs = await proxyGet(proxy, "/targets", {}, 10000); } catch (_) {}
    const arr = Array.isArray(tabs) ? tabs : tabs && tabs.targets ? tabs.targets : [];
    for (const t of arr) {
      const u = t.url || "";
      if (hint && u.toLowerCase().includes(hint.toLowerCase()) && !/about:blank/i.test(u)) {
        return t.targetId || t.id;
      }
    }
    await sleep(1000);
  }
  return null;
}

// click-download: watch a directory for a new .pdf that stabilizes in size.
async function waitForNativePdf(downloadDir, beforeNames, maxMs = 90000) {
  const dir = path.resolve(downloadDir.replace(/^~/, os.homedir()));
  const started = Date.now();
  let lastSize = -1;
  let stableSince = 0;
  while (Date.now() - started < maxMs) {
    let entries = [];
    try { entries = fs.readdirSync(dir).filter((n) => /\.pdf$/i.test(n) && !beforeNames.has(n)); } catch (_) {}
    if (entries.length > 0) {
      // newest by mtime
      let best = null;
      for (const n of entries) {
        const st = fs.statSync(path.join(dir, n));
        if (!best || st.mtimeMs > best.mtimeMs) best = { name: n, size: st.size, mtimeMs: st.mtimeMs };
      }
      if (best.size > 0 && best.size === lastSize) {
        if (Date.now() - stableSince > 1500) return path.join(dir, best.name);
      } else {
        lastSize = best.size;
        stableSince = Date.now();
      }
    }
    await sleep(1000);
  }
  return null;
}

function checkPdf(headBytes, allowNonPdf) {
  const ascii = Buffer.from(headBytes || []).toString("ascii");
  return { signature: ascii, pdf: ascii.startsWith("%PDF"), acceptable: ascii.startsWith("%PDF") || allowNonPdf };
}

async function runFetchMode(proxy, target, plan, args) {
  const targetInfo = await proxyGet(proxy, "/info", { target }, 10000).catch(() => ({}));
  let origin = "";
  try { origin = new URL(targetInfo.url || "").origin; } catch (_) {}
  let url = plan.url;
  let fetchTarget = target;
  let openedTab = false;

  const crossOrigin = url && origin && (() => { try { return new URL(url).origin !== origin; } catch (_) { return false; } })();

  if (crossOrigin) {
    const created = await proxyPost(proxy, "/new", url, 60000);
    fetchTarget = created.targetId;
    openedTab = true;
    await waitForComplete(proxy, fetchTarget);
    url = null; // fetch the tab's own location
  }

  const meta = await pageFetchToWindow(proxy, fetchTarget, url, plan.method, plan.credentials);
  if (openedTab) { try { await proxyGet(proxy, "/close", { target: fetchTarget }, 10000); } catch (_) {} }

  if (!meta || !meta.ok) throw new Error(`fetch failed: ${JSON.stringify(meta)}`);
  const chk = checkPdf(meta.head, args.allowNonPdf);
  if (!chk.acceptable) throw new Error(`not a PDF (status=${meta.status}, ct=${meta.contentType}). Rerun with --allow-non-pdf if expected.`);
  const saved = await transferBytes(proxy, fetchTarget, Number(meta.size), args.out, args.chunkSize);
  return { saved, bytes: fs.statSync(saved).size, sourceUrl: meta.url, ...chk };
}

async function runNewtabFetchMode(proxy, target, plan, args) {
  if (!plan.clicked) throw new Error(`action did not click anything; cannot find a new tab`);
  const newTab = await findNewTab(proxy, plan.newTabHostContains);
  if (!newTab) throw new Error(`no new tab matching host "${plan.newTabHostContains}" appeared`);
  await waitForComplete(proxy, newTab);
  const info = await proxyGet(proxy, "/info", { target: newTab }, 10000).catch(() => ({}));
  const meta = await pageFetchToWindow(proxy, newTab, null, "GET", plan.credentials);
  try { await proxyGet(proxy, "/close", { target: newTab }, 10000); } catch (_) {}
  if (!meta || !meta.ok) throw new Error(`newtab fetch failed: ${JSON.stringify(meta)}`);
  const chk = checkPdf(meta.head, args.allowNonPdf);
  if (!chk.acceptable) throw new Error(`not a PDF from new tab (ct=${meta.contentType}).`);
  const saved = await transferBytes(proxy, newTab, Number(meta.size), args.out, args.chunkSize);
  return { saved, bytes: fs.statSync(saved).size, sourceUrl: info.url || meta.url, ...chk };
}

async function runPdfjsMode(proxy, target, plan, args) {
  const meta = await pdfjsToWindow(proxy, target, plan.iframeSelector);
  if (!meta || !meta.ok) throw new Error(`pdfjs read failed: ${JSON.stringify(meta)}`);
  const chk = checkPdf(meta.head, args.allowNonPdf);
  if (!chk.acceptable) throw new Error(`pdfjs bytes are not a PDF.`);
  const saved = await transferBytes(proxy, target, Number(meta.size), args.out, args.chunkSize);
  return { saved, bytes: fs.statSync(saved).size, sourceUrl: null, ...chk };
}

async function runClickDownloadMode(proxy, target, plan, args) {
  if (!plan.clicked) throw new Error(`action did not click a download button`);
  const dir = args.downloadDir || path.join(os.homedir(), "Downloads");
  let before = new Set();
  try { before = new Set(fs.readdirSync(dir.replace(/^~/, os.homedir())).filter((n) => /\.pdf$/i.test(n))); } catch (_) {}
  const file = await waitForNativePdf(dir, before);
  if (!file) throw new Error(`no new PDF appeared in ${dir} within timeout`);
  const finalPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.copyFileSync(file, finalPath);
  const chk = checkPdf(fs.readFileSync(finalPath).subarray(0, 8), args.allowNonPdf);
  return { saved: finalPath, bytes: fs.statSync(finalPath).size, sourceUrl: file, ...chk, movedFrom: file };
}

async function main() {
  const a = parseArgs(process.argv);
  if (a.help) { usage(); return; }
  if (a.list) { for (const x of actions.list()) console.log(`${x.name.padEnd(16)} ${x.description}`); return; }
  if (!a.out) throw new Error("--out is required");
  if (!a.target) throw new Error("--target is required");
  if (!a.publisher && !a.plan) throw new Error("provide --publisher <name> (discovery) or --plan <json>");

  const proxy = normalizeProxy(a.proxy);

  let plan;
  if (a.plan) {
    plan = JSON.parse(a.plan);
  } else {
    const action = actions.get(a.publisher);
    if (!action) {
      console.error(`unknown action "${a.publisher}". Available:`);
      for (const x of actions.list()) console.error(`  ${x.name}`);
      process.exit(2);
    }
    const js = action.build(parseKVPairs(a.args));
    const res = await proxyEval(proxy, a.target, js, 120000);
    plan = res && "value" in res ? res.value : res;
  }

  if (a.showPlan) console.log(JSON.stringify(plan));
  else console.error("plan: " + JSON.stringify(plan));

  if (plan && plan.onWrongSite) {
    throw new Error(`onWrongSite: current host is the wrong site for this publisher (e.g. SAGE on sagepub.com). Redirect to the correct mirror and retry.`);
  }

  const mode = plan.mode;
  let result;
  if (mode === "fetch") result = await runFetchMode(proxy, a.target, plan, a);
  else if (mode === "newtab-fetch") result = await runNewtabFetchMode(proxy, a.target, plan, a);
  else if (mode === "pdfjs") result = await runPdfjsMode(proxy, a.target, plan, a);
  else if (mode === "click-download") result = await runClickDownloadMode(proxy, a.target, plan, a);
  else throw new Error(`unknown plan mode "${mode}"`);

  console.log(JSON.stringify({ ok: true, publisher: plan.publisher, mode, ...result }, null, 2));
}

main().catch((e) => {
  console.error("get-pdf error: " + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
