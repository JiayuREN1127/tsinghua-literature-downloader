---
name: tsinghua-literature-downloader
description: Use this skill whenever the user wants to use their own logged-in Tsinghua University Library, WebVPN, 水木学术搜索, ScienceDirect, publisher, or Chrome session to legally search, download, organize, retry, and read academic PDFs. Trigger on requests like "用清华图书馆下载文献", "WebVPN 下载 PDF", "水木学术搜索下载文献", "ScienceDirect 人机验证后继续", or "帮我下载这几篇论文".
metadata:
  compatibility: Requires a local Chrome session logged in by the user, Chrome remote debugging permission, and Node.js 22+. Uses only user-authorized access.
  version: 3.3-strategy-hardcoded
---

# 清华大学文献下载工具（v3.3 · strategy-hardcoded）

v3.3 = canonical version. Each database has **one hardcoded download strategy** (written dead at reusable granularity, since a given database's PDF-delivery + user-verification logic rarely changes). The agent groups the paper list by database, then downloads per-group. **The first paper of each group is a canary**: if its strategy does not walk through end-to-end, the agent aborts the whole group immediately and hands the decision to the user.

**Design principle — no fallback.** A strategy is either correct for a database or it is stale. Switching between click-download and fetch as a fallback burns tokens and hides a broken strategy. When a strategy breaks, the agent fixes it on-site (edits the action file) and stamps `updated_at` — it does NOT silently retry via an alternative method.

## What changed vs v3.2

- **Per-publisher strategy written dead.** No click/fetch fallback. One method per publisher/subtype. `strategies.tsv` is the single manifest (publisher / subtype / strategy / `last_tested` / `updated_at`).
- **Grouped download is canonical**, not optional. The whole flow is: classify list by database → warmup per group → canary first paper → batch the rest on the same tab.
- **Fail-fast canary.** First paper per group must walk through the hardcoded strategy end-to-end. If it fails → abort the group immediately, hand the user `failure_type + which paper + suggested fix line`.
- **`journal_database_mapping.md` is the classifier.** Map 期刊代码 → 首选数据库 before any navigation.
- **Core per-publisher access characteristics inlined** in this file (CAPTCHA, mirrors, most stable source) — they ARE the strategy, not side notes.
- **SAGE hardcoded to `cnpereading.com` domestic mirror** (faster; do not use `journals.sagepub.com`).
- Inherited unchanged: Network Security Guardrails (v3.2, incident-driven hard rules), Token Discipline (v3, probe library), FlareSolverr (safety-bound).

## Boundaries

Use only the user's legitimate institutional access. Do not bypass paywalls, DRM, CAPTCHA, two-factor authentication, or publisher login gates.

Do not use Sci-Hub, Library Genesis, or any other paywall-bypass or pirate mirror sites. If a paper cannot be accessed through Tsinghua University Library / WebVPN / Primo / publisher institutional access, record `no_authorized_pdf_found` and move on. Do not search for unauthorized copies.

Cloudflare JS Challenge ("Checking your browser...") is an automated browser test, not a human verification. FlareSolverr may be used to resolve it programmatically. Cloudflare Turnstile (checkbox), CAPTCHA (image grid), QR login, SMS/OTP, and publisher bot checks must still be escalated to the user in Chrome.

Avoid mass downloading. Work in small batches, preferably after the user confirms the paper list. Leave a clear audit trail of what was downloaded, from where, and whether supporting information was found.

Do not ask the user to paste institutional passwords, CAS credentials, OTP codes, recovery codes, or session tokens into chat or terminal. If the user offers a password, decline and use the handoff-login workflow instead.

Exception for THU CAS saved-login pages: if the user explicitly says that Chrome has already filled the THU CAS credentials and authorizes clicking the login/confirm button, the agent may click that button once on the THU CAS/WebVPN/institutional SSO page without reading, copying, or typing any credential. This exception does not apply to CAPTCHA, QR login, SMS/OTP, publisher bot checks, or any page outside the expected institutional login flow.

Do not inspect or export cookies, passwords, local storage, browser profiles, or session files. Use the browser's already-authenticated page context only.

## Network Security Guardrails (HARD RULES — inherited from v3.2, incident-driven)

> **Incident (2026-07-26):** A prior run of this skill launched `socat TCP-LISTEN:17897,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:7897` so a Docker container could reach the user's local Clash proxy. Binding to `0.0.0.0` exposed the proxy to the **entire campus network** — anyone on the same Wi-Fi could route traffic through the user's paid VPN. This triggered an institutional "私设代理" security alert with potential legal liability. **These rules exist so that can never happen again.**

These rules are **NON-NEGOTIABLE**. They override any convenience heuristic. If you are unsure whether a command violates them, STOP and ask the user before running it.

### Rule 1 — Never bind a listening port to all interfaces
Every local service you start (CDP proxy, FlareSolverr, socat, web server, probe helper, etc.) MUST listen on `127.0.0.1` (localhost only) or a single explicitly-chosen private VM-bridge IP. NEVER use `0.0.0.0`, `*`, `::`, a blank bind-address, or any `--host 0.0.0.0` / `bind=0.0.0.0` flag. If a command contains the literal string `0.0.0.0` in a `LISTEN` context, treat it as forbidden unless the user has explicitly approved that exact address for that exact command.

### Rule 2 — Never relay the user's VPN/proxy outward
NEVER forward the host's local proxy (e.g. Clash's mixed-port, conventionally `127.0.0.1:7897`) to a non-loopback address, via `socat`, `iptables`/`pf`, `ssh -L/-R`, `nginx`, `gost`, or any other relay tool. Exposing a paid VPN proxy on a shared network is what caused the security incident.

### Rule 3 — FlareSolverr: containerised is fine, but always bind to localhost
```bash
docker run -d --name flaresolverr \
  -p 127.0.0.1:8191:8191 \
  ghcr.io/flaresolverr/flaresolverr:latest
```
The `127.0.0.1:` prefix is MANDATORY. Never use a bare `-p 8191:8191` (defaults to `0.0.0.0`). If the container cannot resolve hostnames, fix the root cause: set the proxy inside the container via `http://host.docker.internal:<proxy-port>` (no port exposure, no hardcoded IP) and/or pass `--dns <resolver>`. NEVER bridge the host proxy onto `0.0.0.0` or a VM-bridge IP — that is exactly the 2026-07-26 incident.

### Rule 4 — Pre-flight check before ANY background networking command
Before running any background process that opens a network port, you MUST: (1) state which port and bind address; (2) confirm the bind is `127.0.0.1`; (3) if it is `0.0.0.0`/`*`/all-interfaces, STOP and ask the user.

### Rule 5 — Cleanup is mandatory
Any background networking process started during a session MUST be killed at the end of the session or on error. Track the PID when you start it, and kill it before reporting completion.

## Preconditions

1. Chrome is open; the user has personally logged in to Tsinghua University Library / 水木学术搜索.
   - Start page: `https://tsinghua-primo.hosted.exlibrisgroup.com.cn/primo-explore/search?vid=86THU&lang=zh_CN`
2. Chrome remote debugging is allowed (`chrome://inspect/#remote-debugging` → enable "Allow remote debugging for this browser instance").
3. Node.js 22+ is available.
4. The web-access CDP proxy is started: `cd <skill-folder> && node start.js`.
5. The user has approved the target output folder.
6. FlareSolverr is recommended for Cloudflare JS Challenge resolution (install per Rule 3; if declined, Cloudflare challenges escalate to the user).

## Start Chrome Control

Use the web-access CDP proxy at `http://127.0.0.1:3456`.

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

Use `/navigate` rather than `/new` for Primo URLs containing `#!` fragments. For `/new` and `/navigate`, pass the target URL in the POST body rather than the query string.

## Token Discipline (v3 — hard rules, inherited)

Every byte returned by `/eval` enters the agent's context and costs tokens. v1 blew up context by returning raw page HTML (100–500 KB/page).

### Hard rules
1. **Never** return `document.body.innerHTML`, `outerHTML`, or unbounded `innerText`/`textContent` from `/eval`. Always slice + normalize.
2. Every `/eval` must return a **compact JSON object, ≤ ~500 bytes**. Cap arrays (`.slice(0, N)`) and shorten strings (`.slice(0, 160)`).
3. **Prefer the probe library.** Run `node scripts/probe.mjs --target <id> --name <probeName>`; only the ~200-byte verdict enters context.
4. Use `classifyPage` first, then the publisher-specific probe. Fall back to raw `/eval` only for something no probe covers.
5. Never poll a page by re-reading content. Re-run the probe or check `/info`.
6. `probe.mjs` hard-clamps output at 5000 chars as a safety net.

### Probe → use map

| Situation | Probe |
|---|---|
| Any page, first look | `classifyPage` |
| Primo / Alma result page | `primo` |
| ScienceDirect article | `sciencedirect --arg pii=<PII>` |
| EBSCO / INFORMS | `ebsco` |
| Wiley article | `wiley --arg doi=<DOI>` |
| ProQuest / APA | `proquest` |
| SAGE | `sage` (reports `onWrongSite` for sagepub.com) |
| Taylor & Francis | `tandfonline --arg doi=<DOI>` |
| JSTOR | `jstor` |
| Annual Reviews | `annualreviews` |
| IEEE Xplore / stamp.jsp | `ieee` |
| Nature | `nature` |

Enumerate with `node scripts/probe.mjs --list`. Each probe's compact return schema is documented at the top of its file in `probes/`.

---

# v3.3 Core Architecture

The download flow has four stages. Stages are executed in order; each database group runs through stages B→C→D independently.

```
A. CLASSIFY      list → groups by database (journal_database_mapping.md)
B. WARMUP        per group: CAS + Cloudflare clearance, one reused tab
C. CANARY        group's first paper MUST walk the strategy end-to-end
                 fail → ABORT whole group, hand to user
D. BATCH         papers 2-N on same tab, cached selector, no re-probe
```

## Stage A — Classify the list by database

Before any navigation, bucket every paper into a database group using `journal_database_mapping.md` (期刊代码 → 首选数据库). For a DOI without a journal code, infer the database from the DOI prefix:

| DOI prefix | Database |
|---|---|
| `10.1016/` | ScienceDirect |
| `10.1002/`, `10.1111/` | Wiley |
| `10.1080/` | Taylor & Francis |
| `10.1177/` | SAGE |
| `10.1037/` | ProQuest (APA PsycArticles) |
| `10.1287/`, `10.5465/` | EBSCO (Business Source Complete) |
| `10.2307/` | JSTOR |
| `10.1146/` | Annual Reviews |
| `10.1109/` | IEEE Xplore |
| `10.1038/` | Nature |

A paper with an ambiguous or unmapped source is its own single-paper group. Output of Stage A: an ordered list of `(database, [papers])` groups.

## Stage B — Warmup per group

For each group (one tab per group, reused for the whole group):

1. **Cloudflare pre-clearance** (ScienceDirect, Wiley, T&F only): if FlareSolverr is available, resolve one article URL on the publisher domain, extract `cf_clearance`, inject into the group tab. (See "FlareSolverr Cloudflare Handling".)
2. **CAS activation**: navigate to one article page on the group's publisher, run `classifyPage`. If `access=false`, trigger THU CAS/Shibboleth once (see "CAS SSO Handoff"). Reuse this authenticated tab for every paper in the group — closing it drops the session.

CAS sessions are cross-publisher (one login caches for all groups), so later groups usually need no new login.

## Stage C — Fail-fast canary (first paper per group)

The first paper of each group is the **canary**. It MUST walk the group's hardcoded strategy (see "Per-Publisher Hardcoded Strategy") end-to-end:

1. Navigate to the canary article page via Alma resolver. Wait 8–12s for settle.
2. Run the publisher probe → confirm `access`/`found`.
3. Execute the strategy (click / navigate / fetch per the table).
4. Verify the file (`%PDF` signature + `extract_pdf_text.py`).

**Decision gate:**
- ✅ Canary succeeds → **cache the download selector** for this group, proceed to Stage D (batch).
- ❌ Canary fails → **ABORT the whole group immediately**. Do NOT try the next paper, do NOT retry via an alternative method. Classify the failure and hand off (see "Canary Failure Handoff").

> Rationale: if the hardcoded strategy is broken for one paper, it is broken for the whole database. Retrying burns tokens on papers that will all fail. The single exception is a paper-specific failure (e.g. embargo, OA mismatch) — see "Canary Failure Handoff" for how to classify before aborting.

## Stage D — Batch (papers 2-N)

On the group's reused tab, for each remaining paper:

1. Navigate to the next article page via Alma resolver. Wait 8–12s.
2. **Download without re-probing**, using the cached selector from the canary.
3. Every ~5 papers, re-run `classifyPage` to check CAS is still alive. If expired, re-warm this group only and continue.
4. After each: wait for file in `~/Downloads` (8–12s) → `mv` to `downloads/<paper>.pdf` → verify → append `download-log.tsv`.

---

# Per-Publisher Hardcoded Strategy (CORE — no fallback)

Each database below has **exactly one** strategy. These are the reusable constants: a given database's PDF-delivery and user-verification logic does not change per paper. If a strategy breaks, fix the action file on-site and stamp `updated_at` (see "Strategy Update Protocol"). **Never substitute click↔fetch as a fallback.**

The **access characteristics** (CAPTCHA, mirror, most-stable source) below are part of the strategy, not side notes — they determine *why* the strategy is what it is.

## Strategy table

| Database | DOI prefix | Strategy | Tool | Access characteristic (core) |
|---|---|---|---|---|
| **SAGE** | `10.1177/` | **fetch** from `sage.cnpereading.com` | `get-pdf.mjs --publisher sage` | **国内镜像 cnpereading.com 更快，写死用此镜像，不要用 `journals.sagepub.com`**。PDF 路径在 RSC 流式 `<script>` 的 `self.__next_f.push(...)` 里，正则搜 `/storage/`。 |
| **Taylor & Francis** | `10.1080/` | **fetch** | `get-pdf.mjs --publisher tandfonline --arg doi=<DOI>` | SSO 后 `fetch("/doi/pdf/<DOI>?download=true")` 直接返回 `application/pdf`。 |
| **JSTOR** | `10.2307/` | **click-download** | CDP click T&C shadow button | 有 T&C 中转页，须先点同意；fetch 会拿回 HTML。 |
| **Wiley** | `10.1002/`, `10.1111/` | **navigate-download** | CDP navigate to `pdfdirect` URL | `fetch()` 被 Cloudflare 拦 403，但浏览器导航过（cookie 处理不同）。 |
| **ProQuest / APA** | `10.1037/` | **click-download** | CDP click "Download PDF" | **ProQuest APA PsycArticles 是 APA 期刊最稳定的来源**（清华有订阅）。PDF 在自定义 viewer 里，无可直接 fetch 的 URL。 |
| **EBSCO / INFORMS** | `10.1287/`, `10.5465/` | **click-download (2-step)** | CDP click toolbar → modal button | PDF.js viewer，无直接 URL。**AOM (AMJ/AMR/AMA) 不在任何单一库，EBSCO Business Source Complete 是最可靠的全文来源**。 |
| **Annual Reviews** | `10.1146/` | **fetch (POST)** | `get-pdf.mjs --publisher annualreviews` | **页面结构统一，自动化成功率最高**。POST `deliver/fulltext`。 |
| **IEEE Xplore** | `10.1109/` | **fetch (iframe src)** | `get-pdf.mjs --publisher ieee` | 需先走 `stamp.jsp` 拿 iframe src。 |
| **Nature** | `10.1038/` | **click-download** | CDP click visible "Download PDF" | 须先登录，否则返回 HTML。click 选可见（`width>0`）的链接。 |
| **ScienceDirect** | `10.1016/` | **click (human-assisted CAPTCHA)** | CDP click + human | **CDP 触发 CAPTCHA（"Are you a robot?"），必须人工解**。人解后点 View PDF → S3 预签名新标签 → 下载。预签名 URL 有时效。 |

## Cached selectors (publisher constants — same for every paper in the group)

After the canary succeeds, cache the selector and reuse for papers 2-N without re-probing. These are **publisher-level**, not paper-level.

| Publisher | Cached CDP eval |
|---|---|
| **JSTOR** | `document.querySelector("terms-and-conditions-pharos-button").shadowRoot.querySelector("button").click()` |
| **EBSCO (step 1)** | `[...document.querySelectorAll("button[data-auto=tool-button]")].find(b=>b.getAttribute("aria-label")==="下载").click()` |
| **EBSCO (step 2)** | `document.querySelector("[data-auto=bulk-download-modal-download-button]").click()` |
| **ProQuest** | `[...document.querySelectorAll("a")].find(e=>/download pdf/i.test(e.textContent.trim())).click()` |
| **Nature** | `[...document.querySelectorAll("a")].find(e=>/download pdf/i.test(e.textContent)&&e.getBoundingClientRect().width>0).click()` |
| **Wiley (navigate)** | `POST /navigate?target=<id>` body=`<origin>/doi/pdfdirect/<DOI>?download=true` |

**Key rule**: never re-probe or re-discover the button for subsequent papers in the same publisher group.

## Click-download / navigate-download mechanics

Files from click/navigate land in `~/Downloads`. After download, `mv` to `downloads/` with a proper name.

```bash
# After any click/navigate-download, wait then grab newest file
ls -t ~/Downloads/ | head -1
mv ~/Downloads/<filename> downloads/<paper>.pdf
```

Navigate-download (Wiley):
```bash
curl -s -X POST "http://127.0.0.1:3456/navigate?target=<id>" \
  --data "https://onlinelibrary.wiley.com/doi/pdfdirect/<DOI>?download=true"
# isDownload:true → file lands in ~/Downloads
```

## Subtype awareness

Some databases serve heterogeneous layouts. The strategy must be selected by **subtype**, not just database. When a subtype needs a different selector/URL, record it as a separate row in `strategies.tsv` (see Strategy Manifest). Known subtypes to watch:

- **ScienceDirect**: article vs chapter vs encyclopedia — different "View PDF" placement. Canary must match the subtype of the batch.
- **Wiley**: open-access vs subscription — OA may serve PDF directly without `pdfdirect`.
- **AOM**: AMJ/AMR/AMA route via EBSCO; some via AOM website / JSTOR.

If the canary is an article but the batch contains chapters, abort and re-canary on a representative chapter rather than assuming the article strategy transfers.

---

# Canary Failure Handoff

When the canary fails, do NOT immediately retry. First **classify the failure**, then decide abort vs skip:

## Step 1 — Classify the failure (use the probe)

Run the publisher probe on the failed canary tab. The verdict distinguishes failure families:

| Probe signal | Failure family | Action |
|---|---|---|
| `access=false`, CAS page | **auth** (transient) | re-warm this group's CAS once; retry canary once. Still fails → abort. |
| `cloudflare=true`, `captcha=false` | **Cloudflare JS Challenge** | FlareSolverr (Mode A→B). Fails → abort. |
| `captcha=true` / "Are you a robot?" | **bot check** (ScienceDirect) | escalate to user; after user solves, retry canary once. |
| PDF element present but download yields non-PDF | **strategy stale** | **ABORT group** → fix action file on-site (see Strategy Update Protocol). |
| PDF element absent, no paywall text | **paper-specific** (embargo / OA mismatch) | **skip this paper only**, try next paper as the new canary. |
| paywall / purchase text | **no access** | record `no_authorized_pdf_found` / `purchase_required`; skip paper, next becomes canary. |

## Step 2 — Abort payload (hand to user)

When a group is aborted, the user receives **all three**:

1. **Failure type** — which family from the table above (e.g. `strategy_stale`, `bot_check`, `cloudflare_flaresolverr_failed`).
2. **Which paper** — the canary's title / DOI and the group/database name.
3. **Suggested fix line** — the specific action-file line or selector that likely needs updating (e.g. `actions/wiley.mjs:42 — pdfdirect selector may have changed; expected <a> with download=true`).

## Step 3 — Decision is the user's

After handoff, the agent does not retry the group unless the user explicitly says to. If the user asks the agent to fix the strategy, follow the Strategy Update Protocol.

---

# Strategy Manifest — `strategies.tsv`

A single tab-separated manifest tracking every hardcoded strategy and its freshness. One row per (database, subtype).

```
# Columns (TAB-separated):
#   database    publisher/database name
#   subtype     article | chapter | oa | subscription | all  (use "all" if single strategy covers everything)
#   strategy    click-download | navigate-download | fetch | click-human-assisted
#   tool        action module or CDP eval key
#   last_tested ISO date of last successful canary
#   updated_at  ISO date the strategy was last edited
#   notes       access characteristic / trap
database	subtype	strategy	tool	last_tested	updated_at	notes
SAGE	all	fetch	get-pdf.mjs --publisher sage			cnpereading.com mirror; RSC __next_f.push /storage/ regex
Taylor & Francis	all	fetch	get-pdf.mjs --publisher tandfonline			fetch /doi/pdf/<DOI>?download=true after SSO
JSTOR	all	click-download	CDP shadow T&C button			T&C interstitial returns HTML on fetch
Wiley	subscription	navigate-download	CDP navigate pdfdirect			Cloudflare 403 on fetch; browser nav passes
Wiley	oa	fetch	direct PDF URL			may serve PDF directly without pdfdirect
ProQuest	all	click-download	CDP click Download PDF			APA PsycArticles most stable APA source
EBSCO	all	click-download	2-step CDP click			AOM via Business Source Complete most reliable
Annual Reviews	all	fetch	get-pdf.mjs --publisher annualreviews			uniform layout, highest automation success
IEEE	all	fetch	get-pdf.mjs --publisher ieee			stamp.jsp nav first for iframe src
Nature	all	click-download	CDP click visible Download PDF			login required or HTML returned
ScienceDirect	article	click-human-assisted	CDP click + human CAPTCHA			CDP triggers CAPTCHA; presigned S3 URL time-limited
ScienceDirect	chapter	click-human-assisted	CDP click + human CAPTCHA			different View PDF placement than article
```

`last_tested` is updated whenever a canary passes. `updated_at` is updated whenever the action file is edited.

## Strategy Update Protocol (agent on-site fix)

When a strategy is confirmed stale (canary fails with `strategy_stale` and the user authorizes a fix):

1. **Identify the broken line** in the relevant `actions/<publisher>.mjs` (or probe). The abort payload's suggested fix line points at it.
2. **Re-discover the correct selector/URL** by inspecting the live page — but via a **probe** (compact verdict), never a raw `/eval` dump. Update the action file.
3. **Stamp `updated_at`** in `strategies.tsv` (today's date) and re-run the canary on the fixed strategy.
4. If the re-canary passes, resume the batch. If it fails again, hand back to the user with the new failure type.
5. Do NOT mark `last_tested` until a canary genuinely passes end-to-end.

The agent updates the strategy file directly — the user should not have to hand-edit selectors.

---

# FlareSolverr Cloudflare Handling (safety-bound, inherited)

Applies only when FlareSolverr runs on `localhost:8191` (per Network Security Guardrails Rule 3). If unavailable, Cloudflare challenges escalate to the user.

**Check before use:**
```bash
curl -s --max-time 3 http://localhost:8191/v1 -H "Content-Type: application/json" \
  -d '{"cmd":"sessions.list"}' | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status')=='ok' else 1)" 2>/dev/null && echo "FlareSolverr available" || echo "FlareSolverr unavailable — escalate to user"
```

## Cloudflare Detection
Use the `classifyPage` probe — it returns `cloudflare` and `captcha` booleans computed server-side:
```bash
node scripts/probe.mjs --target <id> --name classifyPage
```
- `cloudflare && !captcha` → attempt FlareSolverr resolution.
- `captcha` → escalate to user (FlareSolverr's CAPTCHA solvers are broken per upstream).

## Mode A: Cookie Injection (preferred)
1. `curl -s http://localhost:8191/v1 -H "Content-Type: application/json" -d '{"cmd":"request.get","url":"<blocked URL>","maxTimeout":60000,"returnOnlyCookies":true}'`
2. Inject each returned cookie: `document.cookie = "<name>=<value>; domain=<domain>; path=/; secure";`
3. `location.reload()`.
**Risk**: Cloudflare may tie `cf_clearance` to User-Agent; FlareSolverr's headless UA differs from the user's Chrome UA. If strict, Mode A fails → Mode B.

## Mode B: Content Extraction (fallback within FlareSolverr only)
1. Send blocked URL without `returnOnlyCookies`; extract PDF links from `solution.response`.
2. Navigate the user's Chrome to the extracted link. PDF CDNs (`pdf.sciencedirectassets.com`, `sage.cnpereading.com`) rarely have Cloudflare.
3. If the CDN also triggers Cloudflare, escalate to user.

**Failure codes** (add to `download-log.tsv`): `cloudflare_flaresolverr_solved` / `cloudflare_flaresolverr_failed`.

> Note: Mode A→B is a fallback *within FlareSolverr for Cloudflare only*. It is NOT a download-method fallback (click↔fetch). The download strategy itself remains single, hardcoded.

---

# CAS SSO Handoff and Retry

Some publishers (Elsevier/ScienceDirect, Springer Nature, Wiley, T&F, Cell Press, Shibboleth/OpenAthens-routed society platforms) may redirect to THU CAS even with WebVPN open. This is not a reason to ask for the password.

When a paper reaches a CAS / institutional SSO page:
1. Stop automated actions on that tab.
2. Record `download_success=no`, `failure_reason=cas_waiting_user`.
3. Tell the user which tab/page needs attention. If Chrome has already filled the THU CAS credentials and the user authorizes, click the visible login/confirm button once.
4. Do NOT read/store/request password, QR result, OTP, SMS code, CAPTCHA, cookie, or local/session storage.
5. After login completes, refresh or continue from the same tab; re-detect page state.
6. If resolved → download + verify + update log. If it loops back to CAS after a completed login → record `failed_after_retry` and move on.

---

# Search Route (for groups without a direct DOI strategy)

Prefer the library discovery route before direct publisher pages (more stable, less bot protection):

1. Search by DOI or exact title in 水木学术搜索 (Primo):
   - `https://tsinghua-primo.hosted.exlibrisgroup.com.cn/primo-explore/search?vid=86THU&lang=zh_CN&query=any,contains,<URL-encoded DOI or title>`
   - Alma resolver (parametric, bypasses SPA): `https://tsinghua.alma.exlibrisgroup.com.cn/view/uresolver/86THU_INST/openurl?rft_id=info:doi/<DOI>&svc_dat=single_service`
2. Open Primo URLs via `/navigate` to preserve `#!` fragments.
3. Read the result page with the **primo probe** (never raw `/eval`): `node scripts/probe.mjs --target <id> --name primo` → `{ host, scope, hasResults, fulltextLinks[] }`.
4. Prefer `PDF` entry; else `在线全文` / `Full Text`.
5. Open the PDF link in a new background tab via the CDP proxy.

### Primo field notes
- Skip empty `href` values (first online-full-text match can be a facet toggle).
- Treat Primo as a slow SPA: wait 6–10s, retry link extraction up to 3 times.
- If Primo redirects to login saying IP outside authorized range → record `ip_not_authorized` (user may need THU VPN/WebVPN client).

---

# Verification and Reading

After every download, verify the PDF:

```bash
python scripts/extract_pdf_text.py --pdf "downloads/paper.pdf" --pages 3
```

Minimum checklist:
- File exists, size plausible.
- First bytes are `%PDF`.
- Page count nonzero.
- Extracted text includes title / abstract / supporting-info title.
- Append `download-log.tsv`.

---

# Simple Log

Tab-separated `download-log.tsv`, exactly these fields:

```text
paper	source_database	download_success	failure_reason
```

- `paper`: compact bib info, preferably `title | authors | year | DOI`.
- `source_database`: `Primo`, `ScienceDirect`, `Wiley`, `EBSCOhost Business Source Complete`, `JSTOR`, `SAGE`, `Taylor & Francis`, `ProQuest APA PsycArticles`, `Annual Reviews`, `IEEE`, `Nature`, or `unknown`.
- `download_success`: `yes` / `no`.
- `failure_reason`: empty when successful; else one of the codes below.

## Failure Reasons

```text
cas_waiting_user
cas_resolved_retry_needed
publisher_verification_waiting_user
sciencedirect_robot_check
strategy_stale
group_aborted_canary_failed
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

New in v3.3: `strategy_stale` (hardcoded strategy broken, needs on-site fix) and `group_aborted_canary_failed` (group aborted after canary failure).

---

# Summary Report (end of run)

Report per-group totals (`total / success / failed`), failed papers with reasons, and any **aborted groups** with the full handoff payload (failure type + canary paper + suggested fix line). Aborted groups are highlighted so the user can decide whether to authorize a strategy fix or handle manually.

# Assets in this directory

- `journal_database_mapping.md` — 期刊代码 → 首选数据库 classifier (Stage A input).
- `strategies.tsv` — single strategy manifest (freshness tracking).
- `canaries.tsv` — offline regression set (one known-good paper per publisher; run `node scripts/run-canary.mjs` to verify strategies have not regressed). Complements the **online** per-batch canary: canaries.tsv = "is the strategy itself healthy?", the Stage C canary = "can this batch download today?".
- `lessons.md` — per-publisher playbooks with field-tested URL patterns and traps. Consult the section matching the database before deviating from the hardcoded strategy.
- `probes/`, `actions/`, `scripts/` — probe library, action modules, tool scripts (inherited from v3).
