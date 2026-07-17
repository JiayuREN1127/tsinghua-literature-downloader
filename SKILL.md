---
name: tsinghua-literature-downloader
description: Use this skill whenever the user wants to use their own logged-in Tsinghua University Library, WebVPN, 水木学术搜索, ScienceDirect, publisher, or Chrome session to legally search, download, organize, retry, and read academic PDFs. Trigger on requests like "用清华图书馆下载文献", "WebVPN 下载 PDF", "水木学术搜索下载文献", "ScienceDirect 人机验证后继续", or "帮我下载这几篇论文".
metadata:
  compatibility: Requires a local Chrome session logged in by the user, Chrome remote debugging permission, and Node.js 22+. Uses only user-authorized access.
---

# 清华大学文献下载工具

This skill turns the verified workflow into a repeatable, legally scoped process for finding, downloading, and reading papers through the user's Tsinghua University Library / WebVPN access.

## Boundaries

Use only the user's legitimate institutional access. Do not bypass paywalls, DRM, CAPTCHA, Cloudflare, publisher bot checks, or two-factor authentication. If a page asks for CAPTCHA, QR login, SMS/OTP, Cloudflare, publisher bot checks, or a security challenge, stop and ask the user to complete it in Chrome.

Avoid mass downloading. Work in small batches, preferably after the user confirms the paper list. Leave a clear audit trail of what was downloaded, from where, and whether supporting information was found.

Do not ask the user to paste institutional passwords, CAS credentials, OTP codes, recovery codes, or session tokens into chat or terminal. If the user offers a password, decline and use the handoff-login workflow instead.

Exception for THU CAS saved-login pages: if the user explicitly says that Chrome has already filled the THU CAS credentials and authorizes clicking the login/confirm button, the agent may click that button once on the THU CAS/WebVPN/institutional SSO page without reading, copying, or typing any credential. This exception does not apply to CAPTCHA, QR login, SMS/OTP, publisher bot checks, or any page outside the expected institutional login flow.

Do not inspect or export cookies, passwords, local storage, browser profiles, or session files. Use the browser's already-authenticated page context only.

## Preconditions

Before attempting downloads, confirm these conditions:

1. Chrome is open on the user's machine.
2. The user has personally logged in to Tsinghua University Library / 水木学术搜索 in Chrome.
   - Start page: `https://tsinghua-primo.hosted.exlibrisgroup.com/primo-explore/search?vid=86THU&lang=zh_CN`
3. Chrome remote debugging is allowed for the current browser instance.
   - Ask the user to open `chrome://inspect/#remote-debugging`.
   - They must enable "Allow remote debugging for this browser instance".
4. Node.js 22+ is available.
5. The web-access CDP proxy is available or can be started:
   ```bash
   cd tsinghua-literature-downloader && node start.js
   ```
6. The user has approved the target output folder.

## Status Categories

Classify every paper into one of these statuses, and keep the status in the manifest:

```text
downloaded
downloaded_with_si
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
| `/new?url=...` | GET | Create a new background tab |
| `/navigate?target=...&url=...` | GET | Navigate an existing tab |
| `/close?target=...` | GET | Close a tab |
| `/info?target=...` | GET | Get page title, URL, and readyState |
| `/eval?target=...` | POST body=JS | Execute JavaScript in a tab and return `{ value: ... }` |
| `/clickAt?target=...` | POST body=CSS selector | Click the center of a visible element |

Use `/navigate` rather than `/new` for Primo URLs containing `#!` fragments. If a `#!` fragment is stripped, Chrome may open `about:blank` or a wrong page.

## Recommended Search Workflow

Prefer the library discovery route before direct publisher pages. It is more stable and less likely to trigger bot protection.

1. Search by DOI or exact title in 水木学术搜索 (Primo):
   - `https://tsinghua-primo.hosted.exlibrisgroup.com/primo-explore/search?vid=86THU&lang=zh_CN&query=any,contains,<URL-encoded DOI or title>`
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

### Primo Field Notes

When extracting PDF, online full text, or publisher links from Primo:

1. Skip empty `href` values. The first online-full-text match can be a facet toggle rather than a real link.
2. Treat Primo as a slow SPA: wait about 6-10 seconds after navigation, then retry link extraction up to 3 times with short pauses.
3. If Primo redirects to a login page and says the IP is outside the authorized range, record `ip_not_authorized`. The user may need the THU VPN/WebVPN client.
4. If Primo has no PDF but has an online-full-text link, follow that route before constructing a publisher URL manually.

## Publisher-Specific Patterns

Use these as DOI-based repair hints only after confirming the paper identity. Do not claim access if the page or PDF is not actually verified.

### ACS Publications

For DOI prefix `10.1021/...`:

```text
https://pubs.acs.org/doi/pdf/<doi>
```

ACS supporting information often follows:
```text
https://pubs.acs.org/doi/suppl/<doi>/suppl_file/<journal-code>_si_001.pdf
```

### Wiley

For DOI prefixes such as `10.1002/...` or `10.1111/...`, first navigate to the authenticated Wiley article page, then fetch from that page's own origin:

```text
<location.origin>/doi/pdfdirect/<doi>?download=true
```

Do not hardcode `onlinelibrary.wiley.com`: Primo may authenticate through a subdomain, and cross-origin fetches can fail.

### Springer Nature

For DOI prefixes such as `10.1007/...` and `10.1186/...`:

```text
https://link.springer.com/content/pdf/<doi>.pdf
```

### Nature Communications

For OA DOI patterns such as `10.1038/s41467-...`:

```text
https://www.nature.com/articles/<article-id>.pdf
```

Extract `<article-id>` from the DOI suffix.

### bioRxiv

For DOI prefix `10.1101/...`:

```text
https://www.biorxiv.org/content/<doi>v1.full.pdf
```

### Frontiers

For DOI prefix `10.3389/...`:

```text
https://www.frontiersin.org/articles/<doi>/pdf
```

### RSC Publishing

For DOI prefix `10.1039/...`, do not assume THU has authorized full-text access. If PDF links return 404 or purchase pages, inspect the article page and record `no_authorized_pdf_found` or `purchase_required`.

## Publisher Verification and ScienceDirect

ScienceDirect and some publisher platforms may show "Are you a robot?", CAPTCHA, Cloudflare, bot verification, or similar checks after repeated direct DOI navigation or automated tab opening. These are security and anti-automation challenges, not ordinary login confirmations.

Reduce the chance of triggering them by using a conservative access pattern:

1. Prefer 水木学术搜索 / WebVPN / library `在线全文` links before direct `doi.org -> publisher` navigation.
2. Process ScienceDirect and other sensitive publishers one article at a time.
3. Keep a visible audit trail in the manifest; do not open many publisher tabs in parallel.
4. Wait for each page to settle before looking for `Download PDF`, `View PDF`, or `PDF`.
5. Reuse the same tab after the user completes a verification step instead of opening repeated new tabs.
6. Avoid retry loops. One failed automatic attempt is enough before handing the page to the user.

When a publisher verification page appears:

1. Stop automated actions on that tab.
2. Record the paper in the manifest with status `publisher_verification_waiting_user`; use `sciencedirect_robot_check` for ScienceDirect's "Are you a robot?" page.
3. Tell the user which paper and tab need manual attention.
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
2. Record the paper with status `cas_waiting_user`.
3. Tell the user exactly which tab/page needs attention, for example: "This paper is at THU CAS. If Chrome has already filled the account and password, I can click the login/confirm button once with your authorization; otherwise please complete it in Chrome."
4. Do not read, store, or request the password, QR result, OTP, SMS code, CAPTCHA, cookie, or local/session storage.
5. If the user explicitly authorizes clicking because the CAS credentials are already filled in Chrome, click only the visible THU CAS/WebVPN/institutional SSO login/confirm button once. Do not type into fields or inspect hidden credential values.
6. If QR login, SMS/OTP, CAPTCHA, Cloudflare, or publisher bot verification appears, stop and let the user complete it manually.
7. After the login/confirm step completes, refresh or continue from the same tab.
8. Re-detect whether the page is now a publisher article page, a PDF viewer, or another institutional handoff.
9. If resolved, download and verify the PDF/SI, then update the manifest status to `downloaded` or `downloaded_with_si`.
10. If it loops back to CAS after a completed user login, record `failed_after_retry` with the observed reason and move on.

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
- Save a small manifest with DOI, title, source URL, and download date.

## Failure Handling

If direct publisher navigation triggers ScienceDirect "Are you a robot?", Cloudflare, CAPTCHA, or another bot challenge:

- Do not bypass it.
- Do not auto-click the challenge.
- Record `publisher_verification_waiting_user` or `sciencedirect_robot_check`.
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
