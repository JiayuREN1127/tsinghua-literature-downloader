# Tsinghua Literature Downloader — v3 (token-disciplined)

通过已登录的清华图书馆/WebVPN Chrome 会话下载学术 PDF。

**v3 的核心改进：token 受控。** 所有页面探测都通过 `scripts/probe.mjs` 调用 `probes/` 里的紧凑探针——JS 在浏览器端执行并过滤，agent 只拿到 ~200 字节的判定结果，不再吞入整页 HTML/文本。

**开箱即用，无需额外安装** — web-access CDP 代理已内置。本目录自包含，无任何跨目录引用。

---

## 快速开始（给协作者）

```bash
# 1. 解压包，进入目录
cd <skill-folder>

# 2. 一键启动（检查环境 + 启动 CDP 代理）
node start.js

# 3. 在弹出的 Chrome 中登录清华 WebVPN / 水木学术搜索
#    并启用远程调试：chrome://inspect/#remote-debugging → 勾选 Allow remote debugging

# 4. 对 Claude 说（或手动使用脚本）：
#    "请使用 tsinghua-literature-downloader 下载以下 DOI，
#     保存到 ~/papers/my-review/：
#      10.1016/j.jvb.2006.12.004"
```

## 前置条件

- **Node.js 22+**（`node --version` 确认）
- **Chrome 浏览器**（用自己的清华账号登录）
- 网络能访问清华图书馆/WebVPN

## 项目结构

```
tsinghua-literature-downloader/
├── package.json              ← npm start → node start.js
├── start.js                  ← 一键启动入口
├── SKILL.md                  ← Claude 读取的技能说明（含 Token Discipline 硬规则）
├── README.md                 ← 本文件
├── lessons.md                ← 各出版社 playbook（自包含，inline）
├── scripts/                  ← 下载 / 探针工具
│   ├── cdp-client.mjs        ← 共享 CDP HTTP 客户端（v3 新增）
│   ├── probe.mjs             ← 探针运行器，JS 服务端驻留（v3 新增）
│   ├── browser_pdf_downloader.mjs
│   ├── cdp_open_url.mjs
│   └── extract_pdf_text.py
├── probes/                   ← 紧凑探针库，每探针返回固定小 schema（v3 新增）
│   ├── index.mjs             ← 名称 → 探针 注册表
│   ├── classify-page.mjs     ← 组合探针：一次返回 stage/access/cloudflare/captcha/pdfUrl
│   └── <publisher>.mjs       ← 各出版社专属探针
├── actions/                  ← 各出版社"如何取字节"动作库（v3 新增）
│   ├── index.mjs             ← 名称 → 动作 注册表
│   └── <publisher>.mjs       ← 每个动作返回一个紧凑 fetch-plan
└── web-access/               ← 内置 CDP 代理
    └── scripts/
        ├── cdp-proxy.mjs
        ├── check-deps.mjs
        └── ...
```

## 探针用法（只读，判断状态）

探针的 JS 字符串存在本地文件里，通过运行器 POST 给 `/eval`，agent 只看到返回的紧凑 JSON：

```bash
# 组合探针：一次判断页面所处阶段 + 是否已认证 + 是否 Cloudflare/CAPTCHA + PDF 链接
node scripts/probe.mjs --target <id> --name classifyPage

# 出版社专属探针（按 lessons.md 的 playbook 编码）
node scripts/probe.mjs --target <id> --name sciencedirect --arg pii=S0001879110002083
node scripts/probe.mjs --target <id> --name ebsco
node scripts/probe.mjs --target <id> --name wiley --arg doi=10.1002/...
node scripts/probe.mjs --target <id> --name primo

# 列出所有可用探针
node scripts/probe.mjs --list
```

每个探针返回 ≤500 字节 JSON，例如：
```json
{"stage":"article","access":true,"cloudflare":false,"captcha":false,"pdfUrl":"...","pii":"S0001879110002083"}
```

## 下载用法（get-pdf，按出版社取字节）

探针告诉你"PDF 在哪、是否已认证"；`get-pdf.mjs` 负责按各出版社的方式真正把字节抓下来。它运行对应动作模块得到一个紧凑 **fetch-plan**，再执行该 plan 存盘。支持 4 种模式：`fetch` / `newtab-fetch`（ScienceDirect 预签名新标签）/ `click-download`（Nature 原生下载）/ `pdfjs`（ProQuest 页内 viewer）。

```bash
# 主要用法：一条命令完成"发现 plan + 下载 + 存盘"
node scripts/get-pdf.mjs --target <id> --publisher wiley --arg doi=10.1002/job.748 --out downloads/paper.pdf
node scripts/get-pdf.mjs --target <id> --publisher sciencedirect --arg pii=S0001879110002083 --out downloads/paper.pdf
node scripts/get-pdf.mjs --target <id> --publisher nature --out downloads/paper.pdf

# 列出所有动作模块
node scripts/get-pdf.mjs --list
```

plan 细节打到 stderr，stdout 只剩紧凑结果，agent 上下文保持干净。
`browser_pdf_downloader.mjs` 保留为 legacy，仅做简单 GET fetch。

## 手动用法

```bash
# 打开 URL（正确处理 Primo 的 #! 片段）
node scripts/cdp_open_url.mjs \
  --url "https://tsinghua-primo.hosted.exlibrisgroup.com.cn/primo-explore/search?vid=86THU&lang=zh_CN&query=any,contains,10.1016%2Fj.jvb.2006.12.004" \
  --wait

# 下载 PDF（--out 指定完整路径）
node scripts/browser_pdf_downloader.mjs \
  --target "<targetId>" \
  --out downloads/paper.pdf \
  --close

# 验证 PDF
python3 scripts/extract_pdf_text.py \
  --pdf downloads/paper.pdf \
  --pages 3
```

## 使用流程

每个项目自包含：

```
~/papers/my-review/
└── tsinghua-literature-downloader/   ← 解压到这里
    ├── start.js                       ← cd 后 node start.js
    ├── downloads/                     ← PDF 文件
    ├── scripts/                       ← 工具脚本
    └── download-log.tsv               ← 工作记录
```

## 工作记录

`download-log.tsv`，tab 分隔：

```text
paper	source_database	download_success	failure_reason
Socialization tactics and newcomer adjustment | ScienceDirect | 10.1016/j.jvb.2006.12.004	ScienceDirect	yes	
```

## 文件验证

```bash
python3 scripts/extract_pdf_text.py --pdf downloads/paper.pdf --pages 3
```
