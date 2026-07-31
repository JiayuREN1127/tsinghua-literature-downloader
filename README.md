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

## Directory Structure (versions clearly isolated)

```
├── SKILL-v1/     ← 统一版（unified, per-paper download）           — legacy, frozen
├── SKILL-v2/     ← 分组版（grouped, per-publisher batch）          — legacy, frozen
├── SKILL-v3/     ← token-disciplined（probe + action libraries）   — legacy, frozen
├── SKILL-v3.1/   ← click-first（click-download primary strategy）  — legacy, frozen
├── SKILL-v3.2/   ← network-safe（网络安全硬规则 + 事件复盘）       — legacy, frozen
├── SKILL-v3.3/   ← strategy-hardcoded（写死策略 + fail-fast 哨兵） — CANONICAL ✅
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
| v3.2 | `v3.2` | `SKILL-v3.2/` | **网络安全硬规则**（禁止 `0.0.0.0` 绑定 / 代理外泄） | frozen |
| v3.3 | `v3.3` | `SKILL-v3.3/` | **写死单策略无 fallback + 分组 fail-fast 哨兵 + `strategies.tsv` 清单** | **canonical** |

### v3.2 Changelog（incident-driven）

**2026-07-26 安全事件**：v3.1 运行时，AI agent 为让 Docker 容器访问本地 Clash 代理，自行执行 `socat TCP-LISTEN:17897,bind=0.0.0.0 TCP:127.0.0.1:7897`，将代理暴露到整个校园网，触发学校"私设代理"安全告警。

**v3.2 修复**：在 `SKILL.md` 中新增 **Network Security Guardrails** 硬规则段（5 条规则），禁止任何 `0.0.0.0` 绑定与代理外转。FlareSolverr 安装澄清为：Docker 是推荐的跨架构路径（含 Apple Silicon），但端口映射必须 `-p 127.0.0.1:8191:8191`（上游 README 的裸 `-p 8191:8191` 默认 `0.0.0.0`，本 skill 禁用）；容器联网问题用 `host.docker.internal` / `--dns` 解决，绝不走 `socat` `0.0.0.0` 桥接。规则全部使用占位符（`<proxy-port>`、`<resolver>`、`host.docker.internal`），不写死任何 IP/端口，便于合作者复用。

### v3.3 Changelog（strategy-hardcoded）

**动机**：v3.2 的 click-first + fetch fallback 在策略失效时浪费 token 反复试错。同一数据库的 PDF 获取与用户验证逻辑几乎不变，完全可以写死。

**v3.3 改进**：
- 每库写死**单一**下载策略（fetch / click-download / navigate-download / click-human-assisted），**无 click↔fetch fallback**。策略坏了由 agent 现场改 action 文件 + 标 `updated_at`，不静默换方法。
- 新增 **fail-fast 哨兵**：每库列表第一篇必须走通策略；走不通即**整库中断**交用户决策（附 失败类型 + 哪篇 + 建议修哪行），不浪费 token 批量试错。
- **分组下载成为正典流程**（不再是可选项）：列表 → 按库分类（`journal_database_mapping.md`）→ 逐库预热 → 哨兵 → 批量。
- 新增 `strategies.tsv` 清单统一管理策略新鲜度（库 / 子类型 / 策略 / `last_tested` / `updated_at`）。
- per-publisher 访问特性（CAPTCHA / 镜像 / 最稳源）内联进 `SKILL.md` 策略段，不再放 side file。
- **SAGE 写死 `cnpereading.com` 国内镜像**（不用 `journals.sagepub.com`）。
- 继承 v3.2 网络安全硬规则、v3 token 纪律探针库、FlareSolverr（安全绑定）。

### 下载策略对比（v3.3 当前 · 四种策略）

| 维度          | fetch()                                                                     | click-download                                  | navigate-download                                          | click-human-assisted                     |
| ----------- | --------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| Agent token | 最省 — 1 次 `get-pdf.mjs` 调用，分块在 Node 内完成，agent 只看结果                           | 稍多 — 找按钮 + 点击 + 检查 `~/Downloads` + mv，3-4 次紧凑交互 | 较省 — 1 次 CDP `/navigate` 到 pdfdirect URL + 检查 + mv，2-3 次交互 | 最多 — 需等人工解 CAPTCHA，agent 反复检查页面状态 + 多次交互 |
| 下载速度        | 慢 — `fetch`→arrayBuffer→chunk 逐个 CDP round-trip（4MB ≈ 10-30s）               | 快 — 浏览器原生流式直写磁盘（4MB ≈ 2-5s）                     | 快 — 导航触发原生下载直写磁盘（4MB ≈ 2-5s）                               | 受限于人工 — CAPTCHA 解后 click 原生下载快，但等人是瓶颈    |
| 支持数据库       | SAGE、T&F、Annual Reviews、IEEE、Wiley-OA（4 库 / 10）                             | JSTOR、ProQuest、EBSCO、Nature（4 库 / 10）           | Wiley-订阅（1 库 / 10）                                         | ScienceDirect（1 库 / 10）                  |
| 失败成本        | v3.3 写死后低 — 仅用于确实返回 `application/pdf` 的库；误用则高（T&C / Cloudflare / viewer 拦截） | 低 — 模拟人类操作，首次即成功，无诊断开销                          | 低 — 浏览器处理 cookie / Cloudflare，导航即下载                        | 中 — CAPTCHA 无法自动化，但解后 click 可靠           |
### v1 → v2 → v3 → v3.1 → v3.2 → v3.3 版本演进

| 维度    | v1（原始）                              | v2（+FlareSolverr）         | v3（token-disciplined）         | v3.1（click-first）              | v3.2（network-safe）             | v3.3（strategy-hardcoded）                                                             |
| ----- | ----------------------------------- | ------------------------- | ----------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------ |
| 页面读取  | 原始 innerHTML/innerText（100-500KB/页） | 同 v1                      | 探针 ~200B/次，DOM 服务端过滤          | 同 v3                           | 同 v3                           | 同 v3，探针优化                                                                            |
| Token | ~250K                               | ~200K                     | ~150                          | ~300                           | ~300                           | ~300（哨兵首篇验证后批量无 re-probe，批量均摊更省）                                                     |
| 下载方式  | 全部 fetch() 分块                       | 全部 fetch() 分块             | 全部 fetch() 分块                 | 5/8 click + 2/8 fetch + 1/8 人工 | 同 v3.1                         | **写死单策略无 fallback**：<br>4 库 fetch + 4 库 click-download + 1 库 navigate + 1 库 click-人工 |
| 下载速度  | 慢（分块，4MB ≈ 20s）                     | 慢（同 v1）                   | 慢（同 v1）                       | 快（click 原生流，4MB ≈ 3s）          | 同 v3.1                         | 同 v3.1（多数走原生；仅 fetch 库分块）                                                            |
| 成功率   | 2/8                                 | 3/8（+Wiley）               | 2/8（探针改善诊断，fetch 仍 6/8 失败）    | 7/8                            | 7/8                            | 待实测（目标 ≥ 7/8，哨兵消除批量浪费）                                                               |
| 核心改进  | —                                   | FlareSolverr 解 Cloudflare | 探针库 + Token 纪律（token 降 1000×） | click-first（2/8→7/8，速度 3-10×）  | 网络安全硬规则（禁 `0.0.0.0` 绑定 / 代理外泄） | 写死单策略 + 分组 fail-fast 哨兵 + `strategies.tsv` 清单                                        |

## Quick Start

```bash
# Canonical version (recommended)
cd SKILL-v3.3 && node start.js

# Or any frozen legacy version
cd SKILL-v3.2 && node start.js
```

See each `SKILL-vX/` directory for its own `README.md` and `SKILL.md`.

## Sync to AI Tools

```bash
./sync.sh          # dry-run preview
./sync.sh --apply  # actually copy SKILL-v3.3 to default skill paths
```

`sync.sh` installs `SKILL-v3.3/` (canonical) to the default skill path (e.g. `~/.claude/skills/tsinghua-literature-downloader`). Legacy versions can be synced manually.

## GitHub Releases

See [Releases](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases) for tagged versions with changelogs:

- [`v3.3`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.3) — strategy-hardcoded + fail-fast canary (current)
- [`v3.2`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.2) — network-safe hard rules
- [`v3.1`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.1) — click-first download strategy
- [`v3.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.0) — token-disciplined probe/action libraries
- [`v2.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v2.0) — grouped download + FlareSolverr warmup
- [`v1.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v1.0) — original unified skill
