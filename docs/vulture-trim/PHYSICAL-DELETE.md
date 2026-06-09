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

## Phase 3 — souls（占位，详见执行时补充）
- ⬛ schema 表：`souls`、`soulVersions`、`soulVersionFingerprints`、`soulEmbeddings`、`soulComments`、`soulStars`
- ⬛ convex 模块：`convex/souls.ts`、`convex/soulDownloads.ts`、`convex/soulComments.ts`、`convex/soulStars.ts`、`convex/seedSouls.ts`、`convex/lib/soulPublish.ts`、`convex/lib/soulChangelog.ts`、`convex/lib/githubSoulBackup.ts`、`convex/githubSoulBackups*.ts`、`convex/httpApiV1/soulsV1.ts`、soul OG 路由(server/og)
- ⬛ 前端：soul 页面/路由（`src/routes/souls/**`、`SoulDetailPage.tsx`、`SoulStats.tsx` 等）
- ⬛ docs：`docs/soul-format.md`

## Phase 4 — 向量搜索（占位）
- ⬛ schema 表：`skillEmbeddings`、`embeddingSkillMap`、`soulEmbeddings`；schema vectorIndex `by_embedding`
- ⬛ convex：`convex/lib/embeddings.ts`、`convex/search.ts` 向量分支、OpenAI embeddings 生成/索引

## Phase 5 — 外部扫描 worker（占位）
- ⬛ convex：`convex/securityScan.ts`(worker 协议)、`convex/vt.ts`、`convex/llmEval.ts`、`convex/emailsNode.ts`、`convex/lib/emails.ts`、`convex/lib/depRegistryScan.ts`(可选)；schema `securityScanJobs`/`skillScanRequests`/`skillCardGenerationJobs`/`vtScanLogs`/`depRegistryCache`（仅服务外部 worker 部分）
- ✅ cron（届时）：`vt-pending-scans`、`vt-cache-backfill`
- ⛔ 保留：`runStaticPublishScan`、`convex/packageInspectorNode.ts`（发布前兼容门禁）
