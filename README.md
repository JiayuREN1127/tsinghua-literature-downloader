# Tsinghua Literature Downloader

通过已登录的清华图书馆/WebVPN Chrome 会话自动化下载学术 PDF。

Adapted from [zju-literature-downloader](https://github.com/baihe26/zju-literature-downloader) by [@baihe26](https://github.com/baihe26) (浙江大学版), re-engineered for Tsinghua University Library, 水木学术搜索, and institutional access pathways.

## Workflow

```
你的 Chrome (已登录清华) ← CDP 代理 ← AI Agent
         ↓
  水木学术搜索 / Alma resolver → 出版商页面 → 下载 PDF
         ↓
  [FlareSolverr, 可选] → 自动清除 Cloudflare JS Challenge
```

## Prerequisites

- Chrome 浏览器（已登录 水木学术搜索）
- Chrome 远程调试已启用
- Node.js 22+
- FlareSolverr（可选，用于自动清除 Cloudflare）

## Directory Structure (four versions, clearly isolated)

```
├── SKILL-v1/     ← 统一版（unified, per-paper download）           — legacy, frozen
├── SKILL-v2/     ← 分组版（grouped, per-publisher batch）          — legacy, frozen
├── SKILL-v3/     ← token-disciplined（probe + action libraries）   — legacy, frozen
├── SKILL-v3.1/   ← click-first（click-download primary strategy）  — legacy, frozen
├── SKILL-v3.2/   ← network-safe（网络安全硬规则 + 事件复盘）       — CANONICAL ✅
├── TEST/          ← 测试清单和实测报告
├── sync.sh        ← 同步当前 canonical 版本到各 AI 工具目录
└── README.md
```

## Version History

| Version | Tag | Directory | Key Feature | Status |
|---------|-----|-----------|-------------|--------|
| v1.0 | `v1.0` | `SKILL-v1/` | 统一版，逐篇独立下载；原始 HTML 进 context（高 token） | frozen |
| v2.0 | `v2.0` | `SKILL-v2/` | 分组版，按 publisher 批量下载 + FlareSolverr 预热 | frozen |
| v3.0 | `v3.0` | `SKILL-v3/` | Token Discipline 硬规则 + 探针库（token 降 1000×） | frozen |
| v3.1 | `v3.1` | `SKILL-v3.1/` | click-first 策略（5/8 用浏览器原生下载，成功率 7/8） | frozen |
| v3.2 | `v3.2` | `SKILL-v3.2/` | **网络安全硬规则**（禁止 `0.0.0.0` 绑定 / 代理外泄） | **canonical** |

### v3.2 Changelog（incident-driven）

**2026-07-26 安全事件**：v3.1 运行时，AI agent 为让 Docker 容器访问本地 Clash 代理，自行执行 `socat TCP-LISTEN:17897,bind=0.0.0.0 TCP:127.0.0.1:7897`，将代理暴露到整个校园网，触发学校"私设代理"安全告警。

**v3.2 修复**：在 `SKILL.md` 中新增 **Network Security Guardrails** 硬规则段（5 条规则），禁止任何 `0.0.0.0` 绑定与代理外转，明确 FlareSolverr 只走非容器化 `localhost:8191` 安装路径，并要求后台网络进程必须跟踪 PID 会后清理。

### v1 → v2 → v3 → v3.1 Evolution

| Dimension | v1.0 | v2.0 | v3.0 | v3.1 |
|-----------|------|------|------|------|
| **Page reading** | Raw `innerHTML`/`innerText` (100-500KB/page) | Same as v1 | Probes ~200B/call, DOM filtered server-side | Same as v3 |
| **Token per paper** | ~250K (reads 2-3 raw HTML pages) | ~200K (FlareSolverr reduces re-reads) | ~150 (compact probe verdicts) | ~300 (v3 probes + 3-4 click interactions) |
| **Download method** | All `fetch()` chunk transfer | All `fetch()` chunk transfer | All `fetch()` via `get-pdf.mjs` | **5/8 click** native + 2/8 fetch + 1/8 human |
| **Download speed** | Slow (chunk transfer, 4MB ≈ 20s) | Slow | Slow | **Fast** (click native stream, 4MB ≈ 3s) |
| **Success rate** | 2/8 | 3/8 (+Wiley via FlareSolverr) | 2/8 (probes ≠ download fix) | **7/8** |

## Quick Start

```bash
# Canonical version (recommended)
cd SKILL-v3.2 && node start.js

# Or any frozen legacy version
cd SKILL-v3.1 && node start.js
```

See each `SKILL-vX/` directory for its own `README.md` and `SKILL.md`.

## Sync to AI Tools

```bash
./sync.sh          # dry-run preview
./sync.sh --apply  # actually copy SKILL-v3.2 to default skill paths
```

`sync.sh` installs `SKILL-v3.2/` (canonical) to the default skill path (e.g. `~/.claude/skills/tsinghua-literature-downloader`). Legacy versions can be synced manually.

## GitHub Releases

See [Releases](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases) for tagged versions with changelogs:

- [`v3.2`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.2) — network-safe hard rules (current)
- [`v3.1`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.1) — click-first download strategy
- [`v3.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.0) — token-disciplined probe/action libraries
- [`v2.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v2.0) — grouped download + FlareSolverr warmup
- [`v1.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v1.0) — original unified skill
