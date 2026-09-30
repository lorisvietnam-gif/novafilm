# 工程规范 / Engineering Standards

本仓库的统一工程约定。写代码、改文档、发版前先对照本文；专项细则见文末链接。

> **状态说明**：本文描述**目标约定**。第 4 节的 i18n 规则在 `vi` 语言包落地
> （`frontend/src/i18n/locales/vi/`）后生效；在此之前 `frontend/src/i18n/detect.ts`
> 仍只有 `zh` 与 `en`。以代码为准，以本文为准，二者不一致时先改本文再改代码。
>
> **仓库名说明**：本文沿用 `ai_movie` / `PRINTFILM` 的历史命名，因为这些标识符仍
> 存在于代码中（compose 项目名、Postgres 角色名、若干文件路径）。改名是独立工程，
> 见 `docs/OPEN_SOURCE_CHECKLIST.md` §2.7。

适用：`backend/`（FastAPI）、`frontend/`（用户端）、`admin/`（管理后台）、`deploy/`、`docs/`。

---

## 1. 总则

1. **用户可见文案的语言**：见第 4 节。默认 `vi`，副语言 `en`。
2. **改动克制**：只改任务需要的文件；禁止顺手大重构、无关格式化、批量改无关注释。
3. **单一真相源**：业务状态以服务端/数据库为准；前端不做「假数据当真」的长期占位（临时 mock 须标清）。
4. **敏感信息不上库**：密钥、密码、真实 `.env`、token、`.tmp/` 抓取结果不得提交。示例配置只放 `*.example`。
5. **先查再写**：新功能前先搜 `components/`、`lib/`、`services/`、`hooks/`，避免重复造轮子。
6. **不碰许可证**：`LICENSE` 永远保持上游原样，任何情况下不得修改其中的版权行或
   许可声明。新增衍生作品说明写进 `NOTICE`。
7. **不在本仓库改品牌字符串**：产品改名是独立工作项，见
   `docs/OPEN_SOURCE_CHECKLIST.md` §2。改的时候按那张清单逐条走，不要顺手在无关
   PR 里改域名。

---

## 2. 注释规范

### 2.1 函数 / 组件 / Hook

每个函数（含导出组件、Hook）顶部必须有功能注释。

- 简单：单行 `//` 或 `#`
- 复杂：块注释 / JSDoc / docstring，说明用途、关键参数、返回值

```typescript
// 按状态 Tab 映射到后端 status 查询参数
function tabToStatus(tab: string): string {
  return TAB_STATUS[tab] || 'all'
}

/**
 * 打包选中成片为 zip 并触发浏览器下载。
 * @param ids 项目 id 列表（最多 50）
 */
async function packSelected(ids: number[]) {
  /* ... */
}
```

```python
# 将分镜旁白规范化为 Seedance 可用的制作约束块
def build_seedance_production_section(segment_script: str) -> str:
    ...
```

### 2.2 变量

每个变量都要有注释。连续声明可在顶部用一块注释统一说明：

```typescript
/*
 * page 当前页码
 * total 筛选后总数
 * typeMode 类型筛选（pipeline_mode）
 */
const [page, setPage] = useState(1)
const [total, setTotal] = useState(0)
const [typeMode, setTypeMode] = useState<'' | 'full' | 'image_text'>('')
```

### 2.3 注释与 docstring 的语言

- **只写 `vi`（或 `en`）。不再新增 `zh` 注释。**
- 范围仅限 comment（`#`、`//`、`/* */`）与 docstring（`"""…"""`、`/** … */`）。
  **不是**运行期字符串字面量。
- **绝对不得修改任何字符串字面量**——即使它看起来是注释。中文用户可见串是
  API 契约的一部分，改了会连带改测试断言、邮件正文与数据。
- 存量中文注释的清理顺序见 `docs/VI_BACKLOG.md`。已清理的核心模块见
  `backend/app/main.py`、`config.py`、`database.py`、`deps.py`、`models.py`、
  `logging_setup.py`、`schemas*.py`、`services/{exc_format,llm_client,style_lock,email,password_reset,auth,storage}.py`、
  `services/tasks/{scheduler,poller,executor}.py`。

---

## 3. 目录与分层

```
backend/app/
  api/           HTTP 路由（按域拆分；drama 在 api/drama/）
  services/      业务逻辑、流水线、方舟/OSS/计费
    tasks/       进程内任务平台（scheduler/executor/poller/handlers/runtime）
    billing/     预扣、用量、结算、告警
    drama/       漫剧域，30+ 小文件按子域拆分
  models*.py     ORM（按域拆文件）
  schemas*.py    Pydantic 入出参
frontend/src/
  i18n/          多语言：detect / messages / context / lookup / locales/
  pages/         路由页（studio / drama / …）
  components/    可复用 UI
  api/           HTTP 客户端
  lib/           纯函数工具
  styles/        用户端全局样式（printfilm.css + pf-* 语义 class）
admin/src/
  pages/         运营页
  components/ui/ shadcn 组件
  api/           管理端请求
deploy/          中间件 compose、环境变量示例、维护脚本
docs/            规范与专题文档（本规范所在处）
```

约束：

| 层 | 可以 | 不要 |
|----|------|------|
| `api/` | 鉴权、参数校验、调 service、组响应 | 堆长业务/直接拼上游请求 |
| `services/` | 核心业务、外部 API、DB 编排 | 依赖具体 HTTP Request 对象做业务分支（除非必要） |
| `pages/` | 页面编排、本地 UI 状态 | 复制一整段 API 细节；应走 `api/` |
| `lib/` | 纯函数、静态内容表 | 变成第二个 `i18n/locales/`（见 §4.4） |
| 单文件 | 尽量 < 500 行 | 继续膨胀；拆 `lib/` / 子组件 / service |

---

## 4. 前端规范

### 4.1 i18n：三条硬规则

1. **默认语言 `vi`，副语言 `en`。** 新增用户可见文案只写进 `vi` 语言包；`en` 跟齐。
   `zh` 语言包保留，供仍需中文的环境使用，**但不要求补齐新文案**。
2. **API 枚举值不翻译。** 任何从接口取值、存库、进 URL query 的状态码、类型码、
   模型 id、任务类型，一律保持服务端原值。中文只存在于**展示层映射表**里
   （例如 `admin/src/lib/statusLabels.ts` 把 `DRAFT` 映射成显示文字）。
3. **改 `zh` 之前先确认是不是枚举。** `projects.pipeline_mode`、`task_runs.status`、
   `wallet_ledger.kind`、`models_drama.*.status` 这类值同时是 API 契约与数据库内容，
   翻译它们等于改数据。

语言包结构（`frontend/src/i18n/`）：

```
detect.ts      type Locale、LOCALES、LOCALE_HTML、LOCALE_DATE、isLocale、detectLocale、applyLocale
messages.ts    messages: Record<Locale, Messages>，Messages = typeof zh（形状以 zh 为准）
context.tsx    I18nProvider / useI18n / t()
lookup.ts      嵌套 key 查找
locales/<loc>/{shell,pages}.ts
```

`Messages = typeof zh`，所以**每个 locale 必须有 `zh` 的全部 key，形状与类型完全一致**。
`tsc` 报缺 key 就是真错，不要用 `as any` 绕过。

切语言按钮在 `frontend/src/components/layout/LanguageSwitch.tsx`；新增语言必须同时改
`detect.ts`（`Locale`、`LOCALES`、`LOCALE_HTML`、`LOCALE_DATE`、`isLocale`、
`localeFromBrowser` 的回退分支）和该组件。

### 4.2 字体

| 语言 | 字体 | 声明位置 |
|------|------|---------|
| 品牌英文 | Space Grotesk | `frontend/index.html:12` |
| 越南语正文（默认） | Noto Sans | `frontend/index.html:12` |
| 中文正文 | Noto Sans SC / Noto Serif SC | `frontend/index.html:12` |

**`vi` 必须有独立的字体子集。** Noto Sans SC 不含拉丁扩展重音字母，直接复用会让
越南语声调符号回退到系统字体，行高与字重都会跳。`frontend/index.html` 属于
字体子集改动的工作面，修改时确认三套字体同时加载、且 `LOCALE_HTML.vi` 的
`font-family` 兜底链完整。

管理后台（`admin/src/index.css:26-27`）目前用 `Anybody` + `Figtree`，两套都是纯
拉丁字体，**没有中文也没有任何 i18n 层**，见 `docs/ADMIN_I18N_PLAN.md`。不要在
用户端引入 Tailwind，也不要把管理端的 Tailwind class 搬进用户端。

### 4.3 用户端 `frontend/`

- 样式以 **`styles/printfilm.css` + 语义化 class（`pf-*`）** 为主。
  核心 token 在 `frontend/src/index.css:2-6`（`--pf-lime: #b6ff00`、
  `--pf-ink: #111318`、`--pf-bg: #f7f8fa`）。
- 路由与壳：`AppShell` / `SiteNav`；漫剧页 `active="drama"`。
- 请求统一走 `src/api.ts` / `src/api/*`；错误用可读文案抛给 UI（走 i18n）。
- 列表筛选、分页：**服务端分页**（见历史页 `/api/projects`）；禁止只在前端 slice
  全量列表当长期方案。
- 组件内临时 UI 状态用 `useState`；跨页共享若出现，优先评估提升到明确模块。
- **不要硬编码中文标签。** 已知存量见 `docs/VI_BACKLOG.md` §4（例如
  `pages/TemplatesPage.tsx:31` 与 `pages/studio/CreateProjectPage.tsx:219` 打印
  `全部` / `热门推荐`，而 `templates.all` 这个 key 已经存在却没被用）。

### 4.4 管理端 `admin/`

- **Tailwind v4 + Radix/shadcn 风格组件**；用 `cn()` 合并 class。
- 布局可用 `admin-*.css` / `index.css` 中的语义 class（与用户端 `pf-*` 分离）。
- 分页组件复用 `PaginationBar`；列表接口带 `page` / `page_size` / `meta`。
- 文案目前硬编码中文。**在 `docs/ADMIN_I18N_PLAN.md` 落地前不要单点翻译**——
  单独翻译 `statusLabels.ts` + `dramaLabels.ts` 会造出一个半中半越的管理端，比现状更差。

### 4.5 交互与可访问性

- 按钮写清 `type="button"`（表单内防误提交）。
- 危险操作（删除、扣费）用确认对话框，文案说明后果。
- 加载 / 空态 / 错误三态都要有，禁止静默失败。

---

## 5. 后端规范

### 5.1 API

- 路径：`/api/...`；漫剧 `/api/drama/...`；管理 `/api/admin/...`。
- 鉴权：用户接口 `get_current_user`；管理 `get_current_admin`。
- 入参用 Pydantic；出参明确 `response_model`。
- 列表默认：**分页**（`page`、`page_size`、`meta.total`），并支持必要筛选参数。
- 错误：业务用 `HTTPException`，`detail` 为面向用户的短句；勿把堆栈直接回给前端。
  **改这些字符串前先看 `docs/VI_BACKLOG.md` §2**——目前 143 行中文 `detail`
  分散在 26 个文件，其中 104 个测试文件（1,375 行中文）断言了其中的字面量。

### 5.2 异步与任务

- 长任务走**进程内任务平台** `app/services/tasks/`，不走 Celery。Celery 依赖是历史
  遗留（`requirements.txt:12` 仍 pin 着，但无任何代码 import；`workers/` 目录不存在）。
  新增任务类型**必须**在 `tasks/handlers.py` 的 `HANDLERS` 注册表登记
  `(domain, task_type)`，否则 `create_task` 直接抛
  `当前任务类型尚未接入任务平台`（`service.py:106`）。
- **生产 API 单 worker**（`uvicorn --workers 1`）。多 worker 会起多套
  scheduler/poller/watchdog，且进度 SSE 会退化成进程内队列而跨进程失效
  （`services/progress.py:15-16`）。
- 启动 `seed_*` 不得阻塞过久：已有 OSS URL 勿重复同步上传。
- 没有 Alembic。启动时 `init_db()` 跑 `create_all`，**新增列必须手写进
  `main.py` 的 `_apply_schema_patches()`**（只允许 additive 的 PG DDL），测试 schema
  也要同步。详见 `docs/OPERATIONS.md` §8.1。

### 5.3 数据与媒体

- 成片/分镜先落本地供 FFmpeg，再按配置上传 OSS；DB 存可访问 URL。
- 删除项目时清理关联素材与 `works` 等从属数据（保持现有 delete 语义）。

### 5.4 计费 / 易支付

- SKU、扣费逻辑以 `services/billing/` 为准（`pricing.py`、`settlement.py`、
  `usage.py`、`alerts.py`、`estimates.py`、`ephemeral.py`）。每个 TaskRun 走
  「`ensure_balance_for_task` 检查 → `freeze_for_task` 预扣 → `record_line` 记用量 →
  `settle_task` 结算」。
- 预扣有且只有一个入口 `freeze_for_task`（`settlement.py:169`），代码里**不存在**
  叫 `pre_hold` 的函数。
- `settle_task` 先写终态再结算，因此后台对账扫描需要 120 s 宽限期
  （`settlement.py:356`）。改动终态写入顺序时必须同步这个常量。
- 生产 `EPAY_NOTIFY_URL` **禁止含 `/api/`**（易支付 WAF）；使用 `/epay/notify` +
  nginx 反代（`frontend/nginx.conf:9-15`）。详见
  [BILLING.md](./BILLING.md) 与 `docs/OPERATIONS.md` §7.4。

### 5.5 上游与模型

- 开源版**只允许一个上游**（TokenFree New API），由
  `services/tokenfree_gateway.py` 与 `model_settings.py` 强制。新增渠道前先读
  `docs/OPEN_SOURCE_CHECKLIST.md` §5——抽象成可插拔 provider 是独立工程。
- 逻辑模型 id 必须同时登记在 `services/media_model_presets.py` 的 `PRESET_MODELS`
  和别名映射 `PRESET_MODEL_ALIASES`，否则目录展示与计费归一化会对不上。
- 路由解析顺序见 `docs/OPERATIONS.md` §6.4。

---

## 6. Git 与协作

- 提交信息：Conventional Commits，**英文**，说明**为什么**，1–2 句。
  波次类工作建议带 scope：`feat(vi):`、`fix(vi):`、`docs(vi):`、`chore(legal):`、
  `docs(ops):`、`refactor(vi):`。
- 一个 commit = 一个工作单元。
- 不提交：`.env`、`*.log`、密钥、`deploy/scripts/deploy_kepu*.py`、`.cursor/`、
  `.claude/`、`docs/releases/`、`docs/reports/`、`docs/DEPLOY.md`、`frontend/dist`、
  `admin/dist`、`node_modules`、`.venv`。
- **不 `git push`。** 合并与推送由维护者统一执行。
- 改动了计费 / 发布方式 / 占位入口 / 运营流程，同批更新对应 docs。
  判据：别人接手能不能只靠 `docs/` 把系统跑起来。

---

## 7. 文档与发布

| 文档 | 何时更新 |
|------|----------|
| [OPERATIONS.md](./OPERATIONS.md) | 架构、任务生命周期、计费、路由、部署、故障排查有变化时 |
| [OPEN_SOURCE_CHECKLIST.md](./OPEN_SOURCE_CHECKLIST.md) | 品牌、素材来源、密钥、依赖许可状态变化时 |
| [VI_BACKLOG.md](./VI_BACKLOG.md) | 清理一项越南语改造存量时（改完就减一项） |
| [ADMIN_I18N_PLAN.md](./ADMIN_I18N_PLAN.md) | 管理端 i18n 方案推进时 |
| [BILLING.md](./BILLING.md) | SKU、计费公式、支付配置变更 |
| [PLACEHOLDER_BACKLOG.md](./PLACEHOLDER_BACKLOG.md) | 新增/下线 ComingSoon、disabled 入口 |
| **本文 STANDARDS.md** | 全局约定变更时 |
| `DEPLOY.md` / `releases/`（本机，不上库） | 现网发布方式与每次发版记录 |

发布原则：

- 线上站点 = 机器 nginx + systemd，**不是**把 SPA 丢 OSS 当发布
  （`deploy/README.md:5`）。
- 现网流程与检查清单写在本机 `docs/DEPLOY.md`（不上开源仓库）；公开读者以
  `docs/OPERATIONS.md` 为准。

---

## 8. 安全与配置

- 示例配置只放 `*.example`；真实值只在服务器 / 本机 `.env`。
  `frontend/.env.production` 是**例外且被 force-include**：它必须入库，因为 Vite
  只在构建环境读它。里面**只允许非敏感构建开关**（当前仅 `VITE_API_BASE`），
  任何时候不得加 key / token。
- CORS 只放真实前台域名。
- 管理接口必须 `role=admin`；bootstrap 邮箱仅提升已有用户，不造号，且**需重启**。
- `SECRET_KEY` 同时用于 JWT 签名与库内密钥加密（Fernet 派生自它的 sha256）。
  **轮换 `SECRET_KEY` 会让所有已存库的上游 Key 静默解密失败**
  （`services/model_settings.py:82-84`）。轮换前先把库备份。
- 改域名/主机白名单（`services/oss.py:83-91`、`services/storage.py:174-177`）时
  注意 `storage.py:176` 有一个历史拼写错误域名 `kepu.printtfilm.com`，以及这些
  列表同时影响本地/远端判定，错误的条目方向会引发全量重传。

---

## 9. 自检清单（提 PR / 发版前）

- [ ] 新增函数/组件有顶部注释；成组 state 有块注释
- [ ] 新增注释/docstring 是 `vi` 或 `en`，没有新造中文注释
- [ ] 没有新增硬编码用户可见文案（走 `i18n`）；没有翻译任何 API 枚举值
- [ ] `cd frontend && npm run lint && npm run build` 通过
- [ ] `cd admin && npm run lint && npm run build` 通过
- [ ] `cd backend && pytest` 通过（改了 backend 时）
- [ ] 文件未明显超过 500 行，或已拆分
- [ ] 列表接口带分页；筛选在服务端
- [ ] 无密钥、无本机绝对路径写入仓库
- [ ] 若动了计费 / 路由 / 任务平台 / 部署，`docs/OPERATIONS.md` 同步更新
- [ ] 若动了品牌 / 素材 / 依赖，`docs/OPEN_SOURCE_CHECKLIST.md` 同步更新
- [ ] 若减了一项越南语存量，`docs/VI_BACKLOG.md` 同步更新
- [ ] `LICENSE` 未被修改

---

## 10. 相关文档

- [README.md](../README.md) — 仓库总览与快速开始
- [OPERATIONS.md](./OPERATIONS.md) — 运营手册（架构 / 配置 / 任务 / 计费 / 部署 / 排障）
- [OPEN_SOURCE_CHECKLIST.md](./OPEN_SOURCE_CHECKLIST.md) — 开源分发前置检查
- [VI_BACKLOG.md](./VI_BACKLOG.md) — 越南语改造存量清单
- [ADMIN_I18N_PLAN.md](./ADMIN_I18N_PLAN.md) — 管理端国际化方案
- [BILLING.md](./BILLING.md) — 计费
- [EPISODE_RULES.md](./EPISODE_RULES.md) — 漫剧分集规则
- [SEEDANCE_2_5.md](./SEEDANCE_2_5.md) — Seedance 参数
- [PRINTFILM_UI_ROADMAP.md](./PRINTFILM_UI_ROADMAP.md) — UI 路由与视觉
- [PLACEHOLDER_BACKLOG.md](./PLACEHOLDER_BACKLOG.md) — 占位功能表
- 本机 `DEPLOY.md` / `releases/` — 现网发布（不上库）
