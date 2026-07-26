# Tsinghua Literature Downloader

通过已登录的清华图书馆/WebVPN Chrome 会话自动化下载学术 PDF。

Adapted from [zju-literature-downloader](https://github.com/baihe26/zju-literature-downloader) by [@baihe26](https://github.com/baihe26) (浙江大学版), re-engineered for Tsinghua University Library, 水木学术搜索, and institutional access pathways.

## 工作流

```
你的 Chrome (已登录清华) ← CDP 代理 ← AI Agent
         ↓
  水木学术搜索 / Alma resolver → 出版商页面 → 下载 PDF
         ↓
  [FlareSolverr, 可选] → 自动清除 Cloudflare JS Challenge
```

## 前置条件

- Chrome 浏览器（已登录 水木学术搜索）
- Chrome 远程调试已启用
- Node.js 22+
- FlareSolverr（可选，用于自动清除 Cloudflare）

## 目录结构（三个版本，清晰隔离）

```
├── SKILL-v1/   ← 统一版（unified, 逐篇下载）           — legacy
├── SKILL-v2/   ← 分组版（grouped, 按出版社批量下载）    — legacy
├── SKILL-v3/   ← token-disciplined（探针库，省 token）  — CANONICAL，正在实测
├── TEST/        ← 测试用，安装技能时不需要
├── sync.sh      ← 同步三个版本到各 AI 工具目录
└── README.md
```

| 版本 | 特点 | 状态 |
|---|---|---|
| `SKILL-v1` | 统一版，逐篇独立下载 | legacy，当前默认安装目标 |
| `SKILL-v2` | 分组版，按 publisher 批量下载 | legacy |
| `SKILL-v3` | 探针库 + Token Discipline 硬规则，`/eval` 只返回紧凑判定 | **canonical**，实测通过后切换为默认 |

### V1 / V2 / V3 差异（simple English）

One-line idea: **V1** = simple but slow and costly. **V2** = V1 + group papers by publisher. **V3** = V2's grouping + low memory + safe + self-checking.

| Point | V1 (unified) | V2 (grouped) | V3 (token-saved) |
|---|---|---|---|
| Download style | one paper at a time | papers grouped by publisher; one login per group | grouped like V2 |
| AI memory (token) use | high | high (same as V1) | low |
| How it reads a page | reads the whole page into memory | same as V1 | a small "probe" sends back only a short answer |
| How it gets the PDF | one simple way for all sites | same as V1 | each publisher has a small "action" that knows the right way (fetch / click / new tab / in-page viewer) |
| Lessons (playbook) file | full, kept inside the folder | a short link to V1's file (breaks if copied alone) | full, kept inside the folder |
| Broken half-file risk | a half file can stay and look done | same as V1 | half files are deleted; they never get the final name |
| Short network error | fails right away | same as V1 | tries one more time |
| File check after download | loose (just "title is in text") | same as V1 | strict (DOI found, or strong title match) |
| Test tool | none | none | a small test list ("canary") checks each publisher still works |
| Shared code | same code copied in many files | same as V1 | one shared code file |
| Works on its own | yes | no (needs V1's folder) | yes |
| Status | old; still the live one now | old | new; main one after live testing |

## 快速开始

```bash
# canonical 版本（推荐）
cd SKILL-v3 && node start.js

# 或 legacy 统一版
cd SKILL-v1 && node start.js
```

详见对应 `SKILL-vX/` 目录下的 `README.md` 和 `SKILL.md`。

## 同步到 AI 工具

```bash
./sync.sh          # 预览
./sync.sh --apply  # 实际复制
```

`sync.sh` 当前把 `SKILL-v1` 装到默认路径、`SKILL-v2` → `-grouped`、`SKILL-v3` → `-v3` 后缀（非破坏性）。v3 实测通过后，按 `sync.sh` 文件头注释切换为默认安装目标。
