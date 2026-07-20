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

## 快速开始

```bash
cd SKILL && node start.js
```

详见 `SKILL/` 目录下的 `README.md` 和 `SKILL.md`。
