#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CHECK_DEPS = path.join(ROOT, "web-access", "scripts", "check-deps.mjs");

function print(m) { process.stdout.write(m + "\n"); }
function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  print("");
  print("╔══════════════════════════════════════════════════╗");
  print("║       清华大学文献下载工具（分组版）              ║");
  print("║       Tsinghua Literature Downloader (Grouped)  ║");
  print("╚══════════════════════════════════════════════════╝");
  print("");

  print("[1/3] 检查 Node.js ...");
  const nodeVer = process.version.slice(1);
  const major = Number(nodeVer.split(".")[0]);
  if (major < 22) {
    print("  ❌ 需要 Node.js 22+，当前版本: " + process.version);
    print("  → https://nodejs.org/");
    process.exit(1);
  }
  print("  ✓ Node.js " + process.version);
  print("");

  print("[2/3] 前置条件确认 ...");
  print("  请确认：");
  print("  (1) Chrome / Edge 已安装");
  print("  (2) 已登录清华 WebVPN 或水木学术搜索");
  print("  (3) 已启用 Chrome 远程调试（chrome://inspect/#remote-debugging）");
  print("");

  const ans = await ask("  是否满足？(y/n): ");
  if (ans.toLowerCase() !== "y" && ans.toLowerCase() !== "yes") {
    print("  完成后重新运行 node start.js");
    process.exit(0);
  }
  print("");

  print("[3/3] 启动 CDP 代理 ...");
  print("");

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [CHECK_DEPS, "--browser", "chrome"], {
      cwd: ROOT,
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env, CDP_PROXY_PORT: "3456" },
    });

    proc.on("close", (code) => {
      if (code === 0) {
        print("");
        print("✅ 就绪！CDP 代理运行在 http://127.0.0.1:3456");
        print("");
        print("📖 现在向 AI 提供 DOI 列表，要求按分组批量下载");
        print("   按 Ctrl+C 停止");
        resolve();
      } else {
        print("");
        print("❌ CDP 代理异常退出 (code=" + code + ")");
        reject(new Error("exit code " + code));
      }
    });

    proc.on("error", (e) => {
      print("❌ 启动失败: " + e.message);
      reject(e);
    });
  });
}

main().catch((e) => {
  print("");
  print("错误: " + e.message);
  process.exit(1);
});
