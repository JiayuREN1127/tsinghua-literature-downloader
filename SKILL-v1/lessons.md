# 测试经验教训记录

> 每次测试后记录遇到的问题、解决方案和观察。

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
| 1 | Alma resolver 或 Primo 搜索 DOI → 找到 "阅读全文" 链接 | Primo URL：`/primo-explore/search?vid=86THU&query=any,contains,<DOI>` |
| 2 | 点击 "阅读全文" → ScienceDirect 文章页 | 链接直接指向 `sciencedirect.com/science/article/pii/<PII>` |
| 3 | 点击 "Access through Tsinghua University"（若需要） | 触发 CAS Shibboleth 认证；若会话已缓存则自动完成 |
| 4 | 页面显示 "Brought to you by: Tsinghua University" | 授权成功 |
| 5 | 点击 "View PDF" 链接 | 需匹配 PII 选择正确的链接（排除引用区其他文章的 PDF） |
| 6 | 新标签打开预签名 S3 URL | URL 含 `X-Amz-Expires=300`（5 分钟有效） |
| 7 | 从新标签页 `fetch(location.href, { credentials: "include" })` → 分块写入磁盘 | 新标签页可能触发 Cloudflare captcha，需手动验证 |

### 关键教训

1. **PII 匹配选择 View PDF 链接**：SD 页面底部引用区有多个其他文章的 View PDF 链接。用 `href.includes("<PII>")`（如 `S0001879110002083`）精确匹配目标文章的 PDF 链接。

2. **预签名 URL 5 分钟过期**：`X-Amz-Expires=300`。过期后需回到文章页重新点击 View PDF 获取新签名。

3. **Cloudflare captcha**：新标签页打开预签名 S3 URL 时可能触发反爬验证。需手动完成 captcha 后再 fetch。

4. **跨域限制**：`pdf.sciencedirectassets.com` 与 SD 域名不同，从 SD 页面 fetch 该 URL 会因 CORS 失败。必须在预签名 URL 所在的标签页内 fetch。

5. **CAS 会话缓存**：一次 CAS 登录后，同一浏览器会话中访问其他 SD 文章无需重复登录。

---

## EBSCO 流程（Business Source Complete，含 INFORMS 10.1287/）

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | Alma/Primo 搜索 DOI 或标题 → 无结果时直接访问 `research.ebsco.com` | INFORMS 期刊在 Primo 无记录 |
| 2 | 在 EBSCO 内搜索 → 找到记录 | "立即获取 (PDF)" 按钮可进入 viewer |
| 3 | 点击 "立即获取 (PDF)" → EBSCO 内置 PDF viewer | 页面显示 PDF 内容和工具栏 |
| 4 | 点击 viewer 工具栏 `aria-label="下载"` → 弹出下载模态框 | 模态框选项：全文/仅元数据；PDF 格式 |
| 5 | 点击模态框 `data-auto="bulk-download-modal-download-button"` | 触发后端 API 调用 |
| 6 | 自动获取 CDS 签名 URL 并直接 fetch | 无需新标签页，直接通过 eval 下载 |

### 关键教训

1. **Primo 无记录时走 EBSCO**：INFORMS（美国运筹学与管理科学学会）期刊收录在 EBSCO Business Source Complete 中，不在 Primo 直接收录。

2. **CDS 签名 URL 的发现**：点击下载按钮后，通过 `performance.getEntriesByType("resource")` 监测到两次请求：
   - `/api/researcher-edge-aggregator/v1/records/{id}/fulltext/pdf?intent=download` → 返回 JSON `{"url": "..."}`
   - `content.ebscohost.com/cds/retrieve?content=...` → 返回 PDF 二进制数据

3. **致命陷阱：fetch 不带 credentials**：CDS URL 使用 URL 内嵌签名认证（`?content=AQIC...`），**不需要也不应该**携带 `credentials: "include"`。携带 cookies 会导致 CORS 预检（OPTIONS）失败，返回 `Failed to fetch`。**去掉 `credentials: "include"` 后，fetch 直接返回 `application/pdf`**。

4. **CDS URL 一次性使用**：每个签名 URL 仅对一次请求有效；第二次相同 URL 的请求会失败。

5. **下载 API 端点**：可以直接通过以下方式获取 CDS URL：
   ```
   GET /api/researcher-edge-aggregator/v1/records/{id}/fulltext/pdf?sourceRecordId={id}&opid={opid}&intent=view&lang=en-US
   ```
   不需要走浏览器下载按钮。得到的 CDS URL 直接用 `fetch(url)`（无 credentials）即可下载 PDF。

---

## Wiley 流程（10.1002/、10.1111/）

### 标准步骤

| # | 操作 | 说明 |
|---|------|------|
| 1 | Alma/Primo 搜索（DOI + 标题）→ 无记录时走出版社直连 | 大量 Wiley 文章在 Primo "全部资源" 中未找到 |
| 2 | `doi.org/<DOI>` 重定向到 `onlinelibrary.wiley.com` → 文章页 | 页面上方显示 "Login / Register" |
| 3 | 点击 "Login / Register" → "Institutional login" → 搜索 "Tsinghua" → 选择 "Tsinghua University" | SAML 重定向至 CAS；若会话已缓存则自动跳回 |
| 4 | 页面顶部显示 "Access through Tsinghua University" | 授权成功 |
| 5 | 点击文章标题下方 "Full Access" 链接 | 进入含 `?download=true` 的 PDF 直链 |
| 6 | 从任一页面 `fetch("/doi/pdfdirect/...?download=true")` → PDF 二进制 | 无需额外认证 |

### 关键教训

1. **`pdfdirect` vs `pdf`**：`/doi/pdfdirect/<DOI>` 是带机构授权的直链；`/doi/pdf/<DOI>` 可能返回受限版本。参数 `?download=true` 确保返回完整的 PDF 二进制数据。

2. **`/eval` 中的 fetch 自动携带 cookies**：从已认证的页面执行 `fetch("/doi/pdfdirect/...")` 自动携带当前域名的认证 cookies，无需手动指定 `credentials`。

### Wiley 子域名陷阱

部分 Wiley 期刊托管在独立子域名上（如 `iaap-journals.onlinelibrary.wiley.com`），子域名 cookie 不与主站共享。

- **问题**：从 `onlinelibrary.wiley.com` 主站 fetch `pdfdirect` URL 时，子域名文章会返回空结果
- **解决方案**：导航到实际文章页 → 检查 `location.origin` → 从该 origin 发起 `fetch(origin + "/doi/pdfdirect/<DOI>?download=true")`
- **判断**：文章页上显示 "Full Access" 即代表已认证

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

1. **Alma resolver 是第一选择**：大量 APA 文章在 Primo 中无记录，Alma resolver 总能正确解析出全文链接，且可参数化构造 URL。

2. **ProQuest 比 EBSCO 更可靠**：所有 `10.1037/` 文章通过 ProQuest（APA PsycArticles）下载链路更稳定。

3. **不同 docview ID 对应不同订阅库**：`docview/1702115564` 可能显示 "Document Unavailable"，但 `docview/1687049206` 有全文。**必须通过 Alma resolver 或站内搜索动态获取 docview ID，不要硬编码**。

4. **PDF 提取走 PDF.js**：ProQuest 用 PDF.js viewer 在 iframe 中渲染 PDF。`PDFViewerApplication` 全局对象暴露在 iframe 的 contentWindow 中，调用 `pdfDocument.getData()` 可直接拿到 PDF 二进制。

5. **同一个 ProQuest Tab 可复用**：认证后的 ProQuest session 可跨文章复用，无需每篇重新认证。

6. **ProQuest 的接入路径**：ProQuest 首页 → Shibboleth login → 选 Tsinghua → CAS → 回 ProQuest。CAS session 复用。

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
| 3 | `fetch("/stable/pdf/{jstorID}.pdf", {credentials:"include"})` | 直接返回 PDF |

### 关键教训

1. **PDF URL 模式固定**：`/stable/pdf/{jstorID}.pdf`。
2. **大文件注意分块**：4.2MB 需 105 个 chunk（每个 40KB），耗时较长但可靠。

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
