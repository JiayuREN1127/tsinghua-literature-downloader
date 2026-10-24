# 清华文献下载器

通过已登录清华图书馆或 WebVPN 的 Chrome 会话下载学术 PDF。

英文版：[README.md](README.md)

## 来源

本仓库改编自 [zju-literature-downloader](https://github.com/baihe26/zju-literature-downloader.git)（[@baihe26](https://github.com/baihe26) 的浙江大学版）。清华版在此基础上重写，面向清华大学图书馆、水木学术搜索和机构访问路径。

## 当前版本 v4.1

维护中的版本是 [SKILL-v4.1](SKILL-v4.1/)，版本号 `4.1.0`。每次 session 的第一次操作前，它会拿本地版本和 GitHub 最新 release 比一次；有新版本就报出两边版本号和链接，升不升级由用户决定。检查失败就说明情况，继续用本地版。v4 及更早的目录留在仓库里，作历史存档。

v4.1 保留按数据库分组、预热和 canary 的做法。文章 tab 并行打开，PDF 逐篇下载。每篇文献的自动尝试累计 120 秒，批次结束后统一核对 DOI 和标题。

ScienceDirect 走文章里实际的 PDF 链接，每篇单独开一个 tab。PDF 下载完、检查过、存好之后，这一篇的 tab 关闭；失败或等人处理的 tab 留着排查。其他数据库沿用各自的固定策略。

测试用 `cd SKILL-v4.1 && npm test`。现场结果和已知局限见 [lessons](SKILL-v4.1/lessons.md)，完整流程见 [SKILL](SKILL-v4.1/SKILL.md)，最新构建在 [releases 页面](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/latest)。

下面的版本对照和性能数据讲的是 v3.4 及更早的版本，不是 v4 的执行策略，也不是现在的基准。

## 工作方式

```
你的 Chrome（已登录清华）  ←  CDP 代理  ←  AI agent
        ↓
水木学术搜索 / Alma resolver  →  出版商页面  →  下载 PDF
        ↓
[FlareSolverr，可选]  →  自动通过 Cloudflare JS 挑战
```

## 前置条件

- Chrome 已登录水木学术搜索
- Chrome 远程调试已开启
- Node.js 22 及以上
- FlareSolverr（可选，用于自动通过 Cloudflare 验证）

## 目录结构

```
├── SKILL-v1/    统一版，逐篇下载                           历史版，冻结
├── SKILL-v2/    分组版，按出版商批量                       历史版，冻结
├── SKILL-v3/    token 纪律（探针加 action 库）             历史版，冻结
├── SKILL-v3.1/  click-first（浏览器原生点击下载）          历史版，冻结
├── SKILL-v3.2/  网络安全（硬规则加事件复盘）               历史版，冻结
├── SKILL-v3.3/  策略写死加 fail-fast 哨兵                  历史版，冻结
├── SKILL-v3.4/  并行批次（N 个 tab 加载，串行下载）        冻结
├── SKILL-v4/    固定策略、120 秒、批末核对                 上一版，冻结
├── SKILL-v4.1/  ScienceDirect 直链，逐篇关 tab             当前版
├── TEST/        测试清单和实测报告
├── sync.sh      把当前版同步到各 AI 工具的 skill 目录
├── README.md
└── README_CN.md
```

## 版本历史

| 版本 | Tag | 目录 | 主要变化 | 状态 |
|---|---|---|---|---|
| v4.1.0 | `v4.1.0` | `SKILL-v4.1/` | ScienceDirect 走 PDF 直链，每篇一个 tab，存好后关闭 | **当前版** |
| v4.0.1 | `v4.0.1` | `SKILL-v4/` | 每次 session 开始检查新版本，升级前先问用户 | 上一版 |
| v4.0.0 | `v4.0.0` | `SKILL-v4/` | 固定策略按实测更新，120 秒上限，批末核对，同范围以较新的 lesson 为准 | 上一版 |
| v3.4 | `v3.4` | `SKILL-v3.4/` | 批内并行加载，串行下载 | 冻结 |
| v3.3 | `v3.3` | `SKILL-v3.3/` | 一库一策略，分组 fail-fast 哨兵，`strategies.tsv` | 冻结 |
| v3.2 | `v3.2` | `SKILL-v3.2/` | 网络安全硬规则（禁 `0.0.0.0` 绑定，禁代理外转） | 冻结 |
| v3.1 | `v3.1` | `SKILL-v3.1/` | click-first（8 篇里 5 篇用浏览器原生下载，7 篇成功） | 冻结 |
| v3.0 | `v3.0` | `SKILL-v3/` | token 纪律硬规则加探针库（token 少 1000 倍） | 冻结 |
| v2.0 | `v2.0` | `SKILL-v2/` | 按出版商分组下载，加 FlareSolverr 预热 | 冻结 |
| v1.0 | `v1.0` | `SKILL-v1/` | 统一版，逐篇下载；原始 HTML 进 context，token 消耗高 | 冻结 |

## 变更记录

### v3.2：一次安全事件

2026 年 7 月 26 日，v3.1 运行时，agent 想让 Docker 容器访问本机的 Clash 代理，自行执行了 `socat TCP-LISTEN:17897,bind=0.0.0.0 TCP:127.0.0.1:7897`。代理就此暴露到整个校园网，触发了学校“私设代理”的安全告警。

修复：`SKILL.md` 加了 Network Security Guardrails 一段，共 5 条硬规则，禁止任何 `0.0.0.0` 绑定，禁止把代理转给外部。FlareSolverr 的安装说明改成 Docker 是推荐的跨平台路径（Apple Silicon 也能用），但端口映射必须写 `-p 127.0.0.1:8191:8191`。上游 README 里的裸 `-p 8191:8191` 默认绑定 `0.0.0.0`，本 skill 不允许。容器联网用 `host.docker.internal` 或 `--dns` 解决，不用 `socat` 从 `0.0.0.0` 桥接。规则里只有占位符（`<proxy-port>`、`<resolver>`、`host.docker.internal`），不写死 IP 和端口，别人拿去也能用。

### v3.3：把策略写死

原因：v3.2 在 click-first 和 fetch 之间来回兜底。策略一旦失效，agent 两种都试，token 就烧掉了。同一数据库的 PDF 获取路径和用户验证步骤几乎不变，完全值得写死。

改动：

- 每个库写死一种下载方式（fetch、click-download、navigate-download、click 加人工协助），click 和 fetch 之间不兜底。方式坏了，agent 当场改 action 文件并更新 `updated_at`，不偷偷换方法。
- fail-fast 哨兵：每个库的第一篇必须走通固定方式。走不通，整库停下交回用户，带上失败类型、是哪篇、该改哪一行。不批量试错。
- 分组下载成为标准流程：列清单、按库分类（`journal_database_mapping.md`）、逐库预热、跑哨兵、再批量。
- 新增 `strategies.tsv` 清单，记录每库策略的新鲜度：库、子类型、策略、`last_tested`、`updated_at`。
- 各库的访问特点（CAPTCHA、镜像、最稳来源）写进 `SKILL.md` 的策略段，不再放单独文件。
- SAGE 写死国内镜像 `cnpereading.com`，不用 `journals.sagepub.com`。
- v3.2 的网络安全硬规则、v3 的探针库和 token 纪律、安全绑定的 FlareSolverr 都保留。

### v3.4：并行批次

原因：v3.3 的 Stage D 只用一个认证 tab，逐篇导航。每篇页面渲染要 8 到 12 秒，浏览器的并行加载能力闲着。

改动：

- 并行加载，串行下载。canary 通过后，一批同时开 N 个 tab（默认 10，每个 session 在 Stage D 前问一次），各自加载一篇文章页。下载时一个 tab 一个 tab 来：点击、`mv`、核对、记日志。`ls -t ~/Downloads | head -1` 仍然能把文件归到当前这篇。
- ScienceDirect 并进批次。tab 并行打开，CAPTCHA 逐个人工解，下载仍然串行。
- 撞上 bot 自动错峰。同一出版商的批次里有两个以上 tab 遇到 bot 挑战，后面的 tab 改成每 1 到 2 秒开一个，总结里注明。
- tab 生命周期：每批新开，批后即关。认证 tab 一直开着，作为 CAS 锚点。
- canary 保持串行：策略验证和选择器缓存仍在一篇文献上、在认证 tab 里完成。
- v3.3 的东西全部继承：一库一策略加 fail-fast 哨兵、`strategies.tsv`、`journal_database_mapping.md` 分类器、v3.2 的防线、v3 的 token 纪律。

### 下载策略对比（v3.4，历史）

| | fetch() | click-download | navigate-download | click 加人工协助 |
|---|---|---|---|---|
| Agent token | 最省：一次 `get-pdf.mjs` 调用，分块在 Node 里完成，agent 只看结果 | 稍多：找按钮、点击、查 `~/Downloads`、`mv`，3 到 4 次紧凑交互 | 较省：一次 CDP `/navigate` 到 pdfdirect URL，再查文件和 `mv`，2 到 3 次交互 | 最多：等人解 CAPTCHA，agent 反复查页面状态 |
| 下载速度 | 慢：fetch 到 arrayBuffer 后每块一次 CDP 往返（4 MB 约 10 到 30 秒） | 快：浏览器直接写盘（4 MB 约 2 到 5 秒） | 快：导航触发原生下载（4 MB 约 2 到 5 秒） | 取决于人：CAPTCHA 解开后点击很快，等待占大头 |
| 数据库 | SAGE、T&F、Annual Reviews、IEEE、Wiley-OA（10 库里的 4 个） | JSTOR、ProQuest、EBSCO、Nature（10 库里的 4 个） | Wiley 订阅（10 库里的 1 个） | ScienceDirect（10 库里的 1 个） |
| 失败成本 | v3.3 写死后变低：只用在确实返回 `application/pdf` 的库；用错地方代价高（服务条款、Cloudflare、viewer 拦截） | 低：像人一样操作，第一次就能成，没有诊断开销 | 低：cookie 和 Cloudflare 交给浏览器，导航即下载 | 中：CAPTCHA 自动化不了，但解开之后点击可靠 |

### 版本演进（v1 到 v3.4）

| | v1（原始） | v2（加 FlareSolverr） | v3（token 纪律） | v3.1（click-first） | v3.2（网络安全） | v3.3（策略写死） | v3.4（并行批次） |
|---|---|---|---|---|---|---|---|
| 页面读取 | 原始 innerHTML/innerText（每页 100 到 500 KB） | 同 v1 | 探针每次约 200 B，DOM 在服务端过滤 | 同 v3 | 同 v3 | 同 v3，探针优化 | 同 v3，探针优化 |
| Token | 约 250K | 约 200K | 约 150 | 约 300 | 约 300 | 约 300（哨兵验过首页后批量不再 re-probe，均摊更省） | 同 v3.3，并行批次不增加 re-probe |
| 下载方式 | 全部 fetch() 分块 | 全部 fetch() 分块 | 全部 fetch() 分块 | 8 篇里 5 篇点击、2 篇 fetch、1 篇人工 | 同 v3.1 | 一库一策略，不兜底：4 库 fetch、4 库 click-download、1 库 navigate、1 库 click 加人工 | 同 v3.3；变的是编排：N 个 tab 并行加载文章页，下载仍串行 |
| 下载速度 | 慢（分块，4 MB 约 20 秒） | 慢（同 v1） | 慢（同 v1） | 快（原生流式下载，4 MB 约 3 秒） | 同 v3.1 | 同 v3.1，多数库走原生，只有 fetch 库分块 | 更快：每篇 8 到 12 秒的渲染时间重叠掉了，下载阶段和 v3.3 一样 |
| 成功率 | 2/8 | 3/8（加上 Wiley） | 2/8（探针改善了诊断，fetch 仍有 6/8 失败） | 7/8 | 7/8 | 待实测（目标 ≥ 7/8，哨兵省掉批量浪费） | 待实测（目标 ≥ 7/8，策略成功率不变） |
| 核心改进 | 无 | FlareSolverr 通过 Cloudflare | 探针库加 token 纪律（token 少 1000 倍） | click-first（2/8 到 7/8，快 3 到 10 倍） | 网络安全硬规则（禁 `0.0.0.0` 绑定，禁代理外转） | 一库一策略，分组 fail-fast 哨兵，`strategies.tsv` | N 个 tab 并行加载（默认 10，会话参数），串行下载保证文件归属，ScienceDirect 并入并行，撞 bot 自动错峰 |

## 快速开始

```bash
# 当前版
cd SKILL-v4.1 && node start.js

# 任何冻结版也这样启动
cd SKILL-v3.4 && node start.js
```

每个 `SKILL-vX/` 目录里都有自己的 README.md 和 SKILL.md。

## 同步到 AI 工具

```bash
./sync.sh          # 试运行
./sync.sh --apply  # 把 SKILL-v4.1 复制到当前的 skill 目录
```

`sync.sh` 把当前版装进已有的 skill 目录，包括各 Codex 账号下的安装。历史版不动，除非传 `--include-legacy`。

## 发布版本

带 changelog 的 tag 都在 [Releases](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases) 里：

- [`v4.1.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v4.1.0)：ScienceDirect 直链，逐篇关 tab（当前）
- [`v4.0.1`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v4.0.1)：session 开始时检查更新并提醒
- [`v4.0.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v4.0.0)：固定策略、120 秒上限、批末核对
- [`v3.4`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.4)：并行加载加串行下载（冻结）
- [`v3.3`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.3)：策略写死加 fail-fast 哨兵
- [`v3.2`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.2)：网络安全硬规则
- [`v3.1`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.1)：click-first 下载策略
- [`v3.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v3.0)：token 纪律的探针和 action 库
- [`v2.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v2.0)：分组下载加 FlareSolverr 预热
- [`v1.0`](https://github.com/JiayuREN1127/tsinghua-literature-downloader/releases/tag/v1.0)：最初的统一版 skill
