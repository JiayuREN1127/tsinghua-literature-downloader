# Tsinghua Literature Downloader

通过已登录的清华图书馆/WebVPN Chrome 会话下载学术 PDF。

**开箱即用，无需额外安装** — web-access CDP 代理已内置。

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
├── SKILL.md                  ← Claude 读取的技能说明
├── README.md                 ← 本文件
├── scripts/                  ← 下载工具
│   ├── browser_pdf_downloader.mjs
│   ├── cdp_open_url.mjs
│   └── extract_pdf_text.py
└── web-access/               ← 内置 CDP 代理
    └── scripts/
        ├── cdp-proxy.mjs
        ├── check-deps.mjs
        └── ...
```

## 手动用法

```bash
# 搜索文献
node scripts/cdp_open_url.mjs \
  --url "https://tsinghua-primo.hosted.exlibrisgroup.com.cn/primo-explore/search?vid=86THU&lang=zh_CN&query=any,contains,10.1016%2Fj.jvb.2006.12.004" \
  --wait

# 下载 PDF（自动以页面标题命名）
node scripts/browser_pdf_downloader.mjs \
  --target "<targetId>" \
  --dir downloads/ \
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
