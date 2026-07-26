---
name: tsinghua-literature-downloader-grouped
description: Group papers by publisher/database, then batch-download each group through Tsinghua Library access. Trigger: "分组下载这些文献", "按数据库批量下载", "group download".
metadata:
  compatibility: Requires Chrome + remote debugging + Node.js 22+. Uses only institutional access.
  version: 2.0-grouped
---

# 清华大学文献下载工具（分组版）

按数据库/出版社对待下载文献分组，同一组的论文一次认证、批量下载，比逐篇独立下载快得多。

## Architecture

```
Phase 1: Global Warmup（一次性）
  ├─ 识别全部论文涉及的所有 publisher
  ├─ 清所有 Cloudflare（SD, Wiley, T&F）
  └─ 触发所有 publisher 的 CAS

Phase 2: Per-Group Download（按组分批）
  ├─ Group A（ScienceDirect）: 批量下载
  ├─ Group B（Wiley）: 批量下载
  └─ Group C（EBSCO）: 批量下载

Phase 3: Summary Report
```

## Publisher Group Mapping

| Group | DOI Prefixes | Lessons Section |
|-------|-------------|----------------|
| ScienceDirect | `10.1016/` | ScienceDirect |
| Wiley | `10.1002/`, `10.1111/` | Wiley |
| EBSCO (incl. INFORMS) | `10.1287/` | EBSCO |
| ProQuest / APA | `10.1037/` | ProQuest |
| Taylor & Francis | `10.1080/` | T&F |
| SAGE | `10.1177/` | SAGE |
| JSTOR | `10.2307/` | JSTOR |
| Annual Reviews | `10.1146/` | Annual Reviews |
| IEEE | `10.1109/` | IEEE |
| Nature / Springer Nature | `10.1038/` | Nature |
| Other / Unknown | — | Fallback: Alma → Primo → direct |

## Step 1: Collect and Group Papers

1. Accept a list of papers (DOIs and/or titles).
2. For each paper, extract DOI prefix → map to publisher group.
3. If no DOI, keep as `Unknown` — will be resolved via fallback search.
4. Sort papers into group buckets. Display the grouping to the user for confirmation.

## Phase 1: Global Warmup（一次性）

Run this once before any per-group download. Same as the unified版 warmup:

### 1.1 Identify All Target Publishers

Scan all papers, collect all unique publisher groups.

### 1.2 Cloudflare Pre-Clearance

For ScienceDirect, Wiley, and T&F groups only:
- Check FlareSolverr at `localhost:8191`.
- If available, request `cf_clearance` cookie injection for each domain (see unified版 SKILL.md §1.3).

### 1.3 CAS Activation

For each unique publisher group:
- Navigate to one article page on that publisher.
- If institutional access not shown, trigger CAS per the publisher's playbook.
- CAS sessions are cross-publisher — one successful CAS login caches for all.

### 1.4 Verify

Confirm each publisher group shows institutional access. If any fails, re-run CAS for that group.

---

## Phase 2: Per-Group Download（按组分批）

After global warmup, process groups one by one. Groups with CAS already active skip directly to download.

### 2.1 Session Liveness Check

Before each group's first paper, and after every 5 papers within a group:

1. Navigate to an article page in that group.
2. `/eval` check for institutional access text (e.g. `Brought to you by: Tsinghua University`, `Access through`, `Access provided by`).
3. If access missing → CAS session expired. Run per-group re-warmup (go to §2.2).
4. If access OK → continue.

### 2.2 Per-Group Re-Warmup (on expiry)

Only when CAS expired mid-batch:

1. Re-trigger CAS for this group only (navigate article page → click institutional login → CAS).
2. If CAS page shows auto-filled creds, click login (with user authorization).
3. If not auto-filled, pause and ask user.
4. After CAS resolves, verify access on the same article page.
5. Resume batch download from the failed paper.

If re-warmup fails, mark remaining papers in this group as `cas_waiting_user` and move to next group.

### 2.3 Batch Download

For each paper in the group:

1. **Try Alma resolver first** — `https://tsinghua.alma.exlibrisgroup.com.cn/view/uresolver/86THU_INST/openurl?rft_id=info:doi/<DOI>&svc_dat=single_service`
2. **If Alma fails** — use Primo search with DOI (then title as fallback).
3. **Extract PDF link** — follow the publisher's playbook in `lessons.md`.
4. **Download** — fetch through the authenticated browser context.
5. **Verify** — check `%PDF` header, page count > 0, text includes title.
6. **Log** — update `download-log.tsv` with paper, group, success, reason.

Reuse the same publisher tab across papers in the same group to keep the CAS session alive. If a paper's download fails with `cas_waiting_user`, run per-group re-warmup (§2.2) before the next paper in this group.

### 2.4 Group Cleanup

### 2.2 Group Cleanup

- Close publisher-specific tabs.
- Log group summary (total papers, successes, failures).

---

## Phase 3: Summary Report

After all groups are processed, present:

- Per-group: `total / success / failed`
- Failed papers with failure reasons
- Any papers that need user intervention (CAS waiting, CAPTCHA, etc.)

## How to use lessons.md

1. Identify the publisher group for a paper.
2. Read the corresponding section in `lessons.md` for the standard steps.
3. Watch for the "关键教训" (key lessons) to avoid known traps.
4. If a playbook fails, log the deviation and try the fallback route.

## CDP Proxy API

Same as the unified版 (see `../SKILL-v1/SKILL.md` or check `/health` on `http://127.0.0.1:3456`).

## Boundaries

Same as the unified版 — institutional access only, no Sci-Hub, no credential sharing, no CAPTCHA bypass.
