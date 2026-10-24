# Tsinghua Literature Downloader

Download academic PDFs through a Chrome session that is already logged in to Tsinghua Library or WebVPN.

Chinese version: [README_CN.md](README_CN.md)

## Origin

This repository is adapted from [zju-literature-downloader](https://github.com/baihe26/zju-literature-downloader.git) by [@baihe26](https://github.com/baihe26), which was built for Zhejiang University. The Tsinghua version reworks it for Tsinghua University Library, Shuimu Scholar Search (水木学术搜索), and institutional access paths.

## Current version: v4.1

The maintained version is [SKILL-v4.1](SKILL-v4.1/), `4.1.0`. Before the first action in a session it compares its local version with the latest GitHub release. If a newer release exists, it names both versions and links to it, and the user decides whether to upgrade. If the check fails, it says so and continues with the local copy. v4 and earlier stay in the repository as historical snapshots.

v4.1 keeps grouping by database, warmup, and canaries. Article tabs load in parallel and PDFs download one at a time. Each paper gets 120 seconds of cumulative automatic attempts, and the batch ends with a DOI and title check.

ScienceDirect follows the article's actual PDF link and opens a separate tab per paper. Once a PDF has downloaded, been checked, and been saved, that paper's tab closes. Tabs that failed or are waiting for a person stay open for diagnosis. Other databases keep their fixed strategies.

Tests run with `cd SKILL-v4.1 && npm test`. Field results and limits are in [lessons](SKILL-v4.1/lessons.md), the full procedure in [SKILL](SKILL-v4.1/SKILL.md), and the newest build on the [releases page](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/latest).

The version comparisons and performance figures below describe v3.4 and earlier. They are neither v4 execution policy nor a current benchmark.

## How it works

```
Your Chrome (logged in to Tsinghua)  ←  CDP proxy  ←  AI agent
        ↓
Shuimu Scholar Search / Alma resolver  →  publisher page  →  PDF download
        ↓
[FlareSolverr, optional]  →  clears Cloudflare JS challenges automatically
```

## Prerequisites

- Chrome, logged in to Shuimu Scholar Search
- Chrome remote debugging enabled
- Node.js 22 or newer
- FlareSolverr (optional, for automatic Cloudflare clearance)

## Directory layout

```
├── SKILL-v1/     unified, one paper at a time                      legacy, frozen
├── SKILL-v2/     grouped, batch per publisher                      legacy, frozen
├── SKILL-v3/     token-disciplined (probe + action libraries)      legacy, frozen
├── SKILL-v3.1/   click-first (native click download)               legacy, frozen
├── SKILL-v3.2/   network-safe (hard rules + incident review)       legacy, frozen
├── SKILL-v3.3/   strategy-hardcoded + fail-fast canary             legacy, frozen
├── SKILL-v3.4/   parallel batch (N tabs load, serial download)     frozen
├── SKILL-v4/     fixed strategies, 120 s, batch reconciliation     previous release, frozen
├── SKILL-v4.1/   ScienceDirect direct links, tab cleanup           canonical
├── TEST/         test checklists and field reports
├── sync.sh       installs the canonical version into AI tool skill directories
├── README.md
└── README_CN.md
```

## Version history

| Version | Tag | Directory | Key feature | Status |
|---|---|---|---|---|
| v4.1.0 | `v4.1.0` | `SKILL-v4.1/` | ScienceDirect direct PDF links, one tab per paper, tab cleanup after saving | **canonical** |
| v4.0.1 | `v4.0.1` | `SKILL-v4/` | Checks for a newer release once per session and asks before upgrading | superseded |
| v4.0.0 | `v4.0.0` | `SKILL-v4/` | Live-tested fixed strategies, 120-second cap, end-of-batch reconciliation, newest lessons win | superseded |
| v3.4 | `v3.4` | `SKILL-v3.4/` | Parallel loading inside a batch, serial download | frozen |
| v3.3 | `v3.3` | `SKILL-v3.3/` | One hard-coded strategy per database, grouped fail-fast canary, `strategies.tsv` | frozen |
| v3.2 | `v3.2` | `SKILL-v3.2/` | Network security hard rules (no `0.0.0.0` bind, no proxy relay) | frozen |
| v3.1 | `v3.1` | `SKILL-v3.1/` | Click-first (browser-native download for 5 of 8 papers, 7 of 8 succeeded) | frozen |
| v3.0 | `v3.0` | `SKILL-v3/` | Token discipline hard rules plus a probe library (1000× fewer tokens) | frozen |
| v2.0 | `v2.0` | `SKILL-v2/` | Grouped download by publisher, plus FlareSolverr warmup | frozen |
| v1.0 | `v1.0` | `SKILL-v1/` | Unified, one paper at a time; raw HTML went into context, high token cost | frozen |

## Changelogs

### v3.2: the security incident

On 26 July 2026, while v3.1 was running, the agent decided on its own to run `socat TCP-LISTEN:17897,bind=0.0.0.0 TCP:127.0.0.1:7897` so a Docker container could reach the local Clash proxy. That exposed the proxy to the whole campus network, and the university issued a security alert for running an unauthorized proxy.

The fix landed in `SKILL.md`: a Network Security Guardrails section with five hard rules that forbid any `0.0.0.0` bind and any proxy relay to the outside. The FlareSolverr instructions now say Docker is the recommended cross-platform route (Apple Silicon included), but the port mapping must be `-p 127.0.0.1:8191:8191`. The upstream README's bare `-p 8191:8191` binds `0.0.0.0` by default, and this skill does not allow it. Container networking is solved with `host.docker.internal` or `--dns`, never with a `socat` bridge on `0.0.0.0`. The rules use placeholders (`<proxy-port>`, `<resolver>`, `host.docker.internal`) and hard-code no IP or port, so other users can reuse them.

### v3.3: fixed strategies

v3.2 fell back between click-first and fetch. When a strategy broke, the agent burned tokens trying both. The download path and the user verification step for a given database barely change, so they can be written down once.

The changes:

- Each database gets one fixed download method (fetch, click-download, navigate-download, click with manual help) and no click/fetch fallback. If a method breaks, the agent edits the action file on the spot and sets `updated_at`; it does not silently switch.
- A fail-fast canary: the first paper from each database must pass the fixed method. If it does not, the whole database group stops and goes back to the user with the failure type, the paper, and the line to fix. No batch trial and error.
- Grouped download became the standard flow: list, classify by database (`journal_database_mapping.md`), warm up each database, run the canary, then batch.
- A `strategies.tsv` manifest tracks strategy freshness: database, subtype, strategy, `last_tested`, `updated_at`.
- Per-publisher access quirks (CAPTCHA, mirrors, the most reliable source) moved inline into the strategy section of `SKILL.md` instead of a side file.
- SAGE is hard-coded to the domestic `cnpereading.com` mirror, not `journals.sagepub.com`.
- v3.2's network guardrails, v3's probe library and token discipline, and the safely bound FlareSolverr all carry over.

### v3.4: parallel batch

Stage D in v3.3 reused a single authenticated tab and navigated paper by paper. Page rendering took 8 to 12 seconds per paper while the browser's parallel loading sat idle.

The changes:

- Parallel loading, serial downloads. Once the canary passes, a batch opens N tabs at once (default 10, set once per session before Stage D), each navigating to one article page. Downloads then run one tab at a time: click, `mv`, verify, log. `ls -t ~/Downloads | head -1` stays a reliable way to attribute a file.
- ScienceDirect joins the batch. Its tabs open in parallel and CAPTCHAs are solved one by one; downloads stay serial.
- Bot-triggered staggering. When two or more tabs in a publisher batch hit a bot challenge, later tabs open 1 to 2 seconds apart, and the summary says so.
- Tab lifetime. Tabs are opened per batch and closed after it. The authenticated tab stays open as the CAS anchor.
- The canary stays serial: strategy checks and selector caching still happen on one paper in the authenticated tab.
- Everything from v3.3 carries over: one fixed strategy per database with the fail-fast canary, `strategies.tsv`, the `journal_database_mapping.md` classifier, v3.2 guardrails, and v3 token discipline.

### Download strategies (v3.4, historical)

| | fetch() | click-download | navigate-download | click with manual help |
|---|---|---|---|---|
| Agent tokens | Lowest: one `get-pdf.mjs` call, chunking happens inside Node, the agent sees only the result | Slightly higher: find the button, click, check `~/Downloads`, `mv`; 3 to 4 compact interactions | Low: one CDP `/navigate` to the pdfdirect URL, then check and `mv`; 2 to 3 interactions | Highest: waits for a person to solve the CAPTCHA while the agent keeps polling page state |
| Download speed | Slow: fetch to arrayBuffer, then one CDP round trip per chunk (4 MB ≈ 10 to 30 s) | Fast: the browser streams straight to disk (4 MB ≈ 2 to 5 s) | Fast: navigation triggers a native download (4 MB ≈ 2 to 5 s) | Human-bound: the native click is fast once the CAPTCHA is solved, but waiting dominates |
| Databases | SAGE, T&F, Annual Reviews, IEEE, Wiley-OA (4 of 10) | JSTOR, ProQuest, EBSCO, Nature (4 of 10) | Wiley subscription (1 of 10) | ScienceDirect (1 of 10) |
| Failure cost | Low, because v3.3 hard-coded it: used only where the response really is `application/pdf`. High if misapplied (terms of service, Cloudflare, viewer interception) | Low: behaves like a person, works on the first try, no diagnosis overhead | Low: the browser handles cookies and Cloudflare, navigation is the download | Medium: the CAPTCHA cannot be automated, but the click is reliable afterwards |

### Version evolution (v1 to v3.4)

| | v1 (original) | v2 (+FlareSolverr) | v3 (token-disciplined) | v3.1 (click-first) | v3.2 (network-safe) | v3.3 (strategy-hardcoded) | v3.4 (parallel batch) |
|---|---|---|---|---|---|---|---|
| Page reading | Raw innerHTML/innerText (100 to 500 KB per page) | Same as v1 | Probe returns about 200 B; the DOM is filtered server-side | Same as v3 | Same as v3 | Same as v3, with probe refinements | Same as v3, with probe refinements |
| Tokens | ~250K | ~200K | ~150 | ~300 | ~300 | ~300 (after the canary no paper is re-probed, which lowers the average further) | Same as v3.3: parallel batches add no re-probe |
| Download method | All fetch(), chunked | All fetch(), chunked | All fetch(), chunked | 5/8 click, 2/8 fetch, 1/8 manual | Same as v3.1 | One fixed strategy per database, no fallback: 4 databases fetch, 4 click-download, 1 navigate, 1 click with manual help | Same as v3.3; only the orchestration is parallel: N tabs load article pages, downloads stay serial |
| Download speed | Slow (chunked, 4 MB ≈ 20 s) | Slow (same as v1) | Slow (same as v1) | Fast (native click stream, 4 MB ≈ 3 s) | Same as v3.1 | Same as v3.1: native for most databases, chunked only for fetch | Faster: the 8 to 12 seconds of page rendering per paper now overlaps; the download stage matches v3.3 |
| Success rate | 2/8 | 3/8 (+Wiley) | 2/8 (probes improved diagnosis; fetch still failed 6/8) | 7/8 | 7/8 | Awaiting live test (target ≥ 7/8); the canary removes wasted batches | Awaiting live test (target ≥ 7/8); strategy success is unchanged |
| Core improvement | n/a | FlareSolverr clears Cloudflare | Probe library and token discipline (1000× fewer tokens) | click-first (2/8 to 7/8, 3 to 10× faster) | Network security hard rules (no `0.0.0.0` bind, no proxy relay) | One hard-coded strategy per database, grouped fail-fast canary, `strategies.tsv` | N tabs load in parallel (default 10, a session parameter), serial download keeps file attribution, ScienceDirect joins the batch, automatic stagger when bots appear |

## Quick start

```bash
# Current version
cd SKILL-v4.1 && node start.js

# Any frozen version starts the same way
cd SKILL-v3.4 && node start.js
```

Each `SKILL-vX/` directory has its own README.md and SKILL.md.

## Sync to AI tools

```bash
./sync.sh          # dry run
./sync.sh --apply  # copy SKILL-v4.1 into the current skill paths
```

`sync.sh` installs the canonical version into existing skill directories, including Codex account installs. Legacy versions are left alone unless you pass `--include-legacy`.

## Releases

Tagged versions with changelogs live under [Releases](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases):

- [`v4.1.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v4.1.0): ScienceDirect direct links, per-paper tab cleanup (current)
- [`v4.0.1`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v4.0.1): session-start update check and notification
- [`v4.0.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v4.0.0): fixed strategies, bounded attempts, final reconciliation
- [`v3.4`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.4): parallel loading plus serial download (frozen)
- [`v3.3`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.3): hard-coded strategies and the fail-fast canary
- [`v3.2`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.2): network security hard rules
- [`v3.1`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.1): click-first download strategy
- [`v3.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.0): token-disciplined probe and action libraries
- [`v2.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v2.0): grouped download and FlareSolverr warmup
- [`v1.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v1.0): the original unified skill
