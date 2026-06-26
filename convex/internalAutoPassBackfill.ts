// vulture-trim: 一次性回填——把「跳过审计直接 pass」应用到**存量**条目。
//
// 发布路径改动只对新发布生效；此前已发布的技能/插件没有合成的 clean
// llmAnalysis，前端安全审计面板会显示「待检测」，存量插件包的 scanStatus
// 还可能停在 "pending"。本文件提供分页 + 自调度的内网回填：
//   - skillVersions：补写 clean llmAnalysis（不覆盖已有产物）。
//   - packageReleases：补写 clean llmAnalysis + verification.scanStatus="clean"。
//   - packages：把 scanStatus 刷成 "clean"。
// 三者均跳过软删除项与被管理员人工封禁(quarantined/revoked)的 release，避免
// 误解封。幂等：已有 llmAnalysis / 已 clean 的项会跳过。
//
// 触发：bunx convex run internalAutoPassBackfill:runInternalAutoPassBackfillInternal

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./functions";
import { buildInternalAutoPassLlmAnalysis } from "./lib/internalAutoPass";

const DEFAULT_BATCH = 200;
const MAX_BATCH = 500;

function clampBatch(batchSize: number | undefined) {
  return Math.max(1, Math.min(batchSize ?? DEFAULT_BATCH, MAX_BATCH));
}

export const backfillSkillVersionAutoPassInternal = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const batchSize = clampBatch(args.batchSize);
    const page = await ctx.db
      .query("skillVersions")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    let patched = 0;
    for (const version of page.page) {
      if (version.softDeletedAt || version.llmAnalysis) continue;
      await ctx.db.patch(version._id, { llmAnalysis: buildInternalAutoPassLlmAnalysis(now) });
      patched += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.internalAutoPassBackfill.backfillSkillVersionAutoPassInternal,
        { cursor: page.continueCursor, batchSize },
      );
    }
    return { ok: true as const, table: "skillVersions" as const, patched, done: page.isDone };
  },
});

export const backfillPackageReleaseAutoPassInternal = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const batchSize = clampBatch(args.batchSize);
    const page = await ctx.db
      .query("packageReleases")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    let patched = 0;
    for (const release of page.page) {
      if (release.softDeletedAt) continue;
      const manualState = release.manualModeration?.state;
      if (manualState === "quarantined" || manualState === "revoked") continue;

      const needsLlm = !release.llmAnalysis;
      const needsScanStatus = release.verification?.scanStatus !== "clean";
      if (!needsLlm && !needsScanStatus) continue;

      const verification = {
        ...(release.verification ?? {
          tier: "structural" as const,
          scope: "artifact-only" as const,
        }),
        scanStatus: "clean" as const,
      };
      await ctx.db.patch(release._id, {
        ...(needsLlm ? { llmAnalysis: buildInternalAutoPassLlmAnalysis(now) } : {}),
        verification,
      });
      patched += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.internalAutoPassBackfill.backfillPackageReleaseAutoPassInternal,
        { cursor: page.continueCursor, batchSize },
      );
    }
    return { ok: true as const, table: "packageReleases" as const, patched, done: page.isDone };
  },
});

export const backfillPackageDocScanStatusInternal = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = clampBatch(args.batchSize);
    const page = await ctx.db
      .query("packages")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    let patched = 0;
    for (const pkg of page.page) {
      if (pkg.softDeletedAt || pkg.scanStatus === "clean") continue;
      // 不解封被人工封禁的最新 release。
      const latest = pkg.latestReleaseId ? await ctx.db.get(pkg.latestReleaseId) : null;
      const manualState = latest?.manualModeration?.state;
      if (manualState === "quarantined" || manualState === "revoked") continue;

      const nextVerification = pkg.verification
        ? { ...pkg.verification, scanStatus: "clean" as const }
        : pkg.verification;
      await ctx.db.patch(pkg._id, {
        scanStatus: "clean",
        ...(nextVerification ? { verification: nextVerification } : {}),
        updatedAt: Date.now(),
      });
      patched += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.internalAutoPassBackfill.backfillPackageDocScanStatusInternal,
        { cursor: page.continueCursor, batchSize },
      );
    }
    return { ok: true as const, table: "packages" as const, patched, done: page.isDone };
  },
});

// 单入口：依次启动三张表的回填（各自分页自调度）。
export const runInternalAutoPassBackfillInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.internalAutoPassBackfill.backfillSkillVersionAutoPassInternal,
      {},
    );
    await ctx.scheduler.runAfter(
      0,
      internal.internalAutoPassBackfill.backfillPackageReleaseAutoPassInternal,
      {},
    );
    await ctx.scheduler.runAfter(
      0,
      internal.internalAutoPassBackfill.backfillPackageDocScanStatusInternal,
      {},
    );
    return { ok: true as const, scheduled: 3 };
  },
});
