# Tsinghua Literature Downloader — v2（分组版）

按数据库/出版社分组批量下载学术 PDF，通过已登录的清华图书馆 Chrome 会话。

> **状态：legacy。** 本目录为 v2 分组版，仅作历史保留。canonical 版本为 `../SKILL-v3/`（token-disciplined，带探针库）。v2 的 `lessons.md` 是指向 `../SKILL-v1/lessons.md` 的薄壳，独立安装后该引用会失效——如需用分组流程，请以 v3 为基础扩展。

## 版本对照

- **v1（`../SKILL-v1/`，统一版）**：逐篇独立下载，适合论文少、来源杂的场景
- **v2（本目录，分组版）**：按 publisher 分组后批量下载，同一组只认证一次，适合论文多、同来源的场景
- **v3（`../SKILL-v3/`，token-disciplined）**：在 v1 基础上加探针库与 Token Discipline 硬规则，canonical

## 使用

```bash
cd SKILL-v2 && node start.js
```

详见 `SKILL.md`。
