# Vulture 物理删除补丁清单

**用途**：本仓库离线环境下 `convex codegen` 不可用（需 `CONVEX_DEPLOYMENT` + 联网鉴权），而 `convex/_generated/` 已提交并引用每个模块/表 —— 直接删 schema 表或 convex 模块会破坏 TS 构建且无法离线重生成。因此裁剪采用「就地停用（去路由/cron/前端/测试，保 schema 表与模块为 dormant）」，并在此记录**将来拿到 Convex 部署后**一次性物理删除的精确清单。

**应用步骤（将来有部署时）**：
1. 配置 `CONVEX_DEPLOYMENT`（`npx convex dev --once` 或自托管 backend）。
2. 按本清单删除文件 / 从 `convex/schema.ts` 移除表与校验器 / 删除 `Id<"...">` 与 `ctx.db.query("...")` 残留引用。
3. 运行 `bunx convex codegen` 重生成 `_generated/`。
4. `bun run build` + `bun run test` 验证全绿。

> 状态图例：⬛ 待物理删除（当前 dormant）｜🟦 保留但需编辑（去字段/分支）｜✅ 已在停用阶段移除

---

## Phase 2 — 公开市场

### stars / soulStars
- ⬛ schema 表：`stars`、`soulStars`（schema.ts）
- ⬛ convex 模块：`convex/stars.ts`、`convex/soulStars.ts`、`convex/httpApiV1/starsV1.ts`
- ✅ HTTP 路由：`POST/DELETE /api/v1/stars/{slug}`（已从 http.ts 移除）；删除时一并去 `httpApiV1.ts` 的 `starsPostRouterV1Http`/`starsDeleteRouterV1Http` 导出与 http 导入
- ⬛ 测试：`convex/stars.test.ts`、`src/routes/-stars.test.tsx`、`e2e/local-auth/skill-star-sync.pw.test.ts`
- ⬛ 前端：`src/routes/stars.tsx`
- 🟦 保留但编辑（统计去星标）：
  - `convex/lib/skillStats.ts`：`SkillStatDeltas.stars` / `applySkillStatDeltas` 的 stars 分量
  - `convex/lib/skillSearchDigest.ts`：`statsStars`（SHARED_KEYS/extractDigestFields）
  - `convex/lib/publisherStats.ts`：`totalStars`/`skillTotalStars`
  - `convex/lib/userSkillStats.ts`、`convex/lib/public.ts`：stars 投影
  - `convex/schema.ts`：skills/skillSearchDigest 的 `statsStars` 字段与相关 index；`packageStatsValidator.stars`；`stats` 校验器 `stars`
  - 前端：`SkillHeader.tsx`/`SkillDetailPage.tsx`/`SkillStats.tsx`（星标按钮/`toggleStar`/`isStarred`/统计三连展示）
  - 注：`statsStars` 当前被搜索排序/publisherStats 复用，物理删除时需一并清理这些消费点。

### comments（含 scam 审核）
- ⬛ schema 表：`comments`、`commentReports`
- ⬛ convex 模块：`convex/comments.ts`、`convex/comments.handlers.ts`、`convex/commentModeration.ts`、`convex/lib/commentScamPrompt.ts`；`convex/llmEval.ts::evaluateCommentForScam`（仅 commentModeration 调用）
- ⬛ 测试：`convex/comments.test.ts`、`convex/comments.query.test.ts`、`convex/commentModeration.test.ts`、`convex/lib/commentScamPrompt.test.ts`
- ⬛ 前端：`src/components/SkillCommentsPanel.tsx`
- 🟦 保留但编辑：
  - `convex/skillStatEvents.ts` + schema `skillStatEvents.kind`：去 `comment`/`uncomment`
  - `convex/lib/skillStats.ts`、`convex/statsMaintenance.ts`：去 `stats.comments` 计算
  - `src/components/SkillDetailPage.tsx`：去 `SkillCommentsPanel` 引用；`src/__tests__/skill-detail-page.test.tsx` 去其 mock
  - 注：`soulComments` 属 souls（Phase 3 删），与本组分离。

### leaderboards
- ⬛ schema 表：`skillLeaderboards`；`skillDailyStats`（若停用 trending 后无消费者）
- ⬛ convex 模块：`convex/leaderboards.ts`、`convex/lib/leaderboards.ts`
- ⬛ 测试：`convex/leaderboards.test.ts`、`convex/lib/leaderboards.test.ts`
- ✅ cron：`trending-leaderboard`（已从 crons.ts 移除）
- 🟦 保留但编辑：
  - `convex/skills.ts:1832-1848` `hardDeleteSkill` 的 `leaderboards` 分支
  - `convex/skills.ts:5360-5390` `listPublicTrendingPage`（读 skillLeaderboards）→ 删除导出 + 前端消费点（首页 trending）
  - 保留 `skillStatUpdateCursors`（共享）；`publisherAbuse` 温度计读 `skillDailyStats`，但 publisherAbuse 同样被删，故 `skillDailyStats` 可一并删

### reports / appeals / 审核状态机
- ⬛ schema 表：`skillReports`、`skillAppeals`、`skillModerationEventLogs`、`packageReports`、`packageAppeals`、`packageModerationEventLogs`
- ⬛ convex 模块：`convex/lib/artifactModeration.ts`、`convex/lib/reporting.ts`
- ⬛ 前端：`src/components/SkillReportDialog.tsx`、`src/routes/-management/ReportsPage.tsx`
- 🟦 保留但编辑：
  - `convex/skills.ts`：`report`/`reportSkillForUserInternal` 及 appeal 相关类型/函数（4150-4296+），去 artifactModeration/reporting 导入
  - `convex/packages.ts`：`triagePackageReportForUserInternal`/`resolvePackageAppealForUserInternal`/`listPackageModerationEventLogsInternal`、`ctx.db.insert("packageReports"/"packageAppeals")`
  - 测试需调整：`packages.public.test.ts`、`skills.public.test.ts`、`httpApiV1.handlers.test.ts`、`managementDevSeed.test.ts`
- ⛔ **务必保留**（非本组）：`manualModeration`(approved/quarantined/revoked) — schema `packageReleaseModerationOverrideValidator`(557-562)、`packageReleases.manualModeration`(1301)、`convex/lib/manualOverrides.ts`；`runStaticPublishScan`(`convex/lib/moderation.ts`)；security-verdicts/verify/scan 端点；`/api/v1/users/ban-appeal-context`（账号封禁，非制品申诉）

### publisherAbuse
- ⬛ schema 表：`publisherAbuseScoreRuns`、`publisherAbuseScores`、`publisherAbuseReviewNominations`、`publisherAbuseReviewEvents`；校验器 `publisherAbuseDryRunLabelValidator`/`publisherAbuseTriageStatusValidator`/`publisherAbuseModelConfigValidator`(schema.ts 422-452)
- ⬛ convex 模块：`convex/publisherAbuse.ts`、`convex/publisherAbuseDevSeed.ts`、`convex/lib/publisherAbuseScoring.ts`
- ⬛ 测试：`convex/publisherAbuse.test.ts`、`convex/publisherAbuseDevSeed.test.ts`、`convex/lib/publisherAbuseScoring.test.ts`
- ⬛ 前端：`src/routes/-management/AbusePage.tsx`
- ✅ cron：`publisher-abuse-score-refresh`、`publisher-temporal-abuse-scan`（已从 crons.ts 移除）
- 🟦 保留但编辑：`src/routes/management.tsx`（去 abuse tab/handlers/queries）、`src/routes/-management/managementShared.ts`（去 PublisherAbuseReview* 类型）、`src/routes/-management.test.tsx`（去 abuse mock）
- ⛔ 保留：`convex/users.ts::banUserInternal`（通用，被多处使用）

### auto-ban / malware-autoban 升级
- 🟦 仅编辑 `convex/users.ts`（不删文件）：移除 `recordMaliciousArtifactFindingInternal`(escalation 触发器, ~2923)、`autobanMalwareAuthorInternal`(~3013)、`remediateAutobansInternal`(~1595)、`reclassifyBanInternal`(~1535)、`placeUserUnderModerationInternal`(~3139)
- 🟦 调用点改造：`convex/skills.ts:735`、`convex/packages.ts:7879`（去 `recordMaliciousArtifactFindingInternal` 调度）；`convex/httpApiV1/usersV1.ts`（去 remediate-autobans / reclassify-ban handler + 路由）
- ⬛ 测试：`convex/autobanRemediation.test.ts`；`convex/users.test.ts` 相关用例
- ⛔ **保留**：`banUserWithActor`/`unbanUserWithActor`(~2295-2593) 通用人工封禁；`applyBanToOwnedSkills/PackagesBatchInternal`（通用）

---

## Phase 3 — souls
- ⬛ schema 表：`souls`、`soulVersions`、`soulVersionFingerprints`、`soulEmbeddings`、`soulComments`、`soulStars`
- ⬛ convex 模块：`convex/souls.ts`、`convex/soulDownloads.ts`、`convex/soulComments.ts`、`convex/soulStars.ts`、`convex/seedSouls.ts`、`convex/githubSoulBackups.ts`、`convex/githubSoulBackupsNode.ts`、`convex/lib/soulPublish.ts`、`convex/lib/soulChangelog.ts`、`convex/lib/githubSoulBackup.ts`、`convex/httpApiV1/soulsV1.ts`
- ✅ HTTP 路由：souls 的 list/get/publish/post/delete v1 路由（已从 http.ts 移除）；删除时一并去 `httpApiV1.ts` 的 `listSoulsV1Http`/`soulsGetRouterV1Http`/`publishSoulV1Http`/`soulsPostRouterV1Http`/`soulsDeleteRouterV1Http` 导出与 `__handlers` 中 soul handlers
- ⬛ 前端：`src/routes/souls/index.tsx`、`src/routes/souls/$slug.tsx`、`src/components/SoulCard.tsx`、`src/components/SoulDetailPage.tsx`、`src/components/SoulStats.tsx`
- ⬛ 测试：`convex/souls.test.ts`、`convex/souls.public.test.ts`、`convex/soulComments.test.ts`（及 soul 相关前端测试）
- ⬛ docs：`docs/soul-format.md`（同步更新 `docs/README.md` 阅读顺序、`src/routes/skills/publish.tsx` 的 SOUL 发布指南外链）
- 🟦 site-mode（SoulHub / onlycrabs.ai）：`src/lib/site.ts` 的 souls 分支与 `getSiteMode`/`detectSiteMode`、`src/lib/og.ts`/`nav-items.ts`/`publicUser.ts`/`Header.tsx`/`routes/index.tsx`/`__root.tsx` 的 souls 模式分支。**内网部署天然为 skills 模式**（不用 onlycrabs host、不设 `VITE_SITE_MODE=souls`），SoulHub 已**配置失活**，无需改码即不可达；物理删除时可把 `SiteMode` 收敛为 skills-only 并删除 souls 分支 + 重写 `src/lib/site.test.ts` 的 souls 断言
- 🟦 `convex/schema.ts`：移除上述 6 张 soul 表定义 + soul 相关 validator

## Phase 4 — 向量搜索
- ✅ search 路径：`convex/search.ts` 的 `searchSkills` 已移除向量分支（`generateEmbedding` + `ctx.vectorSearch("skillEmbeddings")` + `hydrateResults`），改为纯关键字/前缀（skillSearchDigest 的 exact slug + 前缀索引 + `search_by_display_name`/`search_by_slug` 全文索引 + 词法兜底）；响应结构 `{results:[...]}` 不变。`search.test.ts` 删 4 个向量专属用例 + 加顶层 mock 重置。
- ⬛ schema 表：`skillEmbeddings`、`embeddingSkillMap`、`soulEmbeddings`；schema `vectorIndex by_embedding`
- ⬛ convex：`convex/lib/embeddings.ts`（`generateEmbedding`/`EMBEDDING_*`——schema 引用 `EMBEDDING_DIMENSIONS`，删表后一并去）；`convex/search.ts` 的 dormant `searchSouls`/`hydrateResults`/`hydrateSoulResults`/`lexicalFallbackSouls`
- 🟦 保留但编辑：`skillPublish.ts`(303)/`soulPublish.ts`(172)/`devSeed.ts`(830) 的 `generateEmbedding` 调用 + `insertVersion` 的 `embedding` 必填参数（删表时去生成与存储）
- 注：`generateEmbedding` 对无 `OPENAI_API_KEY` 优雅返回零向量（不 throw），**内网无 OpenAI key 时发布/搜索均正常**；运行时 OpenAI 已非依赖，物理删除仅清理 dormant 代码/表。`embeddings.test.ts` 届时一并处理。

## Phase 5 — 外部扫描 worker
- ✅ cron：`vt-pending-scans`、`vt-cache-backfill`（已从 crons.ts 移除）
- ✅ HTTP 路由：`/api/v1/package-inspector/claim|artifact|results`（Plugin Inspector **外部 worker 协议**，已从 http.ts 移除；发布时内联 `packageInspectorNode.runPackageInspectorForPublishInternal` 不受影响）；删除时一并去 `convex/packageInspectorHttp.ts` 与其 dormant handler 导出
- ⬛ convex：`convex/securityScan.ts` 的 Codex worker 协议（`assertWorkerToken` + claim/complete/fail，~275/1938/2050/2130）、`convex/vt.ts`(VirusTotal)、`convex/llmEval.ts`、`convex/emailsNode.ts`、`convex/lib/emails.ts`、`convex/lib/depRegistryScan.ts`(可选)；schema `securityScanJobs`/`skillScanRequests`/`skillCardGenerationJobs`/`vtScanLogs`/`depRegistryCache`（仅服务外部 worker 部分）
- ⬛ env：`SECURITY_SCAN_WORKER_TOKEN`、`VT_API_KEY`、`OPENAI_EVAL_*`、`RESEND_*`
- 🟦 保留但编辑：`security-verdicts`/`verify`/`scan` 端点（`skillSecurityVerdictsV1Handler` 等）读存储 verdict 字段——无 worker 时 vt/llm 字段空、staticScan 仍由发布内联填充 → 端点无需改，仅数据来源收敛为 staticScan + manualModeration；`skillScans` submit/batch 路由喂 `skillScanRequests` 队列（无 worker 时 dormant），物理删除时移除
- ⛔ **保留**：`runStaticPublishScan`（确定性静态扫描，发布内联）、`convex/packageInspectorNode.ts`（发布前兼容门禁 breakage>0 失败，内联）
- 注：worker 协议/vt/llm/email 模块在内网（无 worker 进程、无相关 token/key）下**运行时不可达**；移除 worker HTTP 路由后外部 worker 无法接入。
