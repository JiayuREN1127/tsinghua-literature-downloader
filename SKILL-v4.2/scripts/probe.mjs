#!/usr/bin/env node
// Probe runner (v3 token-disciplined layer).
//
// Loads a named probe from ../probes/, ships its JS payload to the CDP proxy
// `/eval`, and prints ONLY the compact JSON verdict. The probe JS text never
// enters the agent's context — only the small returned object does.
//
// Usage:
//   node scripts/probe.mjs --target <id> --name <probeName> [--proxy URL] [--arg key=val ...]
//   node scripts/probe.mjs --list
//   node scripts/probe.mjs --help
//
// Probes live in probes/*.mjs and each exports:
//   { name, description, build: (args: object) => string }
// where build() returns a JS expression (typically an IIFE) that runs in the
// page and returns a compact object (<= ~500 bytes after JSON.stringify).

import { fileURLToPath } from "node:url";
import path from "node:path";
import { proxyEval, normalizeProxy, parseKVPairs } from "./cdp-client.mjs";
import * as registry from "../probes/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function usage() {
  console.log(`Usage:
  node scripts/probe.mjs --target <id> --name <probeName> [--proxy URL] [--arg key=val ...]
  node scripts/probe.mjs --list
  node scripts/probe.mjs --help

Options:
  --target <id>     Chrome tab/target id (required to run a probe)
  --name <name>     Probe name (see --list). Required to run.
  --proxy <url>     CDP proxy URL, default http://127.0.0.1:3456
  --arg k=v         Probe argument, repeatable (e.g. --arg pii=S0001879110002083)
  --list            List all available probes and exit
  --help, -h        Show this help

The probe JS executes in the authenticated Chrome tab and returns a compact
verdict. This script does not print page HTML, innerText, or the payload JS.`);
}

function parseArgs(argv) {
  const a = { proxy: null, args: [] };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--help" || t === "-h") a.help = true;
    else if (t === "--list") a.list = true;
    else if (t === "--target") a.target = argv[++i];
    else if (t === "--name") a.name = argv[++i];
    else if (t === "--proxy") a.proxy = argv[++i];
    else if (t === "--arg") a.args.push(argv[++i]);
    else throw new Error(`Unknown argument: ${t}`);
  }
  return a;
}

// Hard guard: never emit more than this many chars to stdout, so a buggy probe
// cannot blow up the agent's context. 5000 chars ~ 1.5k tokens worst case.
const MAX_OUTPUT_CHARS = 5000;

function clamp(s) {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return (
    s.slice(0, MAX_OUTPUT_CHARS) +
    `\n...[probe.mjs] output truncated at ${MAX_OUTPUT_CHARS} chars; probe returned too much, check the probe module.`
  );
}

async function main() {
  const a = parseArgs(process.argv);
  if (a.help) {
    usage();
    return;
  }

  if (a.list) {
    const names = registry.list();
    for (const p of names) {
      console.log(`${p.name.padEnd(18)} ${p.description}`);
    }
    return;
  }

  if (!a.target) {
    console.error("error: --target is required to run a probe (use --list to enumerate probes)");
    process.exit(2);
  }
  if (!a.name) {
    console.error("error: --name is required (use --list to enumerate probes)");
    process.exit(2);
  }

  const probe = registry.get(a.name);
  if (!probe) {
    console.error(`error: unknown probe "${a.name}". Available:`);
    for (const p of registry.list()) console.error(`  ${p.name}`);
    process.exit(2);
  }

  const args = parseKVPairs(a.args);
  const js = probe.build(args);

  const proxy = normalizeProxy(a.proxy);
  const result = await proxyEval(proxy, a.target, js, 120000);

  // /eval returns { value: <whatever the JS returned> }
  const value = result && "value" in result ? result.value : result;

  // Always emit a single compact JSON line (or object). Never raw page content.
  const out = typeof value === "string" ? value : JSON.stringify(value);
  process.stdout.write(clamp(out) + "\n");
}

main().catch((e) => {
  console.error("probe error: " + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
