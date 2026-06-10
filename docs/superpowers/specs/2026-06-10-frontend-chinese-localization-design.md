# 前端核心页中文化 — 设计文档

> 2026-06-10 · 分支 `vulture-webtrim` · VultureHub 内网注册中心

## 目标

把前端面向用户的核心页里的英文文案就地改为中文,服务内网纯中文用户。本轮只做中文化,**不**碰品牌改名(ClawHub→VultureHub 的 Stage 6 单独做)。

## 落地方式

**就地改文案**——直接把 JSX 文本 / `label` / `placeholder` / `title` / `toast` / 空态文案里的英文改成中文。当前项目**无任何 i18n 体系**(无 i18next/react-intl 依赖),英文硬编码在 39 个路由 + 92 个组件里。内网纯中文、无多语言需求,引入 i18n 属过度设计(YAGNI)。

## 范围

### 本轮(面向用户的核心页 + 全局 chrome),按主题分 6 笔原子提交

| # | 主题 | 文件 |
|---|---|---|
| 1 | 全局 chrome | `components/Header.tsx`、`components/Footer.tsx` |
| 2 | 浏览/发现 | `routes/index.tsx`、`routes/search.tsx`、`routes/skills/index.tsx`、`routes/skills/-SkillsToolbar.tsx`、`routes/skills/-SkillsResults.tsx`、`routes/plugins/index.tsx` |
| 3 | 详情 | `routes/plugins/$name.tsx`、`routes/$slug.tsx`、`components/SkillHeader.tsx`、`components/SidebarMetadata.tsx`、`components/BrowseSidebar.tsx` |
| 4 | 发布/导入 | `routes/skills/publish.tsx`、`routes/plugins/publish.tsx`、`routes/import.tsx` |
| 5 | 管理后台 | `routes/management.tsx`、`routes/-management/{SkillsPage,PluginsPage,DuplicatesPage,RecentPushesPage,UsersPage}.tsx`、`routes/audits.tsx` |
| 6 | 发布者 | `routes/publishers/index.tsx` |

### 本轮不含(后续批次)

其余 ~80 个 components(卡片 / 骨架 / 弹窗 / 深层空态等)。只改路由层时,页面里由这些深层组件渲染的零散文案仍是英文;每个核心页"主要渲染的 chrome 组件"(如 SkillHeader)已纳入本轮,深层小组件留批次二。

## 翻译规约

### 保留英文(不译)

- **品牌名**:`ClawHub` / `VultureHub`(完全不动)
- **技术名词**:`Skill` / `Plugin` / `Package` / `Registry`(UI 里保留英文,不译成"技能/插件/包")
- **代码相关**:CLI 命令(`clawhub …`)、代码示例、URL slug、schema 字段名、`README` / `MIT-0` / `SHA` / `tag` / `commit` / `repo`

### 中英混排约定

保留的英文名词作为 token 嵌进中文句:

- `Search skills` → `搜索 Skill`
- `Plugin not found` → `未找到该 Plugin`
- `Publish a skill` → `发布 Skill`
- `Browse plugins` → `浏览 Plugin`

中文无复数,英文名词一律用单数形(`Skill` 而非 `Skills`)。

### 语气与标点

- 简洁书面中文。
- 句末**不**加英文句号;用中文标点(,。:、)。
- 省略号用 `…`(如 `加载中…`)。

### 术语表

| 英文 | 中文 | 英文 | 中文 |
|---|---|---|---|
| Publish | 发布 | Import | 导入 |
| Upload | 上传 | Install | 安装 |
| Search | 搜索 | Browse | 浏览 |
| Owner / Publisher | 发布者 | Author | 作者 |
| Version | 版本 | Latest | 最新 |
| Downloads | 下载量 | Trending / Popular | 热门 |
| Recent | 最近 | Featured | 精选 |
| Description | 描述 | Summary | 摘要 |
| Name | 名称 | Title | 标题 |
| Required | 必填 | Optional | 可选 |
| Loading… | 加载中… | No results | 没有找到结果 |
| Empty / None | 暂无 | Not found | 未找到 |
| Submit | 提交 | Cancel | 取消 |
| Save | 保存 | Delete | 删除 |
| Edit | 编辑 | Remove | 移除 |
| Back | 返回 | Next | 下一步 |
| Settings | 设置 | Management | 管理 |
| Users | 用户 | Duplicates | 重复项 |
| Audits | 审计 | Recent pushes | 最近推送 |
| Sign in | 登录 | Sign out | 退出登录 |
| Copy | 复制 | Copied | 已复制 |
| View | 查看 | View all | 查看全部 |
| Created | 创建于 | Updated | 更新于 |
| Tags | 标签 | Category | 分类 |
| Filter | 筛选 | Sort | 排序 |
| Results | 结果 | Showing | 显示 |

(实现中遇到新词追加到本表,保持全局一致。)

## 测试与提交策略

- **测试同步**:断言英文串的测试(`*-publish-route.test.tsx`、`home-route.test.tsx`、`SkillHeader.test.tsx`、`ui-design-contract.test.ts`、`Footer.test.tsx` 等)随对应文案改动**同步更新**;每笔提交后跑门禁保持全绿。
- **提交粒度**:上表 6 个主题各一笔原子提交,信息 `refactor: 中文化 — <主题>`,**不带 Co-Authored-By**。
- **门禁**(每笔提交前):
  ```sh
  VITE_CONVEX_URL=https://example.invalid bun run test
  bunx tsc --noEmit
  bun run lint
  ```

## 不在范围

- 后端 convex 函数、HTTP API、CLI 包(`packages/clawhub*`)
- convex schema 字段名(`clawhub*` 保留)
- 品牌改名 ClawHub→VultureHub(Stage 6)
- 工具注入文件 `.gitignore` / `AGENTS.md` / `CLAUDE.md`,未追踪 `.claude/` / `self-host/`
- 深层非 chrome 组件(批次二)
