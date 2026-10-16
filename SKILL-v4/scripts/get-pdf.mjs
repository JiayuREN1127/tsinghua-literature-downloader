#!/usr/bin/env node
// v4: one fixed action, one cumulative budget, transfer before tab cleanup.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as actions from "../actions/index.mjs";
import { parseKVPairs } from "./cdp-client.mjs";

function parse(argv) {
  const a = { args: [], timeout: 120, chunkSize: 262144, proxy: "http://127.0.0.1:3456" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (["--help", "-h", "--list", "--show-plan", "--allow-non-pdf"].includes(k)) a[k.replace(/^--?/, "")] = true;
    else if (k === "--arg") a.args.push(argv[++i]);
    else if (["--target", "--publisher", "--plan", "--out", "--proxy", "--download-dir", "--timeout", "--chunk-size"].includes(k)) a[k.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${k}`);
  }
  a.timeout = Number(a.timeout);
  a.chunkSize = Number(a["chunk-size"] || a.chunkSize);
  if (!(a.timeout > 0 && a.timeout <= 120)) throw new Error("--timeout must be >0 and <=120 seconds (remaining attempt budget)");
  if (!Number.isInteger(a.chunkSize) || a.chunkSize < 1024) throw new Error("invalid chunk size");
  return a;
}

async function main() {
  const a = parse(process.argv);
  if (a.help || a.h) {
    console.log("get-pdf.mjs --target <tab> --publisher <name> [--arg k=v] --out <paper.pdf> [--timeout 120]\n--plan '<json>' may replace --publisher. --list lists fixed actions. --timeout is remaining cumulative time, never a fresh retry allowance."); return;
  }
  if (a.list) { for (const x of actions.list()) console.log(`${x.name}\t${x.description}`); return; }
  if (!a.target || !a.out || (!a.publisher && !a.plan)) throw new Error("target, out and publisher/plan required");
  const out = path.resolve(a.out), partial = out + ".partial";
  if (fs.existsSync(out) || fs.existsSync(partial)) throw new Error("output/partial already exists; choose a new path");
  const deadline = Date.now() + a.timeout * 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("attempt_timeout_120s: hand off to user")), a.timeout * 1000);
  const owned = new Set(), touched = new Set([a.target]);
  let fd, ownsPartial = false;
  const left = () => {
    const ms = deadline - Date.now();
    if (ms <= 0 || controller.signal.aborted) throw new Error("attempt_timeout: stop group and hand off to user");
    return ms;
  };
  const pause = async (ms) => {
    await new Promise((resolve, reject) => {
      const done = () => { clearTimeout(id); controller.signal.removeEventListener("abort", abort); resolve(); };
      const abort = () => { clearTimeout(id); controller.signal.removeEventListener("abort", abort); reject(new Error("attempt_timeout: hand off to user")); };
      const id = setTimeout(done, Math.min(ms, left()));
      controller.signal.addEventListener("abort", abort, { once: true });
    }); left();
  };
  async function rpc(endpoint, body) {
    left();
    const r = await fetch(new URL(endpoint, a.proxy), { method: body === undefined ? "GET" : "POST", body, signal: controller.signal });
    const v = await r.json(); left();
    if (!r.ok || v.error) throw new Error(`proxy ${r.status}: ${String(v.error || "request failed").slice(0,120)}`);
    return v;
  }
  const ev = async (t, js) => { touched.add(t); return (await rpc("/eval?target=" + encodeURIComponent(t), js)).value; };
  const tabs = async () => { const x = await rpc("/targets"); return Array.isArray(x) ? x : x.targets || []; };
  function snapshot(dir) {
    try { return new Set(fs.readdirSync(dir).filter(n => /\.pdf$/i.test(n))); } catch { return new Set(); }
  }
  try {
    // Snapshot before actions can click; capture pre-existing CDN tabs too.
    const dir = path.resolve((a["download-dir"] || path.join(os.homedir(), "Downloads")).replace(/^~(?=\/|$)/, os.homedir()));
    const before = snapshot(dir);
    const beforeTabs = new Set((await tabs()).map(x => x.targetId || x.id));
    let plan;
    if (a.plan) plan = JSON.parse(a.plan);
    else {
      const action = actions.get(a.publisher);
      if (!action) throw new Error("unknown publisher: " + a.publisher);
      plan = await ev(a.target, action.build(parseKVPairs(a.args)));
    }
    if (!plan || plan.found === false || plan.onWrongSite) throw new Error("strategy_target_not_found: inspect within remaining budget");
    if (a["show-plan"]) console.error(JSON.stringify({ publisher: plan.publisher, mode: plan.mode, found: plan.found }));
    let source = a.target, bytes;
    if (plan.mode === "navigate-download" || plan.mode === "click-download") {
      if (plan.mode === "navigate-download") {
        if (!plan.url) throw new Error("missing direct URL");
        const created = await rpc("/new", plan.url);
        if (created.targetId) owned.add(created.targetId);
      } else if (!plan.clicked) throw new Error("download button not clicked");
      let previous = "", stable = 0;
      for (;;) {
        left();
        const candidates = [...snapshot(dir)].filter(n => !before.has(n)).map(n => ({ p: path.join(dir,n), s: fs.statSync(path.join(dir,n)) })).sort((x,y) => y.s.mtimeMs-x.s.mtimeMs);
        const best = candidates[0];
        if (best) {
          const key = `${best.p}:${best.s.size}`;
          if (key === previous && best.s.size > 0 && ++stable >= 1) { bytes = fs.readFileSync(best.p); break; }
          previous = key; stable = 0;
        }
        await pause(750);
      }
    } else {
      if (plan.mode === "newtab-fetch") {
        if (!plan.clicked) throw new Error("View PDF was not clicked");
        for (;;) {
          const matches = (await tabs()).filter(x => !beforeTabs.has(x.targetId || x.id) && (x.url || "").includes(plan.newTabHostContains || "sciencedirectassets"));
          if (matches.length > 1) throw new Error("ambiguous new PDF tabs");
          if (matches.length === 1) { source = matches[0].targetId || matches[0].id; owned.add(source); break; }
          await pause(500);
        }
        while ((await rpc("/info?target="+encodeURIComponent(source))).ready !== "complete") await pause(500);
      }
      let meta;
      if (plan.mode === "pdfjs") {
        meta = await ev(source, `(async()=>{const w=document.querySelector(${JSON.stringify(plan.iframeSelector || "iframe")})?.contentWindow;const d=w?.PDFViewerApplication?.pdfDocument;if(!d)return {ok:false};window.__getPdfBytes=await d.getData();return {ok:true,size:window.__getPdfBytes.length}})()`);
      } else if (["fetch", "newtab-fetch"].includes(plan.mode)) {
        // In-page cross-origin fetch is intentional for EBSCO credentials:omit.
        const urlExpr = plan.mode === "newtab-fetch" ? "location.href" : JSON.stringify(plan.url);
        if (plan.mode === "fetch" && !plan.url) throw new Error("missing fetch URL");
        meta = await ev(source, `(async()=>{window.__thuPdfAbort=new AbortController();const timer=setTimeout(()=>window.__thuPdfAbort.abort(),${Math.max(1, Math.floor(left()-50))});try{const r=await fetch(${urlExpr},{method:${JSON.stringify(plan.method || "GET")},credentials:${JSON.stringify(plan.credentials || "include")},signal:window.__thuPdfAbort.signal});window.__getPdfBytes=new Uint8Array(await r.arrayBuffer());return {ok:r.ok,status:r.status,type:r.headers.get("content-type"),size:window.__getPdfBytes.length,head:Array.from(window.__getPdfBytes.slice(0,8))}}finally{clearTimeout(timer)}})()`);
      } else throw new Error("unknown mode: " + plan.mode);
      if (!meta?.ok) throw new Error(`fetch_failed: status=${meta?.status || 0}`);
      if (meta.head && !Buffer.from(meta.head).toString("ascii").startsWith("%PDF") && !a["allow-non-pdf"]) throw new Error(`not_pdf_response: status=${meta.status}, type=${meta.type}`);
      if (!Number.isSafeInteger(meta.size) || meta.size <= 0) throw new Error("empty or invalid PDF size");
      const chunks = [];
      for (let start = 0; start < meta.size; start += a.chunkSize) {
        const chunk = await ev(source, `(()=>{const a=window.__getPdfBytes.subarray(${start},${Math.min(start+a.chunkSize,meta.size)});let s="";for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s)})()`);
        chunks.push(Buffer.from(chunk,"base64"));
      }
      bytes = Buffer.concat(chunks);
      if (bytes.length !== meta.size) throw new Error("truncated_transfer");
    }
    left();
    if (!bytes.subarray(0,4).equals(Buffer.from("%PDF")) && !a["allow-non-pdf"]) throw new Error("not_pdf_response");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fd = fs.openSync(partial, "wx"); ownsPartial = true;
    fs.writeFileSync(fd,bytes); fs.closeSync(fd); fd = undefined;
    left(); fs.renameSync(partial,out); ownsPartial = false;
    console.log(JSON.stringify({ ok:true,publisher:plan.publisher,mode:plan.mode,bytes:bytes.length,saved:out,attribution:"provisional; reconcile DOI/title after batch" }));
  } finally {
    clearTimeout(timer);
    if (fd !== undefined) fs.closeSync(fd);
    if (ownsPartial) fs.rmSync(partial,{force:true});
    // Cleanup uses a separate short timeout even after the attempt budget ends.
    const cleanup = [];
    for (const t of touched) cleanup.push(fetch(new URL("/eval?target="+encodeURIComponent(t),a.proxy),{method:"POST",body:"(()=>{window.__thuPdfAbort?.abort();delete window.__getPdfBytes;return true})()",signal:AbortSignal.timeout(1500)}).catch(()=>{}));
    for (const t of owned) cleanup.push(fetch(new URL("/close?target="+encodeURIComponent(t),a.proxy),{signal:AbortSignal.timeout(1500)}).catch(()=>{}));
    await Promise.allSettled(cleanup);
  }
}
main().catch(e=>{console.error("get-pdf: "+e.message);process.exitCode=1;});
