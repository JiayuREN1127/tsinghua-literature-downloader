---
name: tsinghua-literature-downloader
description: Download and organize academic PDFs through the user's logged-in Tsinghua Library, WebVPN, Primo, publisher, or Chrome session. Use for institutional literature downloads, grouped retries, and PDF acquisition checks.
metadata:
  compatibility: Requires user-authenticated Chrome, remote debugging permission, and Node.js 22+. Uses only user-authorized access.
  version: "4.0.0"
---

# Tsinghua institutional PDF downloads

v4 keeps fixed database strategies, per-group warmup and canaries, parallel article loading, and serial downloads. Successful fetch is preferred over direct-link navigation, then other actions. This priority selects the maintained strategy; it does not authorize indefinite method cycling.

## Access and network boundaries

Use only the user's authorized institutional access. The user logs into Tsinghua Library / WebVPN / Primo and enables Chrome remote debugging. Run `node start.js` only if the local proxy is not already available; check `/health` first.

- Do not bypass paywalls, DRM, CAPTCHA, OTP, verification or login gates, or use pirate mirrors. Record unavailable authorized access.
- Do not read/export passwords, cookies, local storage, profiles or session files. Use the authenticated browser page; never ask for credentials in chat.
- CAPTCHA, Turnstile, QR, SMS/OTP and publisher verification belong to the user. If Tsinghua CAS is already filled and the user explicitly authorizes its login button, click once without reading credentials.
- Optional FlareSolverr is limited to authorized Cloudflare JS challenge work, not human verification. Do not extract/inject cookies; hand off when browser verification is required.
- Every local listener must bind to `127.0.0.1` or a single explicitly approved private VM-bridge address. Never use all-interface bindings (`0.0.0.0`, `*`, `::`, or unspecified address).
- Never relay the user's VPN/proxy outward via socat, firewall rules, SSH forwarding, nginx or any other mechanism. Never expose it to campus/shared networks.
- Authorized FlareSolverr Docker mapping: `-p 127.0.0.1:8191:8191`, never bare `-p 8191:8191`. Fix networking with `host.docker.internal:<proxy-port>` or DNS, not a proxy relay.
- Before a background listener starts, state and verify its port and bind address. Track and stop processes started for this run at handoff/error; do not kill pre-existing user services.

## Human collaboration and 120-second limit

The agent handles inspection, ordinary button clicks, link extraction, download and verification. Do not ask the user to operate an accessible download button that the agent can operate.

Each paper/canary has a **cumulative 120-second automatic attempt budget**, starting before its first automatic navigation/download, including diagnostics and strategy repair. Repeating commands or changing methods never resets it. Pass only remaining time to later invocations (`--timeout <remaining-seconds>`). At the deadline cancel pending automatic download work, stop the current group and hand off: platform, paper, current page, attempted action and observed reason. Wait for explicit continuation; do not advance to the next paper automatically. Human waiting time is outside the budget; a user-authorized resumed attempt gets a new budget.

Hand off immediately for login/human verification. A single no-access item does not prove a broken database strategy; explain the cause and let the user decide skip/retry. Never count a user-triggered download as proof of automation.

## Grouped workflow

1. **Classify.** Use `journal_database_mapping.md` and DOI prefixes before opening tabs. Keep database groups. Move a rare cross-platform redirect into the corresponding later group, or create a later group; report it without rebuilding the current batch.
2. **Warmup.** Open one representative article, run `classifyPage` and its publisher probe, and establish access in a reused authentication tab. Keep that tab for the group. Use Alma/Primo when the article URL is unknown.
3. **Canary.** Execute the fixed strategy on the first paper. Require an actual PDF, not merely HTTP 200 or a click. Cache the working action/selector. Diagnose/repair within the same 120 seconds; stop and hand off if unresolved.
4. **Batch.** Ask once for N (default 10), unless settled. Open up to N article tabs from one database in parallel. Download serially using cached actions. If >=2 tabs encounter bot challenges, stagger subsequent opening by 1–2 seconds. Keep the authentication tab and check it about every five papers; close finished batch tabs.
5. **Provisional attribution.** Native downloads: snapshot Downloads before the click/navigation, then assign the newest completed PDF to the current ID. Fetch: save directly to that ID's path. Do not add routine delayed-arrival machinery; attribution is provisional until final reconciliation. Never close a source tab before transferring its bytes.
6. **Final reconciliation.** After downloads finish, verify all PDFs have pages and match DOI/title; correct provisional attribution. Check `%PDF` at acquisition. Hash differences alone do not establish different content; compare text if needed. Do not add mandatory document-type, chapter or page-range screening beyond the settled task requirements.
7. **Delivery.** Follow user paths/naming, preserve unrelated files, and report completed/skipped/unresolved accurately. Deliver PDFs, concise status summary and one per-paper log. Clean process files only when authorized.

## Fixed strategies

Read the platform's latest dated lesson before execution. For conflicting execution guidance with the same scope, the **newer dated lesson wins**. Synchronize its action and manifest promptly. Keep one fixed method per database/subtype; do not silently cycle through methods.

| Database | Fixed action | Conditions |
|---|---|---|
| ScienceDirect | `--publisher sciencedirect --arg pii=<PII>`: matching View PDF opens CDN tab, fetch from that tab | Article fetch(pdfft) returned HTML; CDN fetch returned full PDF on 2026-10-16 even with Just a moment title. Inspect actual response; hand off human checks. Never overwrite article tab or reuse expired signed URLs. |
| EBSCO | `--publisher ebsco`: fetch observed CDS resource in viewer context with credentials omitted | Viewer loading itself exposes CDS URL; no download button needed. Byte-identical result on 2026-10-16. Do not navigate to CDS first. |
| Taylor & Francis | `--publisher tandfonline --arg doi=<DOI>`: native `/doi/pdf/<DOI>?download=true` in new tab | 2026-10-16 fetch returned article HTML; native direct link succeeded. |
| ProQuest | `--publisher proquest`: click PFT download anchor | Match href containing `media.proquest.com/media/hms/PFT/`. |
| IEEE | `--publisher ieee`: fetch getPDF iframe source from stamp.jsp | Open stamp.jsp from article first. Native stampPDF/getPDF.jsp also worked; existing iframe fetch stays preferred. Client access metadata alone does not establish denial. |
| Springer | `--publisher springer --arg doi=<DOI>`: native `/content/pdf/<DOI>.pdf` | Direct link verified this run. |
| Royal Society | `--publisher royalsociety --arg doi=<DOI>`: extract article-pdf link, native new tab | Extract per-paper resource number; never guess it. |
| Oxford Academic | `--publisher oxford`: extract article-pdf link, native new tab | Older LWW DOI may redirect here. |
| AUA Journals | `--publisher aua --arg doi=<DOI>`: native `/doi/pdf/<DOI>?download=true` | Endpoint manually verified; automated canary required. epdf alone did not download. |
| Ovid | `--publisher ovid`: click `button.omni-article-tool__pdf` | P1145 button download worked; P2107 direct-link automation was not established. |
| Wiley subscription | `--publisher wiley --arg doi=<DOI>`: native pdfdirect | Keep documented navigation strategy; fix stale fetch action. |
| SAGE | `--publisher sage`: fetch domestic cnpereading.com mirror | Retain existing strategy, not journals.sagepub.com. |
| JSTOR | `--publisher jstor`: click T&C shadow button | Keep documented click strategy. |
| Annual Reviews | `--publisher annualreviews`: POST deliver/fulltext | Retain existing strategy. |
| Nature | `--publisher nature`: click visible Download PDF | Requires access; retain existing strategy. |

`strategies.tsv` records method, last-tested date, update date and evidence scope. Manual download and mocked tests are not automated live canaries. Unretested strategies keep their prior evidence status.

## Browser interfaces and concise inspection

Proxy: `http://127.0.0.1:3456`; Node.js 22+.

| Endpoint | Method | Purpose |
|---|---|---|
| `/health`, `/targets` | GET | Health / tab inventory |
| `/new` | POST URL in body | New background tab |
| `/navigate?target=<id>` | POST URL in body | Navigate existing tab |
| `/info?target=<id>` | GET | Title, URL, readiness |
| `/eval?target=<id>` | POST JS in body | Compact result/action |
| `/clickAt?target=<id>` | POST selector in body | Visible element click |
| `/close?target=<id>` | GET | Close owned tab |

Use `scripts/probe.mjs --list` and matching probes first. Custom evals return compact JSON (normally <=500 bytes), capped arrays and short strings; never dump HTML/unbounded text. PDF byte transfer stays inside scripts, not agent output. Use known endpoints, not guessed `/tabs` or `/json`.

Primo: `https://tsinghua-primo.hosted.exlibrisgroup.com.cn/primo-explore/search?vid=86THU&lang=zh_CN`, exact DOI/title search. Alma: `https://tsinghua.alma.exlibrisgroup.com.cn/view/uresolver/86THU_INST/openurl?rft_id=info:doi/<DOI>&svc_dat=single_service`. Pass navigation URLs in POST bodies to preserve query/fragments; settle within the budget.

```bash
node scripts/get-pdf.mjs --target <tab> --publisher ebsco --out <paper-id>.pdf --timeout 120
python3 scripts/reconcile-pdfs.py --manifest <manifest.json> --log <download-log.tsv>
```

The manifest is a JSON array of `{id,title,doi,path,source_database,source_url,status,failure_reason}`; paths are absolute or relative to its directory. Optional `action`, `trigger` (automatic/manual), and `attempts` (compact action/reason records) are retained in the single final log. Record stable source URLs, not signed URLs with transient access parameters. Reconciliation reports mismatches for correction without renaming/deleting automatically.

## Lessons and handoff

After a validated fix append a dated scoped lesson immediately, update the action and manifest, and distinguish live/manual/mocked/historical evidence. Preserve historical lessons; newer applicable guidance takes precedence. Never claim a platform was live-retested just because its implementation changed.

At handoff report per-group totals, reasons for exceptions, N, any staggered opening, and the action needing user attention. Give concise updates before actions and whenever results change the next step.
