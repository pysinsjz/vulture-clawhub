// One-shot backfill: fill `pluginCategorySlug` / `skillCategorySlug` on every
// existing package / skill row that still has `undefined`. Idempotent — rows
// that already have a non-undefined value (even "other" set by a moderator,
// or any other valid slug) are left untouched, so the operator can re-run
// after a partial outage without losing curation work.
//
// Bandwidth: paged via Convex `paginationOptsValidator` to comply with the
// "Cron jobs / backfills must never scan entire tables" rule
// (AGENTS.md → Convex Query & Bandwidth Rules). Caller re-invokes with the
// returned cursor until `isDone === true`.
//
// Permissioning: admin-only — this writes to every package/skill row, so it
// is gated behind `assertAdmin`. A moderator role is NOT enough.
//
// Audit: emits a single SUMMARY auditLogs row per invocation (not per-row).
// Per-row audit would produce thousands of rows and noise the audit log for
// no useful signal — the metadata totals + cursor are sufficient to reconstruct
// the backfill timeline.
//
// On-write side effect: each touched package row triggers digest sync via the
// existing `syncPackageSearchDigest` trigger wrapper (convex/functions.ts), so
// `packagePluginCategorySearchDigest` collapses to the single-row form
// (pluginCategory = "other") for every backfilled package. No extra call here.

import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./functions";
import { assertAdmin, requireUser } from "./lib/access";
import { OTHER_CATEGORY_SLUG } from "./lib/categoriesDefaults";

// Conservative page size — large enough to make progress, small enough that
// trigger-driven digest writes for the whole batch fit under Convex's
// per-transaction read/write budget. Tested at 200 in
// `marketplaceCategoriesBackfill.test.ts`.
const BACKFILL_PAGE_SIZE = 200;

type BackfillResult = {
  packagesUpdated: number;
  skillsUpdated: number;
  packagesScanned: number;
  skillsScanned: number;
  nextPackagesCursor: string | null;
  nextSkillsCursor: string | null;
  isDone: boolean;
};

async function backfillPackagesBatch(
  ctx: MutationCtx,
  cursor: string | null,
): Promise<{ updated: number; scanned: number; nextCursor: string | null; isDone: boolean }> {
  const page = await ctx.db.query("packages").paginate({ cursor, numItems: BACKFILL_PAGE_SIZE });
  let updated = 0;
  for (const row of page.page as Doc<"packages">[]) {
    // skip skill-family rows — they live in the `skills` table and have their
    // own column. packages with family === "skill" are extremely rare (the
    // publish flow rejects them in publishPackageImpl), but defend anyway.
    if (row.family === "skill") continue;
    if (row.pluginCategorySlug !== undefined) continue;
    await ctx.db.patch(row._id, { pluginCategorySlug: OTHER_CATEGORY_SLUG });
    updated += 1;
  }
  return {
    updated,
    scanned: page.page.length,
    nextCursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
  };
}

async function backfillSkillsBatch(
  ctx: MutationCtx,
  cursor: string | null,
): Promise<{ updated: number; scanned: number; nextCursor: string | null; isDone: boolean }> {
  const page = await ctx.db.query("skills").paginate({ cursor, numItems: BACKFILL_PAGE_SIZE });
  let updated = 0;
  for (const row of page.page as Doc<"skills">[]) {
    if (row.skillCategorySlug !== undefined) continue;
    await ctx.db.patch(row._id, { skillCategorySlug: OTHER_CATEGORY_SLUG });
    updated += 1;
  }
  return {
    updated,
    scanned: page.page.length,
    nextCursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
  };
}

export const backfillMarketplaceCategoryAssignments = mutation({
  args: {
    // Optional cursors so the caller can resume mid-backfill. Pass `null` /
    // omit on the first call. The returned `nextPackagesCursor` /
    // `nextSkillsCursor` are passed verbatim to the next call until
    // `isDone === true`. Two separate cursors so packages and skills advance
    // independently — one table may finish many batches before the other.
    packagesCursor: v.optional(v.union(v.string(), v.null())),
    skillsCursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<BackfillResult> => {
    const { user } = await requireUser(ctx);
    assertAdmin(user);

    const packagesCursorIn = args.packagesCursor ?? null;
    const skillsCursorIn = args.skillsCursor ?? null;

    // `isDone: true` means "no more rows on that side" — short-circuit further
    // pagination on the table that already finished. The caller still tracks
    // both cursors but receives `null` for the finished side.
    const packagesResult =
      packagesCursorIn === null && (await isPackagesTableEmpty(ctx))
        ? { updated: 0, scanned: 0, nextCursor: null, isDone: true }
        : await backfillPackagesBatch(ctx, packagesCursorIn);
    const skillsResult =
      skillsCursorIn === null && (await isSkillsTableEmpty(ctx))
        ? { updated: 0, scanned: 0, nextCursor: null, isDone: true }
        : await backfillSkillsBatch(ctx, skillsCursorIn);

    const summary: BackfillResult = {
      packagesUpdated: packagesResult.updated,
      skillsUpdated: skillsResult.updated,
      packagesScanned: packagesResult.scanned,
      skillsScanned: skillsResult.scanned,
      nextPackagesCursor: packagesResult.nextCursor,
      nextSkillsCursor: skillsResult.nextCursor,
      isDone: packagesResult.isDone && skillsResult.isDone,
    };

    // Single SUMMARY audit row per invocation. metadata carries cursors so the
    // operator can reconstruct the chain. Skipped when nothing changed AND
    // there is still more to scan, so a "0/0/0/0" no-op in the middle of a
    // long backfill does not flood the audit log; the terminal `isDone: true`
    // call always records (even with 0 updates), so the start + end of every
    // run is auditable.
    const shouldAudit = summary.packagesUpdated > 0 || summary.skillsUpdated > 0 || summary.isDone;
    if (shouldAudit) {
      await ctx.db.insert("auditLogs", {
        actorUserId: user._id,
        action: "marketplace_categories.backfill",
        targetType: "marketplaceCategoryBackfill",
        targetId: "marketplace_categories.backfill",
        metadata: {
          packagesUpdated: summary.packagesUpdated,
          skillsUpdated: summary.skillsUpdated,
          packagesScanned: summary.packagesScanned,
          skillsScanned: summary.skillsScanned,
          packagesCursorIn,
          skillsCursorIn,
          nextPackagesCursor: summary.nextPackagesCursor,
          nextSkillsCursor: summary.nextSkillsCursor,
          isDone: summary.isDone,
        },
        createdAt: Date.now(),
      });
    }

    return summary;
  },
});

async function isPackagesTableEmpty(ctx: MutationCtx): Promise<boolean> {
  const first = await ctx.db.query("packages").take(1);
  return first.length === 0;
}

async function isSkillsTableEmpty(ctx: MutationCtx): Promise<boolean> {
  const first = await ctx.db.query("skills").take(1);
  return first.length === 0;
}

// Test-only handle for direct invocation of the inner batch helpers without
// going through the admin gate. Exposed under a `__test` namespace consistent
// with convex/lib/skillPublish.ts; production code MUST NOT import this.
export const __test = {
  backfillPackagesBatch,
  backfillSkillsBatch,
  BACKFILL_PAGE_SIZE,
};

// Guard so we never accidentally re-export an unrelated symbol with this name.
export type { BackfillResult };

// Silence "imported but unused" if ConvexError is not referenced (typescript
// strict mode treats unused imports as errors when `noUnusedLocals` is on).
void ConvexError;
