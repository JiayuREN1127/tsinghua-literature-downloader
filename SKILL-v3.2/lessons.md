# 测试经验教训记录

> 每次测试后记录遇到的问题、解决方案和观察。

---

## Probe 交叉引用（v3）

每个出版社 playbook 都有一个对应的紧凑探针（`probes/<name>.mjs`），通过 `scripts/probe.mjs --name <name>` 调用。探针把 playbook 里的"找 PDF 链接 / 判断认证状态"逻辑固化成服务端 JS，agent 只拿到 ~200 字节判定结果，不再吞整页内容。

| 出版社 / 章节 | 探针名 | 探针文件 | last_verified |
|---|---|---|---|
| ScienceDirect 流程 | `sciencedirect` | `probes/sciencedirect.mjs` | pending |
| EBSCO 流程（含 INFORMS） | `ebsco` | `probes/ebsco.mjs` | pending |
| Wiley 流程 | `wiley` | `probes/wiley.mjs` | pending |
| ProQuest / APA 流程 | `proquest` | `probes/proquest.mjs` | pending |
| SAGE 流程 | `sage` | `probes/sage.mjs` | pending |
| Taylor & Francis 流程 | `tandfonline` | `probes/tandfonline.mjs` | pending |
| JSTOR 流程 | `jstor` | `probes/jstor.mjs` | pending |
| Annual Reviews 流程 | `annualreviews` | `probes/annualreviews.mjs` | pending |
| IEEE Xplore 路由 | `ieee` | `probes/ieee.mjs` | pending |
| Nature / Springer Nature 流程 | `nature` | `probes/nature.mjs` | pending |
| Primo / Alma（通用入口） | `primo` | `probes/primo.mjs` | pending |
| 任意页面（组合判定） | `classifyPage` | `probes/classify-page.mjs` | pending |

**维护约定：**
- 每次实测确认某出版社探针正确后，把上表 `last_verified` 改为日期（如 `2026-07-26`）。
- 若出版社改版导致探针失效：更新探针 + playbook，重置 `last_verified`，并在下方的"探针失效记录"追加一条。
- canary 回归已落地：`canaries.tsv`（每个出版社一个已知可用 DOI）+ `scripts/run-canary.mjs`。运行 `node scripts/run-canary.mjs` 即可回归所有探针；全绿后用 `--mark` 提示如何更新下表的 `last_verified`。`canaries.tsv` 中的 DOI 初始为 SEEDED 占位，首次实测成功后替换为真正稳定的 DOI。

## Action 交叉引用（v3）

探针（只读）回答"PDF 在哪 / 是否已认证"；动作（`actions/<name>.mjs`，通过 `scripts/get-pdf.mjs --publisher <name>` 调用）回答"怎么把字节抓下来"。每个动作返回一个紧凑 **fetch-plan**，由通用 runner 执行。各出版社的取数方式差异（credentials/POST/新标签/点击/PDF.js）都封装在这里。

| 出版社 | 动作名 | 动作文件 | **下载策略 (v3.1)** | last_verified |
|---|---|---|---|---|
| ScienceDirect | `sciencedirect` | `actions/sciencedirect.mjs` | **click (human CAPTCHA)** — CDP 触发反爬，需人工过验证后 click "View PDF" | pending |
| EBSCO / INFORMS | `ebsco` | `actions/ebsco.mjs` | **click-download (2-step)** — 工具栏"下载"→modal `bulk-download-modal-download-button` | pending |
| Wiley | `wiley` | `actions/wiley.mjs` | **navigate-download** — 浏览器导航 `pdfdirect?download=true`（fetch API 被 Cloudflare 拦截 403） | pending |
| ProQuest / APA | `proquest` | `actions/proquest.mjs` | **click-download** — 点击 "Download PDF" → media.proquest.com | pending |
| SAGE | `sage` | `actions/sage.mjs` | **fetch** — 仅中国镜像，从 RSC script 提取 PDF 路径 | pending |
| Taylor & Francis | `tandfonline` | `actions/tandfonline.mjs` | **fetch** — SSO 后 fetch `/doi/pdf/<DOI>?download=true` | pending |
| JSTOR | `jstor` | `actions/jstor.mjs` | **click-download** — T&C 页 "Accept and download" 按钮触发原生下载 | pending |
| Annual Reviews | `annualreviews` | `actions/annualreviews.mjs` | **fetch（POST）** | pending |
| IEEE Xplore | `ieee` | `actions/ieee.mjs` | **fetch（iframe src，需先在 stamp.jsp）** | pending |
| Nature | `nature` | `actions/nature.mjs` | **click-download** — 点击可见 "Download PDF" 按钮触发原生下载 | pending |

**维护约定（同探针）：** 动作实测成功后更新 `last_verified`；改版失效则更新动作 + playbook 并重置日期。canary 目前只校验探针；动作的真下载校验需在有 Chrome 会话时手动 `get-pdf.mjs` 跑一遍 SEEDED DOI。

---

## 通用经验总结

- **使用 `/eval` 加 JS 循环**精确选择元素比 `clickAt` CSS 选择器更可靠
- **标签页管理**：过期/损坏的标签页应及时关闭
- **下载日志**：用 `download-log.tsv` 记录每次操作结果
- **CDP 操作技巧**：Primo 使用 `/navigate` 而非 `/new`（防止 `#!` fragment 被截断 → `about:blank`）；SPA 页面导航后等待 6-10 秒再提取链接
- **Cloudflare JS Challenge 处理**：发行商页面触发 Cloudflare 后，以两个模式依次尝试 FlareSolverr 解析（见下方 `FlareSolverr 两模式工作流`）

### 论文入口：分层回退策略

实际的下载成功率最高的入口顺序是：

| 优先级 | 入口 | 适用场景 |
|--------|------|----------|
| 1 | **Alma resolver** | 自动化首选；URL 可参数化构造，绕过 Primo Angular SPA 的加载延迟。格式：`https://tsinghua.alma.exlibrisgroup.com.cn/view/uresolver/86THU_INST/openurl?rft_id=info:doi/<DOI>&svc_dat=single_service` |
| 2 | **Primo（水木学术搜索）** | Alma 无法解析时使用。Primo 搜索范围默认为"纸本资源"，URL 需加 `search_scope=default_scope` 切换到"全部资源"。DOI 搜索无结果时改用完整标题搜索。 |
| 3 | **出版社直连** | Primo/Alma 均无记录时使用（如 EBSCO 中收录的 INFORMS 期刊、部分 Wiley 文章）。注意：直接 DOI 跳转出版社页面是裸访，可能需要逐家适配 Shibboleth/CAS 流程。 |

**核心原则**：优先经过机构的认证上下文（Alma 或 Primo 的"在线全文"链接嵌入了 Tsinghua 代理/认证信息），减少逐家适配 Shibboleth 的成本。但如果出版社已有缓存的 CAS session，直连也可能直接认证通过。

---

## FlareSolverr 两模式工作流 (v2.0)

v2.0 采用**预热-下载架构**：Phase 1 一次性清除所有 Cloudflare 保护域的 `cf_clearance` + 触发 CAS，Phase 2 逐篇快速下载。此节记录 FlareSolverr 的底层技术细节。

### 预热目标域

需要预清除 Cloudflare 的出版商（按 DOI 前缀识别）：

| 出版商 | DOI 前缀 | cf_clearance 域 |
|--------|---------|----------------|
| ScienceDirect | `10.1016/` | `.sciencedirect.com` |
| Wiley | `10.1002/`, `10.1111/` | `.onlinelibrary.wiley.com` |
| Taylor & Francis | `10.1080/` | `.tandfonline.com` |

无需预清除（走 CAS 直连）：ProQuest、EBSCO、JSTOR、SAGE（中国镜像）。

当出版商页面（ScienceDirect、Taylor & Francis、SAGE 镜像等）显示 Cloudflare JS Challenge 时，使用 FlareSolverr (`localhost:8191`) 解析。两个模式依次尝试：

### 检测：区分 JS Challenge 与 CAPTCHA

- **JS Challenge**（可自动解析）：页面文字含 "Checking your browser" / "正在检查浏览器" / "Just a moment"
- **CAPTCHA**（不能自动解析）：页面含 "Verify you are human" / 复选框 / 图片网格 / "Are you a robot?"

FlareSolverr 上游文档明确标注其 CAPTCHA solvers 均已失效。遇到 CAPTCHA 时不调用 FlareSolverr，直接交付用户手动验证。

### 模式 A：Cookie 注入（优先）

1. 将被阻塞的 URL 发给 FlareSolverr：
   ```
   POST http://localhost:8191/v1
   { "cmd": "request.get", "url": "<blockedURL>", "maxTimeout": 60000, "returnOnlyCookies": true }
   ```
2. 返回 `{ solution: { cookies: [...] } }`，其中包含 `cf_clearance` 等 cookie。
3. 通过 CDP 将 cookie 注入被阻塞的 Chrome tab：
   ```javascript
   document.cookie = "<name>=<value>; domain=<domain>; path=/; secure";
   ```
4. 刷新标签页。Chrome 现在的 `cf_clearance`（绕过 Cloudflare）+ Tsinghua CAS cookies（机构认证）同时存在。

**风险**：`cf_clearance` 偶与 User-Agent 绑定。FlareSolverr 的 headless Chrome UA 与用户的真实 Chrome UA 不匹配时，Cloudflare 可能拒绝该 cookie。测试确认后，若 UA 绑定为严格布尔的，退至模式 B。

### 模式 B：内容提取（回退）

1. 前述 FlareSolverr 请求不带 `returnOnlyCookies`，获取完整 HTML（`solution.response`）。
2. 从 HTML 中提取目标链接：
   - ScienceDirect：文章 PII 匹配的 "View PDF" 链接，或 `pdf.sciencedirectassets.com` 签名 URL
   - Taylor & Francis：`/doi/pdf/<DOI>?download=true`
   - SAGE：`/storage/sage/journal/article/.../unzip/<DOI>.pdf`
3. 用户的 Chrome 直接导航至提取的链接。PDF CDN（`pdf.sciencedirectassets.com`、`sage.cnpereading.com`）很少受 Cloudflare 保护。
4. 若 PDF CDN 也触发 Cloudflare，记录 `cloudflare_flaresolverr_failed`，交付用户手动操作。

### 日志

两种新的 `failure_reason` 值：

- `cloudflare_flaresolverr_solved` — 模式 A 或 B 成功
- `cloudflare_flaresolverr_failed` — 两模式均失败，交付用户

---

## 全局关键经验（跨出版社）

### 下载策略：click-first（v3.1 实测结论）

2026-07-27 对 8 个数据库的实测确立了 **click-download 优先** 原则：

| 策略 | 数据库 | 数量 |
|------|--------|:----:|
| **fetch()** | SAGE、T&F | 2/8 |
| **click-download / navigate-download** | JSTOR、ProQuest、Wiley、EBSCO×2 | 5/8 |
| **需人工过 CAPTCHA** | ScienceDirect | 1/8 |

- fetch() 仅在 SAGE 和 T&F 上可靠（服务端直接返回 `application/pdf`）
- 其余库因 T&C 拦截页（JSTOR）、Cloudflare（Wiley）、PDF.js viewer（ProQuest/EBSCO）、动态签名 URL（ScienceDirect）等原因，fetch 失败
- click-download 利用浏览器原生处理 cookie/重定向/Cloudflare，与人类操作一致，更可靠
- Publisher 的 PDF viewer 大多是**自定义 PDF.js 组件（DOM 元素）**，下载按钮可被 CDP 点击

### Primo（水木搜索）

- **旧 URL 已废弃**：`primo.lib.tsinghua.edu.cn` 已停止服务（DNS NXDOMAIN），必须使用新地址：
  - 新地址：`https://tsinghua-primo.hosted.exlibrisgroup.com.cn/primo-explore/search?vid=86THU`
- **搜索范围**：默认 "全部纸本资源"（`print_scope`），URL 加 `search_scope=default_scope` 切换到 "全部资源"
- **DOI vs 标题**：部分论文 DOI 在 Primo 搜不到，但完整标题可以。DOI 无结果时立即改用标题搜索
- **结果提取**：跳过空 `href` 值；Primo 是 Angular SPA，导航后等 6-10 秒，重试 link 提取最多 3 次
- **IP 范围**：如果 Primo 提示 IP 不在授权范围，用户需要打开 THU VPN/WebVPN 客户端

### CAS 会话跨出版社共享

一次 CAS（Shibboleth）认证后，同一浏览器会话中以下出版社均可复用：
- ScienceDirect、Wiley、Taylor & Francis、JSTOR、SAGE、ProQuest、Annual Reviews、**Nature / Springer Nature**
- 超时机制：数小时后过期；超时后重新登录即可

### PDF 分块下载模式

- **大 PDF（>400KB）**：通过 eval JS 存入 `window.__thuPdfBytes`，然后分块回传
- **小 PDF（<200KB）**：可直接一次传输
- 流程：`fetch` → `new Uint8Array(buf)` → 存入 window → 分块回传 → 组装写入

### PDF Header 检查

不同出版商/年份的 PDF 版本各异（1.3、1.4、1.6 等），验证 PDF 时**只检查前 4 字节 `%PDF` ([37,80,68,70])**，不要匹配完整版本号。

### 批量下载策略

1. **按出版商分组**：同出版商的论文复用 session，先认证一次，后续论文直接 fetch
2. **标签页复用**：认证过的 publisher 标签页在整个会话中可复用，避免频繁创建新标签页触发反爬
3. **Alma resolver 优于 Primo 搜索**：可参数化构造 URL（`rft_id=info:doi/<DOI>`），绕过 SPA 延迟

---

## ScienceDirect 流程（10.1016/）

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | Alma resolver 或 Primo 搜索 DOI → 找到 "阅读全文" 链接 | |
| 2 | 点击 "阅读全文" → ScienceDirect 文章页 | 可能显示 "请稍候…" 反爬中间页 |
| 3 | 若显示 "Access through Tsinghua University"，点击触发 CAS | CAS session 跨库共享 |
| 4 | 页面显示 "Brought to you by: Tsinghua University" | 授权成功 |
| 5 | **⚠️ CDP 触发 CAPTCHA**（"Are you a robot?"）→ **人工在 Chrome 中完成验证** | FlareSolverr 无法解决（已实测：45s 超时，0 字节返回） |
| 6 | 人工过 CAPTCHA 后，点击 "View PDF" | 开新 tab `pdf.sciencedirectassets.com`（S3 presigned URL） |
| 7 | 人工下载或从新 tab 获取 PDF | S3 URL 5 分钟过期 |

### 关键教训

1. **CDP 必触发 CAPTCHA**：ScienceDirect 的反爬系统（`crasolve`）检测到 CDP 自动化后显示 "Are you a robot?" CAPTCHA。这是**自动化检测问题**，不是 fetch vs click 问题。**必须人工介入。**

2. **FlareSolverr 无效**：已实测，FlareSolverr 对 ScienceDirect 的 CAPTCHA 完全卡死（45 秒超时无响应）。FlareSolverr 只能解 Cloudflare JS Challenge，不能解 ScienceDirect 的 crasolve CAPTCHA。

3. **fetch pdfft 返回 HTML**：即使在认证状态下，`fetch(pdfft URL)` 也返回 `text/html`（viewer 页），不是 PDF。

4. **PII 匹配选择 View PDF 链接**：SD 页面底部引用区有多个其他文章的 View PDF 链接。用 `href.includes("<PII>")` 精确匹配。

5. **预签名 URL 5 分钟过期**：`X-Amz-Expires=300`。过期后需回到文章页重新点击 View PDF。

6. **CAS 会话缓存**：一次 CAS 登录后，同一浏览器会话中访问其他 SD 文章无需重复登录（但 CAPTCHA 可能再次触发）。

---

## EBSCO 流程（Business Source Complete，含 INFORMS 10.1287/）

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | Alma/Primo 搜索 DOI 或标题 → 无结果时直接访问 `research.ebsco.com` | INFORMS 期刊在 Primo 无记录 |
| 2 | 在 EBSCO 内搜索 → 找到记录 → 进入文章详情页或 PDF viewer | viewer 是**自定义 PDF.js 组件**（DOM 元素） |
| 3 | 点击 viewer 工具栏 `button[data-auto=tool-button][aria-label=下载]` | 弹出下载模态框 |
| 4 | 点击模态框 `button[data-auto=bulk-download-modal-download-button]` | **浏览器原生下载**，文件直落 `~/Downloads` |
| 5 | `mv ~/Downloads/EBSCO-FullText-*.pdf downloads/<paper>.pdf` | 文件名格式 `EBSCO-FullText-<date>.pdf` |

### 关键教训

1. **click-download 两步完成**：viewer 工具栏的 "下载" 按钮（DOM 元素）打开 modal，modal 内的 `bulk-download-modal-download-button` 触发原生下载。**不需要** CDS observe + fetch(omit) 那套复杂逻辑。

2. **viewer 是自定义 PDF.js**（不是 Chrome 内置 viewer）：有 `data-auto="pdf-viewer"`、`viewer-toolbar` 等 DOM 元素。所有工具栏按钮都是可点击的 DOM，CDP 完全可控。

3. **Cookie 同意横幅可能阻挡**：首次进入 viewer 页面时可能出现 OneTrust cookie 同意横幅。先点击 "接受" 关闭它，再操作工具栏按钮。

4. ~~**CDS 签名 URL**~~（已弃用）：旧方案通过 `performance.getEntriesByType("resource")` 观察 CDS URL 再 fetch(omit)。两步 click 更简单可靠，不再推荐旧方案。

5. **Primo 无记录时走 EBSCO**：INFORMS（美国运筹学与管理科学学会）期刊收录在 EBSCO Business Source Complete 中，不在 Primo 直接收录。

---

## Wiley 流程（10.1002/、10.1111/）

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | Alma/Primo 搜索（DOI + 标题）→ 无记录时走出版社直连 | 大量 Wiley 文章在 Primo "全部资源" 中未找到 |
| 2 | 通过 Alma resolver 或 Shibboleth 认证 | CAS session 跨库共享 |
| 3 | 页面顶部显示 "Access through Tsinghua University" 或 "Full Access" | 授权成功 |
| 4 | 浏览器**导航**到 `pdfdirect?download=true` | `POST /navigate` → `isDownload:true` |
| 5 | **浏览器原生下载**，文件直落 `~/Downloads` | |
| 6 | `mv ~/Downloads/<file> downloads/<paper>.pdf` | |

### 关键教训

1. **fetch API 被 Cloudflare 拦截**：`fetch("/doi/pdfdirect/<DOI>?download=true")` → **403 Forbidden**。但浏览器**导航**到同一 URL 带完整 Cloudflare cookie，正常通过（`isDownload:true`）。**用 navigate-download，不用 fetch。**

2. **页面 "Download PDF" 按钮指向错误 URL**：按钮 href 为 `/doi/pdf/<DOI>`（返回 HTML 文章页），不是 `/doi/pdfdirect/<DOI>?download=true`。必须手动构造 pdfdirect URL 导航。

3. **`pdfdirect` vs `pdf`**：`/doi/pdfdirect/<DOI>?download=true` 是正确的下载 URL；`/doi/pdf/<DOI>` 返回 HTML。

### Wiley 子域名陷阱

部分 Wiley 期刊托管在独立子域名上（如 `iaap-journals.onlinelibrary.wiley.com`），子域名 cookie 不与主站共享。

- **解决方案**：导航到实际文章页 → 检查 `location.origin` → 构造 `<origin>/doi/pdfdirect/<DOI>?download=true` 导航。

---

## ProQuest / APA 流程（10.1037/）

APA 期刊通过 ProQuest（APA PsycArticles）访问，提供两条路径：

### 路径 A：Alma resolver（自动化首选）

| # | 操作 | 说明 |
|---|------|------|
| 1 | Alma resolver 直接构造 URL（**不经过 Primo 搜索**） | `https://tsinghua.alma.exlibrisgroup.com.cn/view/uresolver/86THU_INST/openurl?rft_id=info:doi/<DOI>&svc_dat=single_service` |
| 2 | 找 ProQuest 链接 → 导航到 ProQuest 文章页 | link text 包含 "ProQuest"，href 包含 `uresolver.do` |
| 3 | 找 `fulltextPDF` 链接 → 导航 | href 包含 `fulltextPDF` |
| 4 | PDF.js viewer 在 iframe 中渲染 → 提取 PDF | `iframe.contentWindow.PDFViewerApplication.pdfDocument.getData()` |

### 路径 B：ProQuest 站内搜索（Alma 无返回时）

| # | 操作 | 说明 |
|---|------|------|
| 1 | 直接访问 `proquest.com` | 如已登录则显示 "Access provided by Tsinghua University" |
| 2 | 在 ProQuest 内按标题搜索 | 输入框 `id="searchTerm"`（textarea），`form.submit()` |
| 3 | 在搜索结果中找目标论文 | **不要**用外部给定的 `docview/...` URL 直接导航 |
| 4 | 点击标题进入详情页 → 点击 "PDF" 或 "Full Text" | URL 变为 `/docview/{docviewID}/fulltextPDF/...` |
| 5 | PDF.js viewer 在 iframe 中渲染 → 提取 PDF | 同上 |

### 关键教训

1. **Alma resolver 是第一选择**：大量 APA 文章在 Primo 中无记录，Alma resolver 总能正确解析出全文链接。

2. **click-download 优先**：文章页 "Download PDF" 按钮指向 `media.proquest.com` 媒体 URL，点击后触发浏览器原生下载。比 PDF.js viewer 读取更简单可靠。

3. **PDF.js viewer 仍可用**：`PDFViewerApplication.pdfDocument.getData()` 可从 iframe 中提取 PDF 二进制，作为 click-download 的备选方案。

---

## SAGE 流程（10.1177/）

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | **不要**用 `journals.sagepub.com` | Tsinghua 的 SAGE 订阅不在主站，PDF 永远 403 |
| 2 | 用 CEPIEC 中国镜像：`sage.cnpereading.com` | 中国图书进出口集团运营的 SAGE 中国平台 |
| 3 | 平台自动带机构认证 | URL 格式：`/doi/10.1177/<DOI>` |
| 4 | 在页面源码的 `<script>` 标签中搜索 PDF 路径 | 路径模式：`/storage/sage/journal/article/{JCODE}/{YEAR}/{JCODE}_{YEAR}_{VOL}_{ISS}/unzip/{DOI}.pdf` |
| 5 | `fetch(pdfPath, {credentials:"include"})` → PDF 二进制 | 直接返回 `application/pdf` |

### 关键教训

1. **SAGE 有中国专属镜像**：`sage.cnpereading.com` ≠ `journals.sagepub.com`。前者由 CEPIEC 运营，机构认证自动完成；后者走 OpenAthens/Shibboleth，Tsinghua 的 Shibboleth 在主站不生效。

2. **PDF 路径在 RSC 流式数据中**：Next.js App Router（RSC）将数据流式写入 `<script>` 标签的 `self.__next_f.push(...)` 中，不在 `__NEXT_DATA__` JSON 里。需在 script 文本中正则搜索 `/storage/` 或 `.pdf`。

3. **不要和主站混用**：在 `journals.sagepub.com` 上反复尝试 Shibboleth 登录都无效，问题出在域名而非认证流程。

4. **Cloudflare**：SAGE 中国镜像可能有 Cloudflare JS Challenge，等待 10-30 秒自动通过。

---

## Taylor & Francis 流程（10.1080/）

### 关键教训

1. **SSO 后直接 fetch**：T&F 的认证与其他出版社共享 CAS 池。通过 `/action/ssostart?redirectUri=...` 触发 Shibboleth → OpenAthens → CAS → 回到文章页（如果 CAS 已缓存则自动完成）。认证后从文章页 `fetch("/doi/pdf/<DOI>?download=true")` 即可获得 PDF。

2. **Cloudflare 中间页**：ssostart 过程中可能触发 Cloudflare JS Challenge（"正在安全验证"页面），等待 10-30 秒自动通过。直接 CDP 导航 T&F 页面也容易触发。

3. **CAS 缓存后无需额外操作**：如果浏览器已有其他出版社的 CAS session，T&F 也会自动识别并显示已认证状态。

---

## JSTOR 流程（10.2307/）

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | Alma/Primo → `doi.org/10.2307/...` → JSTOR | 若已有 CAS 会话则自动登录 |
| 2 | 页面显示 "Access provided by 清华大学" | 认证成功 |
| 3 | 导航到 `/stable/pdf/{jstorID}.pdf` → 触发 **T&C 拦截页** | URL 变为 `/tc/accept?origin=...` |
| 4 | 点击 `<terms-and-conditions-pharos-button>` shadow DOM 内的 button | `el.shadowRoot.querySelector("button").click()` |
| 5 | **浏览器原生下载**，文件直落 `~/Downloads` | 文件名如 `Louis-SurpriseSenseMaking-1980.pdf` |
| 6 | `mv ~/Downloads/<file> downloads/<paper>.pdf` | 移动到目标目录 |

### 关键教训

1. **fetch 已失效**：JSTOR 新增了 T&C（Terms and Conditions）拦截页。`fetch("/stable/pdf/{id}.pdf")` 返回 `text/html`（T&C 页面），不是 PDF。**必须用 click-download**。
2. **T&C 按钮是自定义 web component**：`<terms-and-conditions-pharos-button>` 有 shadow DOM，需 `el.shadowRoot.querySelector("button").click()` 而非直接 click。
3. **点击即下载**："Accept and download" 按钮同时完成接受条款 + 触发浏览器原生下载，文件直落 `~/Downloads`。
4. **PDF URL 模式仍为** `/stable/pdf/{jstorID}.pdf`，但在 T&C 接受前不可直接 fetch。

---

## Annual Reviews 流程（10.1146/）

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | navigate 到 Annual Reviews 文章页 | `https://www.annualreviews.org/content/journals/10.1146/<doi>` |
| 2 | 若无 "Access provided by"，点击 "Institutional Login" | 进入 Shibboleth WAYF |
| 3 | WAYF 页面通过 JS 输入 Tsinghua 并提交 | 以 `nativeInputValueSetter` 设值 → `input` event → 找 `<select>` 中匹配的 `<option>` → `form.submit()` |
| 4 | 页面回到文章页，显示 "Access provided by: Tsinghua University" | |
| 5 | 从页面 HTML 中提取 PDF deliver URL → POST fetch | 正则搜 `action="(/deliver/fulltext/...\.pdf?...)"` |
| 6 | PDF 返回 `application/pdf` | 不用 GET，Annual Reviews 要求 POST |

### 关键教训

1. **WAYF 页面是原生 select/option**：不是 React 动态过滤列表。`input` event 触发后，所有 option 仍在 DOM 中。直接用 `nativeInputValueSetter` 设值 + `option.selected = true` + `form.submit()`。

2. **PDF 走 POST 表单提交**：Annual Reviews 的 PDF 下载链接实际是 `<form method="POST" action="/deliver/fulltext/...">`。直接 GET 会返回 HTML。用 `fetch(url, {method: "POST"})` 才返回 PDF。

3. **URL 模式**：`/deliver/fulltext/<journal>/<vol>/<iss>/<doi>.pdf?itemId=...&mimeType=pdf&containerItemId=...`，从页面 HTML 正则可获取完整路径。

4. **一次 Shibboleth 认证后跨论文复用**：同出版社多篇论文可在一次认证后连续下载。

---

## IEEE Xplore 路由（意外路由）

某些 AMJ/AoM 论文通过 Alma 或 Primo 解析后，唯一选项可能是 **IEEE Xplore**（`IEEE Electronic Library (IEL) Journals`），而非预期的 EBSCO 或 ProQuest。

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | 从 Alma 或 Primo 点击 IEEE 链接进入 IEEE Xplore | URL 格式：`https://ieeexplore.ieee.org/document/<arnumber>` |
| 2 | 在页面中点击 "PDF" 链接/按钮 | 用 JS `document.querySelectorAll("a, button")` 遍历找文本含 "PDF" 的元素 |
| 3 | 新 Tab 打开 `stamp.jsp` 页面 | URL 格式：`https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=<arnumber>` |
| 4 | 从 stamp.jsp 页面找 iframe 的 PDF 源 URL | `document.querySelector("iframe").src` → 得到 `getPDF.jsp` URL |
| 5 | `fetch(pdfSrc, {credentials:"include"})` → PDF 二进制 | 直接返回 `application/pdf` |

### 关键教训

1. **不要仅依赖预期路由**：AoM 论文可能走 IEEE 而非 EBSCO/JSTOR。Alma 返回 "No full text available" 或仅一个陌生链接时，点击进去看看。

2. **IEEE PDF 在 iframe 中**：stamp.jsp 将 PDF 嵌入 `<iframe src="getPDF.jsp?...">`。fetch 该 src 即可获得 PDF，无需点击下载按钮。

3. **URL 模式**：`https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=<arnumber>&ref=...`。

---

## Nature / Springer Nature 流程（10.1038/）

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | 导航到文章页 | `https://www.nature.com/articles/<DOI-suffix>`（如 `d41586-026-01794-0`） |
| 2 | 检查页面是否显示 "full access via your institution" | 若显示，已认证；否则需要登录 |
| 3 | 若未登录：点击页眉 "Log in" → 跳转 `idp.nature.com` | 在登录页选择 "Access through your institution" → 搜索 Tsinghua → CAS 完成 |
| 4 | 找到可见的 "Download PDF" 按钮（页面通常有 3 个，仅主内容区的可见） | 用 `getBoundingClientRect()` 筛选 `visible: true` 的那个 |
| 5 | 用 JS `.click()` 点击可见按钮（不要用 `/clickAt`） | 触发 Chrome 原生下载，文件保存到 Downloads |
| 6 | 验证下载文件：`%PDF` 头部、page count > 0、文本含文章标题 | 用 `extract_pdf_text.py` |

### 关键教训

1. **必须先登录 Springer Nature**：未登录状态下点击 "Download PDF"，Nature 返回的是 **HTML 文件（~221KB，content-type: text/html）**，而不是 PDF。文件扩展名也是 `.html`，但很容易被误认为下载成功。**验证 PDF 头部 `%PDF` 是必须步骤**。

2. **登录状态判断**：页面文本中出现 "full access to this article via your institution" 即代表已认证。不要只看页眉的 "Log in" 按钮是否存在——它可能始终存在但功能已激活。

3. **多个 Download PDF 按钮**：页面通常有 3 个 `a.c-pdf-download__link`：2 个隐藏（sticky header）+ 1 个可见（主内容区）。CDP `/clickAt` 对隐藏元素返回坐标 (0,0)，无法触发下载。**用 JS 获取所有按钮 → 筛选 `getBoundingClientRect().width > 0` 的可见按钮 → 直接 `.click()`**。

4. **`data-readcube-pdf-url="true"` 属性**：Nature 的 PDF 下载由 ReadCube 提供底层支持，该属性标记了按钮。但不需要手动构造 ReadCube URL——点击按钮即可触发原生下载。

5. **`d41586-*` 系列（Careers/News/Commentary）**：这类文章是 Nature 网页专属内容，印刷版没有独立 PDF。**但登录后仍可下载到 PDF**（内容是文章的排版版本，2 页左右）。未登录时只会得到 HTML。

6. **Alma resolver 路径也指向 Nature**：通过 Alma 的 "SpringerLink Journals - AutoHoldings" 入口最终也重定向到 `nature.com/articles/...`，与直接 DOI 访问相同。CAS 认证状态在 `nature.com` 域内共享。

### URL 模式

- 文章页：`https://www.nature.com/articles/<suffix>`（如 `d41586-026-01794-0`）
- PDF 下载：通过点击 "Download PDF" 按钮触发，URL 为 `https://www.nature.com/articles/<suffix>.pdf`
- 机构登录：页眉 "Log in" → `https://idp.nature.com/auth/personal/springernature?redirect_uri=<article-url>`，再选 "Access through your institution"
