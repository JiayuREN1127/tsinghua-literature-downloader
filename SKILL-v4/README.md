# Tsinghua Literature Downloader v4

通过用户已登录的清华机构访问会话下载 PDF。完整执行要求见 [SKILL.md](SKILL.md)。

- 按数据库分组预热、canary；N 个文章 tab 并行加载，PDF 串行下载。
- 每库固定策略：已验证 fetch 优先，其次直链，再其次其他动作。
- AI 单篇自动尝试累计最多 120 秒；到时停组交用户，不静默重置计时。
- 全部下载结束后统一核对 DOI/标题并输出一份逐篇 log。
- 最新有日期且同范围的 [lessons.md](lessons.md) 执行策略优先；同步维护 [strategies.tsv](strategies.tsv) 和动作脚本。

需要 Node.js 22+、用户已登录 Chrome 及已启用的远程调试。`node start.js` 启动本机接口；所有监听仅 localhost。禁止绕过付费墙、人机验证或导出凭据。

```bash
node scripts/get-pdf.mjs --list
node scripts/get-pdf.mjs --target <tab> --publisher ebsco --out <paper-id>.pdf --timeout 120
python3 scripts/reconcile-pdfs.py --manifest <manifest.json> --log <download-log.tsv>
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
```

`--timeout` 是当前累计尝试剩余秒数，最大120；后续重试须扣除已耗时间。脚本不自动登录、不跨方法重试、不覆盖已有输出。临时 tab 在传输后关闭。

统一核对脚本需要 PyMuPDF（`import fitz`）。Manifest 格式及 log 字段见 SKILL.md；缺少 DOI 文本或标题不符进入 review_required，由运行 agent 核查归属。测试套件包含模拟浏览器代理；它不代表所有数据库已 live-retested。

策略与本轮现场结果依据 2026-10-16 lessons；AUA 目前仅手动下载验证，自动 canary 仍需执行。历史版位于仓库独立目录，v4 不覆盖历史版。
