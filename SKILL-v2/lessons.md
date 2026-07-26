# 分组版 Lessons

分组版复用统一的 per-publisher 经验教训。详细 playbook 见 `../SKILL-v1/lessons.md`。

## 分组版特有的经验

1. **按组批量下载时，CAS session 跨文章复用** — 同一组内不要关掉已认证的 publisher 标签页。
2. **Alma resolver 优先** — 可参数化构造 URL，绕过 Primo SPA 延迟。
3. **EBSCO 组注意事项** — INFORMS（`10.1287/`）收录在 EBSCO 而非 Primo，直接搜 `research.ebsco.com`。
4. **SAGE 只用中国镜像** — `sage.cnpereading.com`，不要用 `journals.sagepub.com`。
5. **下载失败不要死磕** — 记录 `failure_reason`，跳过，汇总时告知用户。
