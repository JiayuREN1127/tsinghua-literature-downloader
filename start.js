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
  print("║       清华大学文献下载工具 v1.0                  ║");
  print("║       Tsinghua Literature Downloader            ║");
  print("╚══════════════════════════════════════════════════╝");
  print("");

  // ── 1. 检查 Node.js ──
  print("[1/3] 检查 Node.js ...");
  const nodeVer = process.version.slice(1);
  const major = Number(nodeVer.split(".")[0]);
  if (major < 22) {
    print("  ❌ 需要 Node.js 22+，当前版本: " + process.version);
    print("  → 下载: https://nodejs.org/  (推荐 LTS 版本)");
    print("  → macOS: brew install node");
    process.exit(1);
  }
  print("  ✓ Node.js " + process.version);
  print("");

  // ── 2. 前置条件确认 ──
  print("[2/3] 前置条件确认 ...");
  print("  请确认以下条件已满足：");
  print("  (1) Chrome 浏览器已安装");
  print("  (2) 已登录清华 WebVPN (https://webvpn.tsinghua.edu.cn/)");
  print("      或水木学术搜索 (https://tsinghua-primo.hosted.exlibrisgroup.com.cn/)");
  print("  (3) 已启用 Chrome 远程调试：");
  print("      地址栏输入 chrome://inspect/#remote-debugging");
  print("      → 勾选 \"Allow remote debugging for this browser instance\"");
  print("");

  const ans = await ask("  以上条件是否都已满足？(y/n): ");
  if (ans.toLowerCase() !== "y" && ans.toLowerCase() !== "yes") {
    print("  ⏳ 请先完成以上步骤，然后重新运行 node start.js");
    process.exit(0);
  }
  print("");

  // ── 3. 启动 CDP 代理 ──
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
        print("✅ 一切就绪！CDP 代理运行在 http://127.0.0.1:3456");
        print("");
        print("📖 现在可以对 Claude 说：");
        print('   "请使用 tsinghua-literature-downloader 下载以下 DOI，');
        print('    保存到 ~/papers/my-review/："');
        print("    <DOI 列表>");
        print("");
        print("   或手动使用脚本：");
        print("    node scripts/cdp_open_url.mjs --url <URL> --wait");
        print("    node scripts/browser_pdf_downloader.mjs --target <id> --dir downloads/ --close");
        print("");
        print("   按 Ctrl+C 停止代理");
        resolve();
      } else {
        print("");
        print("❌ CDP 代理异常退出 (code=" + code + ")");
        print("  可能原因：Chrome 未运行、远程调试未启用、或端口 3456 被占用");
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