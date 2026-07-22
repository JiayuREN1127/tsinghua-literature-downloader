---
name: tsinghua-literature-downloader
description: Use this skill whenever the user wants to use their own logged-in Tsinghua University Library, WebVPN, 水木学术搜索, ScienceDirect, publisher, or Chrome session to legally search, download, organize, retry, and read academic PDFs. Trigger on requests like "用清华图书馆下载文献", "WebVPN 下载 PDF", "水木学术搜索下载文献", "ScienceDirect 人机验证后继续", or "帮我下载这几篇论文".
metadata:
  compatibility: Requires a local Chrome session logged in by the user, Chrome remote debugging permission, and Node.js 22+. Uses only user-authorized access.
  version: 2.0
---

# 清华大学文献下载工具 v2.0

This skill uses a **two-phase architecture**: warm up all publisher sessions once, then download rapidly.

## Architecture

```
Phase 1: Session Warmup (once, ~2 min)
  ├─ FlareSolverr → clear Cloudflare for SD, Wiley, T&F
  ├─ Inject cf_clearance cookies into Chrome
  ├─ Open one article per publisher → trigger CAS (auto-completes)
  └─ Verify all publishers show institutional access

Phase 2: Per-Paper Download (per paper, ~10 sec)
  ├─ Primo/Alma → click publisher link
  ├─ Page loads directly (no Cloudflare, no CAS)
  └─ Download PDF → verify → log
```

## Boundaries

Use only the user's legitimate institutional access. Do not bypass paywalls, DRM, CAPTCHA, two-factor authentication, or publisher login gates.

Do not use Sci-Hub, Library Genesis, or any other paywall-bypass or pirate mirror sites. If a paper cannot be accessed through Tsinghua University Library / WebVPN / Primo / publisher institutional access, record `no_authorized_pdf_found` and move on. Do not search for unauthorized copies.

Cloudflare JS Challenge ("Checking your browser...") is an automated browser test, not a human verification. FlareSolverr may be used to resolve it programmatically. Cloudflare Turnstile (checkbox), CAPTCHA (image grid), QR login, SMS/OTP, and publisher bot checks must still be escalated to the user in Chrome.

Avoid mass downloading. Work in small batches, preferably after the user confirms the paper list. Leave a clear audit trail of what was downloaded, from where, and whether supporting information was found.

Do not ask the user to paste institutional passwords, CAS credentials, OTP codes, recovery codes, or session tokens into chat or terminal. If the user offers a password, decline and use the handoff-login workflow instead.

Exception for THU CAS saved-login pages: if the user explicitly says that Chrome has already filled the THU CAS credentials and authorizes clicking the login/confirm button, the agent may click that button once on the THU CAS/WebVPN/institutional SSO page without reading, copying, or typing any credential. This exception does not apply to CAPTCHA, QR login, SMS/OTP, publisher bot checks, or any page outside the expected institutional login flow.

Do not inspect or export cookies, passwords, local storage, browser profiles, or session files. Use the browser's already-authenticated page context only.

## Browser & Tab Management

- **Never close the user's browser.** Do not run `killall`, `pkill`, or any command that terminates Chrome. The user relies on their open tabs, session state, and ongoing work.
- **Do not close existing tabs** without the user's explicit permission. The user may have research pages, videos, or work in those tabs.
- **Open new tabs visibly** — the user should be able to see what pages are being opened. Do not use hidden or background-only tabs.
- **After a paper is downloaded and verified**, its publisher/PDF tabs may be closed to free space. Leave Primo tabs open for reuse.
- **Reuse tabs when possible** — navigate a single tab per publisher rather than opening new ones.
- If the CDP proxy is already connected to Chrome, do not restart it.

## Preconditions

Before attempting downloads, confirm these conditions:

1. Chrome is open on the user's machine.
2. The user has personally logged in to Tsinghua University Library / 水木学术搜索 in Chrome.
   - Start page: `https://tsinghua-primo.hosted.exlibrisgroup.com.cn/primo-explore/search?vid=86THU&lang=zh_CN`
3. Chrome remote debugging is allowed for the current browser instance.
   - Ask the user to open `chrome://inspect/#remote-debugging`.
   - They must enable "Allow remote debugging for this browser instance".
4. Node.js 22+ is available.
5. The web-access CDP proxy is available or can be started:
   ```bash
   cd <skill-folder> && node start.js
   ```
6. The user has approved the target output folder.
7. FlareSolverr is recommended for automatic Cloudflare JS Challenge resolution. If not available:
   - Explain to the user what FlareSolverr does: "Some publishers (ScienceDirect, Wiley, T&F) show a 'Checking your browser...' page. FlareSolverr can clear these automatically — without it, you'll need to watch for them and click through manually. Takes ~1 minute to install."
   - Also disclose the limitations:
     * Only handles JS Challenge ("Checking your browser..."). Does NOT solve CAPTCHA images, checkboxes, or "Are you a robot?" pages (its CAPTCHA solvers are broken per upstream).
     * Consumes ~500MB RAM for its headless Chrome instance.
     * Requires Python 3.12+ and Chrome on the machine.
     * Runs as a background process until manually stopped.
   - Ask the user: "Install FlareSolverr now, or skip and handle Cloudflare pages manually?"
   - If they agree, install and start it:
     ```bash
     # Clone and install (macOS/Linux)
     git clone https://github.com/FlareSolverr/FlareSolverr.git /tmp/flaresolverr-src
     cd /tmp/flaresolverr-src && python3.12 -m pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
     # Start
     HEADLESS=false python3.12 src/flaresolverr.py &

     # Windows: use %TEMP% instead of /tmp, python instead of python3.12
     ```
   - If they decline, proceed without it — Cloudflare challenges will be escalated to the user.

---

## Phase 1: Session Warmup

Run this phase once before any downloads. It clears Cloudflare and activates CAS for all Cloudflare-protected publishers upfront.

### 1.1 Identify Target Publishers

Inspect the user's paper list for DOI prefixes. Cloudflare-protected publishers are:

| Publisher | DOI prefix | Domain for cf_clearance |
|-----------|-----------|--------------------------|
| ScienceDirect | `10.1016/` | `.sciencedirect.com` |
| Wiley | `10.1002/`, `10.1111/` | `.onlinelibrary.wiley.com` |
| Taylor & Francis | `10.1080/` | `.tandfonline.com` |

Publishers without Cloudflare (skip warmup, CAS-only): ProQuest, EBSCO, JSTOR, SAGE.

### 1.2 Check FlareSolverr Availability

```bash
curl -s --max-time 3 http://localhost:8191/v1 -H "Content-Type: application/json" \
  -d '{"cmd":"sessions.list"}' 2>/dev/null
```

If FlareSolverr is unavailable, skip to Phase 2 — Cloudflare will be escalated to the user per-paper.

### 1.3 Clear Cloudflare for Each Protected Publisher

For each Cloudflare-protected publisher in the paper list:

1. Pick any article URL on that publisher's domain.
2. Request FlareSolverr to resolve it and return only cookies:
   ```bash
   curl -s http://localhost:8191/v1 -H "Content-Type: application/json" \
     -d '{"cmd":"request.get","url":"<any-article-url>","maxTimeout":60000,"returnOnlyCookies":true}'
   ```
3. Extract the `cf_clearance` cookie from `solution.cookies`.
4. Open a new Chrome tab, navigate to `https://<publisher-domain>` to establish the domain context.
5. Inject the cookie via CDP:
   ```javascript
   document.cookie = "cf_clearance=<value>; domain=<domain>; path=/; secure";
   ```

### 1.4 Trigger CAS for Each Publisher

For each publisher in the paper list (Cloudflare-protected or not):

1. Navigate to one article page on that publisher.
2. Check the page for institutional access indicators:
   - ScienceDirect: `Brought to you by: Tsinghua University`
   - Wiley: `Full Access` or `Access through Tsinghua University`
   - JSTOR: `Access provided by 清华大学`
   - ProQuest: `Access provided by Tsinghua University`
   - EBSCO: `清华大学` in header
   - T&F: `Access through` after SSO
3. If access not shown:
   - ScienceDirect: click "Access through Tsinghua University" → CAS auto-completes
   - Wiley: click "Login/Register" → "Institutional login" → click "Tsinghua University" → CAS auto-completes
   - T&F: navigate to `/action/ssostart?redirectUri=<article-path>` → CAS auto-completes
   - ProQuest/EBSCO: navigate to the Shibboleth URL → CAS auto-completes
   - JSTOR: navigate to `doi.org/<DOI>` → auto-detects CAS
4. If CAS login page appears and credentials are auto-filled, click login once (with user authorization). If not auto-filled, pause and ask the user.

### 1.5 Verify Warmup

After warmup, verify each publisher by checking one article page shows institutional access text.

---

## Phase 2: Per-Paper Download

With session warmed, each paper follows this fast path:

### 2.1 Identify the Best Route

Use the layered fallback strategy from `lessons.md`:

| Priority | Route | When |
|----------|-------|------|
| 1 | Alma resolver | Automation preferred; `https://tsinghua.alma.exlibrisgroup.com.cn/view/uresolver/86THU_INST/openurl?rft_id=info:doi/<DOI>&svc_dat=single_service` |
| 2 | Primo 水木搜索 | Alma fails; URL needs `search_scope=default_scope` |
| 3 | Publisher direct | Primo has no record (common for Wiley, EBSCO-hosted journals) |

Consult `lessons.md` for the publisher-specific playbook before opening any page.

### 2.2 Open and Download

1. Navigate Chrome to the article page (via Alma, Primo link, or direct).
   - If Cloudflare unexpectedly appears → run mid-session recovery (see below).
   - If CAS appears → credentials should be auto-filled; click login (with authorization) or ask user.
2. Extract or click the PDF link following the publisher's playbook in `lessons.md`.
3. Fetch the PDF bytes from the browser context. Use one of:
   - `scripts/browser_pdf_downloader.mjs` for URL-based downloads
   - Direct `/eval` fetch for same-origin PDFs (Wiley `pdfdirect`, JSTOR `/stable/pdf`, T&F `/doi/pdf`)
   - CDS URL extraction for EBSCO (monitor `performance.getEntriesByType("resource")`)
   - PDF.js extraction for ProQuest (`iframe.contentWindow.PDFViewerApplication.pdfDocument.getData()`)
4. Save to the user's target folder.

### 2.3 Verify and Log

```bash
python scripts/extract_pdf_text.py --pdf "<path>" --pages 3
```

Check: file exists, `%PDF` header, page count > 0, extracted text includes title.

Update `download-log.tsv`:

```text
paper	source_database	download_success	failure_reason
<title | authors | year | DOI>	<source>	yes	
```

### Primo Field Notes

1. Skip empty `href` values. The first online-full-text match can be a facet toggle.
2. Primo is an Angular SPA: wait 6-10 seconds after navigation, retry link extraction up to 3 times.
3. If Primo redirects to login with "IP outside authorized range", record `ip_not_authorized`. User needs THU VPN/WebVPN.
4. If Primo has no PDF but has an online-full-text link, follow that route first.

---

## Mid-Session Recovery

If a publisher page unexpectedly shows Cloudflare during Phase 2:

1. Re-run Phase 1.3 for that specific publisher only (single FlareSolverr call → inject cookie).
2. Refresh the blocked tab.
3. If `cf_clearance` injection fails (UA mismatch), fall back to Phase 1.3 full flow.
4. If Cloudflare immediately reappears, escalate to user and log `cloudflare_flaresolverr_failed`.

CAS sessions last hours — they rarely need recovery.

---

## Publisher-Specific Playbooks (from lessons.md)

**Before attempting any download, identify the publisher/platform and consult `lessons.md` for the field-tested playbook.** The lessons file contains per-publisher workflows, URL patterns, authentication traps, and workarounds discovered through live testing.

### Publisher → Lessons Section Mapping

| Publisher / Platform | Lessons Section | Trigger |
|---|---|---|
| ScienceDirect (Elsevier) | `ScienceDirect 流程` | DOI `10.1016/...`, Primo "阅读全文" → sciencedirect.com |
| Wiley | `Wiley 流程` | DOI `10.1002/...` or `10.1111/...` |
| EBSCO (any) | `EBSCO 流程` | Primo 无记录、EBSCO 有收录 |
| ProQuest (APA) | `ProQuest / APA 流程` | APA 期刊 `10.1037/...` |
| SAGE | `SAGE 流程` | DOI `10.1177/...`；用 `sage.cnpereading.com`，**不要用** `journals.sagepub.com` |
| Taylor & Francis | `Taylor & Francis 流程` | DOI `10.1080/...` |
| JSTOR | `JSTOR 流程` | DOI `10.2307/...` |
| INFORMS | → `EBSCO 流程` | DOI `10.1287/...` |
| Annual Reviews | `Annual Reviews 流程` | DOI `10.1146/...` |
| IEEE Xplore | `IEEE Xplore 路由` | Unexpected routing from Alma/Primo |

Also consult `全局关键经验` in lessons.md for:
- Primo URL migration and scope switching
- CAS session sharing across publishers
- PDF chunk-transfer pattern for large files

### How to Use Lessons

1. **Match the DOI prefix to a publisher**, or check Primo's result to identify the database.
2. **Read the corresponding section in `lessons.md`** before making any request.
3. **Follow the "标准步骤" table** as the primary path.
4. **Read the "关键教训"** to avoid known traps (wrong URL, wrong auth mode, wrong domain).
5. **Fallback**: If the playbook fails, note the deviation in `download-log.tsv` and update lessons.md after resolving.

---

## FlareSolverr Technical Reference

Used by Phase 1.3 for cookie injection. Two modes:

### Mode A: Cookie Injection (Phase 1.3 uses this)

```bash
curl -s http://localhost:8191/v1 -H "Content-Type: application/json" \
  -d '{"cmd":"request.get","url":"<blocked URL>","maxTimeout":60000,"returnOnlyCookies":true}'
```
Returns `{ solution: { cookies: [{name, value, domain, ...}] } }`. Inject `cf_clearance` into Chrome via CDP:
```javascript
document.cookie = "<name>=<value>; domain=<domain>; path=/; secure";
```

Risk: `cf_clearance` may be UA-bound. FlareSolverr's UA differs from real Chrome. If injection fails, try Mode B or escalate.

### Mode B: Content Extraction (fallback)

Same request without `returnOnlyCookies`. Extract PDF links from `solution.response` HTML, then navigate Chrome directly to them. PDF CDNs rarely have Cloudflare.

---

## Simple Log

Tab-separated `download-log.tsv`:

```text
paper	source_database	download_success	failure_reason
```

Field rules:

1. `paper`: compact bibliographic info, preferably `title | authors | year | DOI`.
2. `source_database`: `Primo`, `ScienceDirect`, `Wiley`, `EBSCOhost Business Source Complete`, `JSTOR`, `SAGE`, `Taylor & Francis`, `INFORMS`, `ProQuest APA PsycNET`, or `unknown`.
3. `download_success`: `yes` or `no`.
4. `failure_reason`: empty when successful; otherwise a concrete reason.

### Failure Reasons

```text
cas_waiting_user
cas_resolved_retry_needed
publisher_verification_waiting_user
sciencedirect_robot_check
retry_after_user_verification
do_not_auto_retry
url_needs_repair
primo_no_link
publisher_blocked_waiting_user
no_authorized_pdf_found
failed_after_retry
ip_not_authorized
purchase_required
not_pdf_response
cloudflare_flaresolverr_solved
cloudflare_flaresolverr_failed
```

Use `cas_waiting_user` only when visibly at Tsinghua CAS / institutional SSO. Not a final failure.

Use `publisher_verification_waiting_user` or `sciencedirect_robot_check` when a publisher shows "Are you a robot?", CAPTCHA, or similar. Not a final failure, but do not auto-solve.

---

## Start Chrome Control

Use the web-access CDP proxy at `http://127.0.0.1:3456`.

Test:
```bash
curl http://127.0.0.1:3456/targets
```

If this hangs or fails, ask the user to confirm the remote debugging checkbox.

## Core CDP Proxy API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Proxy health and Chrome connection status |
| `/targets` | GET | List open Chrome tabs |
| `/new` | POST body=URL | Create a new background tab |
| `/navigate?target=...` | POST body=URL | Navigate an existing tab |
| `/close?target=...` | GET | Close a tab |
| `/info?target=...` | GET | Get page title, URL, and readyState |
| `/eval?target=...` | POST body=JS | Execute JavaScript in a tab and return `{ value: ... }` |
| `/clickAt?target=...` | POST body=CSS selector | Click the center of a visible element |

Use `/navigate` rather than `/new` for Primo URLs containing `#!` fragments. Pass the target URL in the POST body.

---

## CAS SSO Handoff

When a paper reaches a CAS or institutional SSO page:

1. Stop automated actions on that tab.
2. Record the paper with `failure_reason=cas_waiting_user`.
3. Tell the user which tab needs attention.
4. Do not read, store, or request the password, QR result, OTP, SMS code, CAPTCHA, cookie, or local/session storage.
5. If the user explicitly authorizes clicking because the CAS credentials are already filled in Chrome, click the visible THU CAS login/confirm button once. Do not type into fields.
6. If QR login, SMS/OTP, CAPTCHA, or publisher bot verification appears, stop and let the user complete it manually.
7. After the login/confirm step, refresh or continue from the same tab.
8. If it loops back to CAS after login, record `failed_after_retry` and move on.

---

## Download PDF From Browser Context

### Using browser_pdf_downloader.mjs

```bash
node scripts/browser_pdf_downloader.mjs \
  --url "https://..." \
  --out "downloads/paper.pdf"
```

Options: `--target <id>` (use existing tab), `--close` (close tab after), `--allow-non-pdf`.

### Page-Context Fetch Pattern

```javascript
const result = await proxyEval(targetId, `(async()=>{
  const r = await fetch("${pdfUrl}", { credentials: "include" });
  const ab = await r.arrayBuffer();
  window.__thuPdfBytes = Array.from(new Uint8Array(ab));
  return { ok: r.ok, ct: r.headers.get("content-type"), size: ab.byteLength, head: window.__thuPdfBytes.slice(0, 8) };
})()`);
```

Transfer `window.__thuPdfBytes` in chunks through `/eval`, assemble, and write to disk.

---

## Verification and Reading

```bash
python scripts/extract_pdf_text.py --pdf "downloads/paper.pdf" --pages 3
```

Minimum verification:
- File exists and size is plausible.
- First bytes are `%PDF`.
- Page count is nonzero.
- Extracted text includes the article title.

---

## Common Pitfalls

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Primo opens `about:blank` | `#!` fragment stripped | Use `/navigate` with fully encoded URL |
| First Primo link does nothing | Empty `href` facet toggle | Skip empty links, retry after SPA render |
| CAS auto-click fails | Credentials not filled or login loop | Stop after one authorized click, ask user |
| Wiley fetch returns empty | Wrong Wiley origin (subdomain) | Fetch from article page's own `location.origin` |
| SD `View PDF` opens wrong article | Reference-section PDF link | Match PII, pick top-toolbar link |
| `pdf.sciencedirectassets.com` fetch fails | Signed S3 URL expired | Ask user to re-click `View PDF` |
| RSC PDF returns 404 or purchase page | No authorized access | Record `no_authorized_pdf_found` or `purchase_required` |
