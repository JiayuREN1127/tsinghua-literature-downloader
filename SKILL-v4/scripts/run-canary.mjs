#!/usr/bin/env node
// Canary runner (row 6). Runs each probe against a known-good paper resolved
// through the Tsinghua Alma resolver, and asserts the probe returns the expected
// field. Used to (a) validate probes on first live run and (b) catch publisher
// UI drift that would silently break downloads.
//
// This needs the CDP proxy running (node start.js) and a Chrome session that is
// logged into Tsinghua. It opens one tab per canary, runs the probe, and closes
// the tab. It never downloads a PDF — it only validates that the probe still
// extracts the right signals.
//
// Usage:
//   node scripts/run-canary.mjs                  # run all canaries
//   node scripts/run-canary.mjs --only sciencedirect,wiley
//   node scripts/run-canary.mjs --proxy http://127.0.0.1:3456
//   node scripts/run-canary.mjs --mark           # print hints to set last_verified in lessons.md
//   node scripts/run-canary.mjs --list           # list canaries, run nothing
//
// Output is compact: one line per canary (PASS/FAIL + the deciding field).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { proxyGet, proxyPost, proxyEval, sleep, normalizeProxy, parseKVPairs } from "./cdp-client.mjs";
import * as reg from "../probes/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CANARIES = path.join(ROOT, "..", "canaries.tsv");
const ALMA = (doi) =>
  `https://tsinghua.alma.exlibrisgroup.com.cn/view/uresolver/86THU_INST/openurl?rft_id=info:doi/${encodeURIComponent(
    doi
  )}&svc_dat=single_service`;

function usage() {
  console.log(`Usage:
  node scripts/run-canary.mjs                  # run all canaries
  node scripts/run-canary.mjs --only <a,b,...> # run a subset by publisher
  node scripts/run-canary.mjs --list           # list canaries, run nothing
  node scripts/run-canary.mjs --mark           # print hints to update lessons.md last_verified
  node scripts/run-canary.mjs --proxy <url>

Requires the CDP proxy (node start.js) and a Tsinghua-authenticated Chrome.`);
}

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--help" || t === "-h") a.help = true;
    else if (t === "--only") a.only = argv[++i].split(",").map((s) => s.trim());
    else if (t === "--list") a.list = true;
    else if (t === "--mark") a.mark = true;
    else if (t === "--proxy") a.proxy = argv[++i];
    else throw new Error(`Unknown argument: ${t}`);
  }
  return a;
}

function loadCanaries() {
  const rows = fs.readFileSync(CANARIES, "utf8").split(/\r?\n/);
  const out = [];
  for (const line of rows) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const cols = s.split("\t");
    if (cols.length < 6) continue;
    const [publisher, probe, doi, args, expect_field, expect_contains, ...rest] = cols;
    out.push({
      publisher,
      probe,
      doi,
      args: args || "",
      expectField: expect_field,
      expectContains: (expect_contains || "").trim(),
      notes: (rest[0] || "").trim(),
    });
  }
  return out;
}

// Resolve a dotted path + optional comparator on the probe result.
// Supported expect_field forms:
//   "field"                         -> field must be truthy / non-empty
//   "field#len>0"                   -> array length > 0
//   "stage"                         -> equality with expectContains
function getFieldValue(value, spec) {
  let [name, op] = spec.split("#");
  let v = value;
  for (const part of name.split(".")) {
    if (v == null) return { present: false };
    v = v[part];
  }
  return { value: v, op: op || null };
}

function assertCanary(value, c) {
  const { value: v, op } = getFieldValue(value, c.expectField);
  if (op && op.startsWith("len")) {
    const m = /^len([<>=!]+)(\d+)$/.exec(op);
    if (!m) return { ok: false, detail: `bad op ${op}` };
    const len = Array.isArray(v) ? v.length : v == null ? 0 : 1;
    const cmp = m[1];
    const n = Number(m[2]);
    const ok = cmp === ">" ? len > n : cmp === ">=" ? len >= n : cmp === "<" ? len < n : cmp === "==" ? len === n : false;
    return { ok, detail: `${c.expectField} len=${len}` };
  }
  const want = c.expectContains;
  if (want === "*") return { ok: v !== null && v !== undefined && v !== "", detail: `${c.expectField}=${JSON.stringify(v).slice(0, 60)}` };
  if (want === "true") return { ok: v === true, detail: `${c.expectField}=${v}` };
  if (want === "false") return { ok: v === false, detail: `${c.expectField}=${v}` };
  if (/^[0-9]+$/.test(want)) return { ok: v === Number(want), detail: `${c.expectField}=${v}` };
  if (want.startsWith(">")) return { ok: typeof v === "number" && v > Number(want.slice(1)), detail: `${c.expectField}=${v}` };
  const present = String(v ?? "").includes(want);
  return { ok: present, detail: `${c.expectField} includes "${want}"? ${present} (got ${JSON.stringify(v).slice(0, 60)})` };
}

async function healthCheck(proxy) {
  try {
    const h = await proxyGet(proxy, "/health", {}, 5000);
    return h && h.ok !== false;
  } catch (_) {
    return false;
  }
}

async function runOne(proxy, c) {
  const probe = reg.get(c.probe);
  if (!probe) return { ok: false, detail: `unknown probe "${c.probe}"` };

  const url = ALMA(c.doi);
  let target = null;
  try {
    const created = await proxyPost(proxy, "/new", url, 60000);
    target = created && created.targetId;
    if (!target) return { ok: false, detail: "/new returned no targetId" };
  } catch (e) {
    return { ok: false, detail: `open failed: ${e.message}` };
  }

  // Primo/Alma SPA settle time. Probes are defensive, so a fixed wait is enough.
  await sleep(8000);

  let value = null;
  try {
    const js = probe.build(parseKVPairs(c.args ? c.args.split(";") : []));
    const res = await proxyEval(proxy, target, js, 120000);
    value = res && "value" in res ? res.value : res;
  } catch (e) {
    try { await proxyGet(proxy, "/close", { target }, 10000); } catch (_) {}
    return { ok: false, detail: `probe threw: ${e.message}` };
  }

  try { await proxyGet(proxy, "/close", { target }, 10000); } catch (_) {}

  const verdict = assertCanary(value, c);
  return { ok: verdict.ok, detail: verdict.detail, result: value };
}

async function main() {
  const a = parseArgs(process.argv);
  if (a.help) {
    usage();
    return;
  }

  const canaries = loadCanaries();
  if (a.list) {
    for (const c of canaries) console.log(`${c.publisher.padEnd(16)} ${c.probe.padEnd(16)} ${c.doi}`);
    return;
  }

  const selected = a.only ? canaries.filter((c) => a.only.includes(c.publisher) || a.only.includes(c.probe)) : canaries;

  if (a.mark) {
    console.log("# To mark probes verified in lessons.md after a green canary run,");
    console.log("# update the 'last_verified' column in the Probe 交叉引用 table, e.g.:");
    console.log("#   sed -i '' 's/| `sciencedirect` | .* | pending |/| `sciencedirect` | ... | 2026-07-26 |/' lessons.md");
    console.log("# (macOS sed; on Linux drop the empty '' arg.)");
    return;
  }

  const proxy = normalizeProxy(a.proxy);
  if (!(await healthCheck(proxy))) {
    console.error(`CDP proxy not healthy at ${proxy}. Run: cd ${ROOT}/.. && node start.js`);
    process.exit(1);
  }

  const results = [];
  for (const c of selected) {
    process.stdout.write(`${c.publisher.padEnd(16)} `);
    try {
      const r = await runOne(proxy, c);
      results.push({ publisher: c.publisher, probe: c.probe, ...r });
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.detail}`);
    } catch (e) {
      results.push({ publisher: c.publisher, probe: c.probe, ok: false, detail: e.message });
      console.log("ERROR " + e.message);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} canaries passed.`);
  if (passed === results.length && results.length > 0) {
    console.log("All green — run `node scripts/run-canary.mjs --mark` for the lessons.md update hint.");
  } else {
    console.log("Failures indicate either (a) a stale probe (publisher UI changed) or (b) the canary DOI needs replacing.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("canary error: " + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
