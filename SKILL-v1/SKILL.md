---
name: tsinghua-literature-downloader
description: Use this skill whenever the user wants to use their own logged-in Tsinghua University Library, WebVPN, 水木学术搜索, ScienceDirect, publisher, or Chrome session to legally search, download, organize, retry, and read academic PDFs. Trigger on requests like "用清华图书馆下载文献", "WebVPN 下载 PDF", "水木学术搜索下载文献", "ScienceDirect 人机验证后继续", or "帮我下载这几篇论文".
metadata:
  compatibility: Requires a local Chrome session logged in by the user, Chrome remote debugging permission, and Node.js 22+. Uses only user-authorized access.
---

# 清华大学文献下载工具（统一版）

This skill turns the verified workflow into a repeatable, legally scoped process for finding, downloading, and reading papers through the user's Tsinghua University Library / WebVPN access.

## Boundaries

Use only the user's legitimate institutional access. Do not bypass paywalls, DRM, CAPTCHA, two-factor authentication, or publisher login gates.

Do not use Sci-Hub, Library Genesis, or any other paywall-bypass or pirate mirror sites. If a paper cannot be accessed through Tsinghua University Library / WebVPN / Primo / publisher institutional access, record `no_authorized_pdf_found` and move on. Do not search for unauthorized copies.

Cloudflare JS Challenge ("Checking your browser...") is an automated browser test, not a human verification. FlareSolverr may be used to resolve it programmatically. Cloudflare Turnstile (checkbox), CAPTCHA (image grid), QR login, SMS/OTP, and publisher bot checks must still be escalated to the user in Chrome.

Avoid mass downloading. Work in small batches, preferably after the user confirms the paper list. Leave a clear audit trail of what was downloaded, from where, and whether supporting information was found.

Do not ask the user to paste institutional passwords, CAS credentials, OTP codes, recovery codes, or session tokens into chat or terminal. If the user offers a password, decline and use the handoff-login workflow instead.

Exception for THU CAS saved-login pages: if the user explicitly says that Chrome has already filled the THU CAS credentials and authorizes clicking the login/confirm button, the agent may click that button once on the THU CAS/WebVPN/institutional SSO page without reading, copying, or typing any credential. This exception does not apply to CAPTCHA, QR login, SMS/OTP, publisher bot checks, or any page outside the expected institutional login flow.

Do not inspect or export cookies, passwords, local storage, browser profiles, or session files. Use the browser's already-authenticated page context only.

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
   - Verify: `curl -s --max-time 3 http://localhost:8191/v1 -H "Content-Type: application/json" -d '{"cmd":"sessions.list"}'`
    - If they decline, proceed without it — Cloudflare challenges will be escalated to the user.

## Session Warmup (Phase 1)

Run this phase once per session, after confirming preconditions and before per-paper downloads.
It resolves Cloudflare and activates CAS for all publishers upfront, so per-paper downloads proceed without interruptions.

### 1.1 Identify Target Publishers

Inspect the paper list for DOI prefixes. Cloudflare-protected publishers requiring pre-clearance:

| Publisher | DOI prefix | Domain for cf_clearance |
|-----------|-----------|--------------------------|
| ScienceDirect | `10.1016/` | `.sciencedirect.com` |
| Wiley | `10.1002/`, `10.1111/` | `.onlinelibrary.wiley.com` |
| Taylor & Francis | `10.1080/` | `.tandfonline.com` |

Publishers without Cloudflare (CAS-only, warmup still needed): ProQuest, EBSCO, JSTOR, SAGE, Annual Reviews, IEEE.

### 1.2 Check FlareSolverr Availability

```bash
curl -s --max-time 3 http://localhost:8191/v1 -H "Content-Type: application/json" \
  -d '{"cmd":"sessions.list"}' 2>/dev/null
```

If unavailable, skip Cloudflare clearance — those challenges will be handled per-paper.

### 1.3 Clear Cloudflare for Each Protected Publisher

For each Cloudflare-protected publisher in the paper list:

1. Pick any article URL on that publisher's domain.
2. Request FlareSolverr to resolve it and return only cookies (see "FlareSolverr Cloudflare Handling → Mode A" for commands).
3. Extract the `cf_clearance` cookie from `solution.cookies`.
4. Open a new Chrome tab, navigate to `https://<publisher-domain>`.
5. Inject the cookie: `document.cookie = "cf_clearance=<value>; domain=<domain>; path=/; secure";`

### 1.4 Trigger CAS for Each Publisher

For each publisher in the paper list (Cloudflare-protected or not):

1. Navigate to one article page on that publisher.
2. Check for institutional access indicators (see publisher-specific playbooks in lessons.md).
3. If access not shown, trigger SHIBBOLETH/CAS as documented in the publisher's playbook.
4. If CAS login page appears with auto-filled credentials, click login once (with user authorization). If not auto-filled, pause and ask the user.

### 1.5 Verify Warmup

Verify each publisher by checking one article page shows institutional access text. If any publisher fails, re-run its CAS trigger step.

## Operating Model

Use a small, traceable batch workflow:

1. Normalize the paper list before opening publisher pages.
   - Required paper information: title or DOI.
   - Preferred paper information: title, authors, year, DOI, and expected source database if the user provides it.
2. Create or reuse the target output folder.
   - Default PDF folder: `downloads/`.
   - Default log file: `download-log.tsv`.
3. Process one paper at a time unless the user explicitly approves a small batch.
4. Search through Tsinghua Primo / 水木学术搜索 first.
5. Follow library `PDF`, `在线全文`, `Full Text`, or `View PDF` routes before trying direct publisher DOI templates.
6. If the page shows Cloudflare JS Challenge ("Checking your browser..." / "正在进行安全验证"):
   - Check if FlareSolverr is available (`curl -s --max-time 3 localhost:8191/v1`).
   - If available, attempt FlareSolverr resolution (see "FlareSolverr Cloudflare Handling" below).
   - If unavailable, stop and ask the user to complete in Chrome.
   - For CAPTCHA, Turnstile checkbox, institutional login, or publisher bot checks, always escalate to user.
7. Save only verified PDF files. Do not mark a paper as downloaded until the local file exists and passes the verification checklist.

## Simple Log

Keep the log intentionally small. Use tab-separated `download-log.tsv` with exactly these fields:

```text
paper	source_database	download_success	failure_reason
```

Field rules:

1. `paper`: compact bibliographic information, preferably `title | authors | year | DOI`.
2. `source_database`: the database or route used, such as `Primo`, `ScienceDirect`, `Wiley`, `EBSCOhost Business Source Complete`, `JSTOR`, `SAGE`, `Taylor & Francis`, `INFORMS`, `ProQuest APA PsycNET`, or `unknown`.
3. `download_success`: `yes` or `no`.
4. `failure_reason`: empty when successful; otherwise use a concrete reason such as `primo_no_link`, `cas_waiting_user`, `sciencedirect_robot_check`, `publisher_verification_waiting_user`, `no_authorized_pdf_found`, `purchase_required`, `failed_after_retry`, or `not_pdf_response`.

Example:

```text
paper	source_database	download_success	failure_reason
The neglected role of proactive behavior and outcomes in newcomer socialization | Saks et al. | 2011 | 10.1016/j.jvb.2010.12.007	ScienceDirect	no	sciencedirect_robot_check
```

## Failure Reasons

Use these values as `failure_reason` entries in the simplified log when `download_success=no`:

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

Use `cas_waiting_user` only when the browser is visibly at Tsinghua University CAS / unified identity authentication or an equivalent institutional SSO step. Do not treat this as a final failure.

Use `publisher_verification_waiting_user` or `sciencedirect_robot_check` when a publisher page shows "Are you a robot?", CAPTCHA, Cloudflare, bot verification, or another anti-automation challenge. Do not treat this as a final failure, but do not try to solve it automatically.

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

Use `/navigate` rather than `/new` for Primo URLs containing `#!` fragments. If a `#!` fragment is stripped, Chrome may open `about:blank` or a wrong page. For `/new` and `/navigate`, pass the target URL in the POST body rather than the query string.

## Recommended Search Workflow

Prefer the library discovery route before direct publisher pages. It is more stable and less likely to trigger bot protection.

1. Search by DOI or exact title in 水木学术搜索 (Primo):
   - `https://tsinghua-primo.hosted.exlibrisgroup.com.cn/primo-explore/search?vid=86THU&lang=zh_CN&query=any,contains,<URL-encoded DOI or title>`
2. Open Primo URLs through `/navigate` to preserve `#!` fragments.
3. Read the result page with `/eval`.
4. Extract links whose visible text or `aria-label` is:
   - `PDF`
   - `在线全文`
   - `Full Text`
   - `View PDF`
   - publisher-specific full-text entries
5. Prefer the result's `PDF` link when present.
6. Open the PDF link in a new background tab through the CDP proxy.
7. If the publisher shows a security challenge, ask the user to complete it manually.
8. Once the PDF is visible in Chrome, use `scripts/browser_pdf_downloader.mjs` to save it from the authenticated browser context.

## Per-Paper Workflow

For each paper:

1. Identify the best query.
   - Use DOI first when available.
   - If DOI returns no result in Primo, retry with the complete title.
2. Record the source database and look up its playbook.
    - If Primo shows a vendor label or resolver route, use that vendor name.
    - If the source is inferred from DOI or publisher page, record the inferred source but do not treat it as verified access.
    - **Consult `lessons.md`** for the publisher-specific playbook before proceeding. Look up the section matching the publisher (see table in "Publisher-Specific Playbooks" above).
3. Open the library route in Chrome through the CDP proxy.
4. Classify the page state.
   - Result with PDF/full-text link: continue.
   - CAS/SSO: mark `cas_waiting_user` and pause for user action.
   - CAPTCHA/Cloudflare/bot page: mark `publisher_verification_waiting_user` or `sciencedirect_robot_check`.
   - No usable link: mark `primo_no_link` or `no_authorized_pdf_found`.
5. Download only after a PDF page or PDF response is visible from the authenticated browser context.
6. Verify the file and update the simplified log.

### Primo Field Notes

When extracting PDF, online full text, or publisher links from Primo:

1. Skip empty `href` values. The first online-full-text match can be a facet toggle rather than a real link.
2. Treat Primo as a slow SPA: wait about 6-10 seconds after navigation, then retry link extraction up to 3 times with short pauses.
3. If Primo redirects to a login page and says the IP is outside the authorized range, record `ip_not_authorized`. The user may need the THU VPN/WebVPN client.
4. If Primo has no PDF but has an online-full-text link, follow that route before constructing a publisher URL manually.

## FlareSolverr Cloudflare Handling (Optional)

This section applies only when FlareSolverr is running on `localhost:8191`. If unavailable, skip this section entirely — Cloudflare challenges are escalated to the user as normal.

**Check before use:**
```bash
curl -s --max-time 3 http://localhost:8191/v1 -H "Content-Type: application/json" \
  -d '{"cmd":"sessions.list"}' | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status')=='ok' else 1)" 2>/dev/null && echo "FlareSolverr available" || echo "FlareSolverr unavailable — escalate to user"
```

When FlareSolverr is available, Cloudflare JS Challenge pages can be resolved without user intervention. Two modes are tried in order:

### Cloudflare Detection

Before escalating to the user, check if the page is a Cloudflare JS Challenge (auto-resolvable) vs. something requiring human input:

```javascript
const pageText = await proxyEval(targetId, `document.body.innerText.slice(0, 500)`);
const isCloudflareJS = /checking.*browser|checking if the site connection is secure|just a moment/i.test(pageText);
const isCaptcha = /captcha|verify you are human|select all|are you a robot/i.test(pageText);
```

- `isCloudflareJS && !isCaptcha` → attempt FlareSolverr resolution
- `isCaptcha` → escalate to user (FlareSolverr's CAPTCHA solvers are broken per upstream docs)

### Mode A: Cookie Injection (preferred)

1. Send the blocked URL to FlareSolverr:
   ```bash
   curl -s http://localhost:8191/v1 -H "Content-Type: application/json" \
     -d '{"cmd":"request.get","url":"<blocked URL>","maxTimeout":60000,"returnOnlyCookies":true}'
   ```
2. FlareSolverr returns `{ solution: { cookies: [{name, value, domain, ...}] } }`.
3. Inject each cookie into the blocked Chrome tab via CDP:
   ```javascript
   document.cookie = "<name>=<value>; domain=<domain>; path=/; secure";
   ```
4. Reload the tab: `location.reload()`.
5. Chrome now passes Cloudflare (via injected clearance cookies) and retains its Tsinghua CAS cookies for institutional auth.

**Risk**: Cloudflare may tie `cf_clearance` to the User-Agent. FlareSolverr uses a headless Chrome UA that differs from the user's real Chrome UA. If Cloudflare's UA binding is strict, Mode A fails — proceed to Mode B.

### Mode B: Content Extraction (fallback)

1. Send the blocked URL to FlareSolverr without `returnOnlyCookies` — it returns the full page HTML.
2. Extract relevant links from `solution.response`:
   - For ScienceDirect: find the article PII-based "View PDF" link or `pdf.sciencedirectassets.com` signed URL
   - For T&F: find `/doi/pdf/<DOI>?download=true`
   - For SAGE: find `/storage/sage/journal/article/.../unzip/<DOI>.pdf`
3. Navigate the user's Chrome directly to the extracted link. PDF CDNs (`pdf.sciencedirectassets.com`, `sage.cnpereading.com`) rarely have Cloudflare.
4. If the PDF CDN also triggers Cloudflare, fall back to manual user resolution.

### Failure Codes

Add these to `download-log.tsv`:

```text
cloudflare_flaresolverr_solved     (Mode A or B succeeded)
cloudflare_flaresolverr_failed     (neither mode worked — escalate to user)
```

### Detection in Per-Paper Flow

During step 4 (classify page state), insert Cloudflare detection before marking `publisher_verification_waiting_user`:

1. If page shows Cloudflare JS Challenge → attempt FlareSolverr (Mode A → Mode B)
2. If FlareSolverr succeeds → continue to download
3. If FlareSolverr fails or page shows CAPTCHA/Turnstile → escalate to user

## Publisher-Specific Playbooks (from lessons.md)

**Before attempting any download, identify the publisher/platform and consult `lessons.md` for the field-tested playbook.** The lessons file contains per-publisher workflows, URL patterns, authentication traps, and workarounds discovered through live testing. Do not guess a URL pattern when a proven one exists in the lessons.

### Publisher → Lessons Section Mapping

Use this mapping to look up the right section in `lessons.md`:

| Publisher / Platform | Lessons Section | Trigger |
|---|---|---|
| ScienceDirect (Elsevier) | `ScienceDirect 流程总结` | DOI `10.1016/...`, Primo "阅读全文" → sciencedirect.com |
| Wiley | `Wiley 流程总结` | DOI `10.1002/...` or `10.1111/...`, Primo → onlinelibrary.wiley.com |
| EBSCO (any) | `EBSCO 流程总结` | Primo 无记录、EBSCO 有收录；Business Source Complete / Academic Search Ultimate |
| ProQuest (APA) | `ProQuest 流程总结` | APA 期刊 `10.1037/...`，Primo 无记录 |
| SAGE | `SAGE 中国镜像流程总结` | DOI `10.1177/...`；先用 `sage.cnpereading.com`，**不要用** `journals.sagepub.com` |
| Taylor & Francis | `Taylor & Francis 流程总结` | DOI `10.1080/...` |
| JSTOR | `JSTOR 流程总结` | DOI `10.2307/...`，Primo → jstor.org |
| INFORMS | `EBSCO 流程总结` | DOI `10.1287/...`，走 EBSCO Business Source Complete |

Also consult the `全局关键经验` section in lessons.md for:
- Primo (水木搜索) URL migration and scope switching
- CAS session sharing across publishers
- PDF chunk-transfer pattern for large files

### How to Use Lessons

1. **Match the DOI prefix to a publisher**, or check Primo's result to identify the database.
2. **Read the corresponding section in `lessons.md`** before making any request.
3. **Follow the "标准步骤" table** as the primary path.
4. **Read the "关键教训"** to avoid known traps (wrong URL, wrong auth mode, wrong domain).
5. **Fallback**: If the playbook fails, note the deviation in `download-log.tsv` and update lessons.md after resolving.

### DOI-Based URL Repair Hints (use only after checking lessons.md)

These patterns are quick reminders. Do not apply them without reading the lessons playbook first.

| Publisher | PDF URL Pattern |
|---|---|
| ACS | `https://pubs.acs.org/doi/pdf/<doi>` |
| Wiley | `<location.origin>/doi/pdfdirect/<doi>?download=true` |
| Springer | `https://link.springer.com/content/pdf/<doi>.pdf` |
| Nature OA | `https://www.nature.com/articles/<id>.pdf` |
| bioRxiv | `https://www.biorxiv.org/content/<doi>v1.full.pdf` |
| Frontiers | `https://www.frontiersin.org/articles/<doi>/pdf` |
| RSC | No guaranteed access; check page first |

## Publisher Verification and ScienceDirect

ScienceDirect and some publisher platforms may show "Are you a robot?", CAPTCHA, Cloudflare, bot verification, or similar checks after repeated direct DOI navigation or automated tab opening. These are security and anti-automation challenges, not ordinary login confirmations.

Reduce the chance of triggering them by using a conservative access pattern:

1. Prefer 水木学术搜索 / WebVPN / library `在线全文` links before direct `doi.org -> publisher` navigation.
2. Process ScienceDirect and other sensitive publishers one article at a time.
3. Keep a visible audit trail in `download-log.tsv`; do not open many publisher tabs in parallel.
4. Wait for each page to settle before looking for `Download PDF`, `View PDF`, or `PDF`.
5. Reuse the same tab after the user completes a verification step instead of opening repeated new tabs.
6. Avoid retry loops. One failed automatic attempt is enough before handing the page to the user.

When a publisher verification page appears:

1. Check the page type:
   - Cloudflare JS Challenge → attempt FlareSolverr (see "FlareSolverr Cloudflare Handling")
   - CAPTCHA, Turnstile, "Are you a robot?", or other challenge → stop automated actions on that tab
2. Record the paper in `download-log.tsv` with `download_success=no` and failure reason:
   - `cloudflare_flaresolverr_solved` if FlareSolverr resolved it
   - `cloudflare_flaresolverr_failed` if FlareSolverr could not resolve it
   - `publisher_verification_waiting_user` or `sciencedirect_robot_check` otherwise
3. If FlareSolverr failed or is unavailable, tell the user which paper and tab need manual attention.
4. Do not click CAPTCHA, Cloudflare, "Are you a robot?", bot-check, or similar challenge controls automatically.
5. After the user says the verification is complete, continue from the same tab and try the visible article/PDF route once.
6. If verification immediately reappears, mark `do_not_auto_retry` and move on.

### ScienceDirect / Elsevier Field-Tested Workflow

ScienceDirect can show a "please wait" interstitial after CDP navigation. That page is not always a CAPTCHA. First wait briefly and inspect visible text: only treat it as `sciencedirect_robot_check` when it actually shows "Are you a robot?", CAPTCHA, Cloudflare, or another verification challenge.

For Elsevier papers, a practical workflow is:

1. Resolve institutional access once per browser session. From an article page, use "Access through Tsinghua University" or the Shibboleth handoff to THU CAS if needed.
2. After successful access, authenticated article pages often show `Brought to you by: Tsinghua University Library`.
3. For a modest manual-attention batch, open the remaining Elsevier DOI/article tabs, then notify the user that those tabs need manual clicks. The user handles interstitials, CAPTCHA, CAS, or "Access through Tsinghua University" buttons.
4. After the user confirms, scan tabs for article pages containing both `Brought to you by` and `Tsinghua`.
5. Find the main article `View PDF` link carefully. ScienceDirect pages may contain reference-section `View PDF` links far down the page. Normalize whitespace with `a.textContent.replace(/\s/g, " ").trim() === "View PDF"`, then prefer the link nearest the top toolbar or matching the article PII.
6. When the user clicks `View PDF`, Chrome may open a new `pdf.sciencedirectassets.com` tab with a time-limited signed PDF URL. Download from that PDF tab with `fetch(location.href, { credentials: "include" })` and close the PDF tab after success.
7. If the PDF tab returns `Failed to fetch`, the signed URL may have expired. Ask the user to re-click `View PDF` on the article tab.

This is still a human-in-the-loop workflow. Do not automate CAPTCHA, bot checks, or security prompts, and do not open very large ScienceDirect batches.

## CAS SSO Handoff and Retry

Some publishers, especially Elsevier/ScienceDirect, Springer Nature, Nature Portfolio, Wiley, Taylor & Francis, Cell Press, and society platforms routed through Shibboleth/OpenAthens, may redirect to Tsinghua University CAS even when WebVPN is open. This is not a reason to ask for the user's password.

When a paper reaches a CAS or institutional SSO page:

1. Stop automated actions on that tab.
2. Record the paper in `download-log.tsv` with `download_success=no` and `failure_reason=cas_waiting_user`.
3. Tell the user exactly which tab/page needs attention, for example: "This paper is at THU CAS. If Chrome has already filled the account and password, I can click the login/confirm button once with your authorization; otherwise please complete it in Chrome."
4. Do not read, store, or request the password, QR result, OTP, SMS code, CAPTCHA, cookie, or local/session storage.
5. If the user explicitly authorizes clicking because the CAS credentials are already filled in Chrome, click only the visible THU CAS/WebVPN/institutional SSO login/confirm button once. Do not type into fields or inspect hidden credential values.
6. If QR login, SMS/OTP, CAPTCHA, Cloudflare, or publisher bot verification appears, stop and let the user complete it manually.
7. After the login/confirm step completes, refresh or continue from the same tab.
8. Re-detect whether the page is now a publisher article page, a PDF viewer, or another institutional handoff.
9. If resolved, download and verify the PDF, then update `download-log.tsv` with `download_success=yes`.
10. If it loops back to CAS after a completed user login, record `failed_after_retry` with the observed reason and move on.

## Mid-Session Recovery

If a publisher page unexpectedly shows Cloudflare during per-paper downloads:

1. Re-run section 1.3 for that specific publisher only (single FlareSolverr call → inject cookie).
2. Refresh the blocked tab.
3. If `cf_clearance` injection fails (UA mismatch), fall back to full FlareSolverr content extraction (Mode B).
4. If Cloudflare immediately reappears, escalate to user and log `cloudflare_flaresolverr_failed`.

CAS sessions last hours — they rarely need recovery. If CAS does expire, re-run section 1.4 for the affected publisher.

## Download PDF From Browser Context

Use the bundled script when a PDF URL opens in Chrome but direct download returns 403, 401, Cloudflare HTML, or a login page.

```bash
node scripts/browser_pdf_downloader.mjs \
  --url "https://pubs.acs.org/doi/pdf/10.1021/..." \
  --out "downloads/paper.pdf"
```

The script:

- Opens the URL in the user's controlled Chrome session unless `--target` is provided.
- Runs `fetch(location.href, { credentials: "include" })` inside the page.
- Transfers bytes in chunks through the local CDP proxy.
- Writes the binary file to disk.
- Verifies the `%PDF` signature by default.

Options:

```text
--url <url>          PDF URL to open and save
--target <targetId>  Existing Chrome target/tab id to use
--out <path>         Output PDF path
--proxy <url>        CDP proxy URL, default http://127.0.0.1:3456
--close              Close the tab after download if the script opened it
--allow-non-pdf      Save even when content does not start with %PDF
```

### Page-Context Fetch Pattern

For cases where the bundled script is not flexible enough:

```javascript
const init = await proxyEval(targetId, `(async()=>{
  const r = await fetch("${pdfUrl}", { credentials: "include" });
  const ab = await r.arrayBuffer();
  window.__thuPdfBytes = new Uint8Array(ab);
  return {
    ok: r.ok,
    ct: r.headers.get("content-type"),
    n: window.__thuPdfBytes.length,
    head: Array.from(window.__thuPdfBytes.slice(0, 8))
  };
})()`);

const head = Buffer.from(init.value.head).toString("ascii");
if (!head.startsWith("%PDF")) throw new Error("Not a PDF response");
```

Then transfer `window.__thuPdfBytes` in chunks through `/eval`.

## Verification and Reading

After downloading, verify every PDF.

```bash
python scripts/extract_pdf_text.py --pdf "downloads/paper.pdf" --pages 3
```

Minimum verification checklist:

- File exists and size is plausible.
- First bytes are `%PDF` for PDF files.
- Page count is nonzero.
- Extracted text includes the article title, abstract, or supporting information title.
- Update `download-log.tsv` with paper information, source database, success flag, and failure reason.

## Failure Handling

If direct publisher navigation triggers ScienceDirect "Are you a robot?", Cloudflare, CAPTCHA, or another bot challenge:

- For Cloudflare JS Challenge ("Checking your browser..." / "正在进行安全验证"): if FlareSolverr is available, attempt resolution (Mode A → Mode B) before escalating.
- For CAPTCHA, Turnstile checkbox, or "Are you a robot?": do not bypass or auto-click.
- Record `publisher_verification_waiting_user` or `sciencedirect_robot_check` if FlareSolverr is unavailable or fails.
- Ask the user to solve it in Chrome.
- Then continue once from the same now-open page.
- If the same challenge immediately reappears, mark `do_not_auto_retry` and move on.

If `curl` or `fetch` returns 403 but the PDF opens in Chrome:

- Use `browser_pdf_downloader.mjs`; this is the normal institutional-access case.

If a page shows THU CAS, unified identity authentication, Shibboleth, OpenAthens, SAML, or institutional sign-in:

- Do not ask for or accept credentials in chat.
- If the user has explicitly authorized it and Chrome has already filled the THU CAS fields, click the visible login/confirm button once.
- Otherwise pause and ask the user to complete the login in Chrome.

If Primo shows no PDF:

- Try `在线全文`.
- Try DOI on the publisher page.
- Check open-access copies only from legitimate sources.
- Record `no_authorized_pdf_found` rather than seeking unauthorized mirrors.

If Primo or another site opens as `about:blank`:

- Treat it as a URL-fragment/encoding problem first, especially when the original URL contains `#!`.
- Reopen through `/navigate` with a fully encoded URL.

Common pitfalls:

| Problem | Likely cause | Practical fix |
|---------|--------------|---------------|
| Primo opens `about:blank` | `#!` fragment stripped | Use `/navigate` with a fully encoded URL |
| First Primo online-full-text link does nothing | Empty `href` facet toggle | Skip empty links and retry after SPA rendering |
| CAS auto-click does not work | Credentials not filled or login loop | Stop after one authorized click and ask the user to finish manually |
| Wiley fetch returns empty object or CORS error | Wrong Wiley origin | Fetch from the authenticated article page's own origin |
| ScienceDirect `View PDF` opens the wrong article | Reference-section PDF link selected | Normalize whitespace and choose the top toolbar/main-article link |
| `pdf.sciencedirectassets.com` fetch fails | Signed S3 URL expired | Ask user to re-click `View PDF` |
| RSC PDF URL returns 404 or purchase page | No authorized access | Record `no_authorized_pdf_found` or `purchase_required` |
