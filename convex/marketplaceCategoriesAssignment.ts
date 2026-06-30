// Management-side mutations for re-assigning a package / skill to a different
// marketplace category. Distinct from the publish-time path:
//   * publish path  → resolve via dictionary + fall back to "other" + audit
//                     `published_via_legacy_path: true`.
//   * management path → operator picks the target slug explicitly; we accept
//                       ANY slug in the dictionary (incl. archived) because
//                       moderators legitimately need to move legacy publishes
//                       into archived buckets while curating. We just never
//                       accept a slug that has never existed in the dictionary.
//
// Permissioning: admin + moderator (mirrors `assertModerator` in
// `marketplaceCategories.ts` for label/icon/order edits). Audit log every
// individual assignment; bulk operations write a SINGLE audit row carrying
// the full list of target package/skill ids (same rationale as the backfill
// summary row — per-row audit on a 500-row bulk move is noise, not signal).

import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { assertModerator, requireUser } from "./lib/access";

// Hard cap on a single bulk call. Convex per-mutation document write budget
// + trigger-driven digest sync make 200 a safe upper bound; beyond that the
// UI should batch client-side. Surfaced as a ConvexError so the management
// page can show a clean message instead of a 500.
const BULK_ASSIGNMENT_CAP = 200;

async function loadFullCategorySlugSet(
  ctx: QueryCtx,
  table: "pluginCategories" | "skillCategories",
): Promise<Set<string>> {
  // Includes archived rows — see the file header for why. Tables are small
  // (~10-20 rows) so a full scan is fine.
  const rows = await ctx.db.query(table).collect();
  return new Set(rows.map((r) => r.slug));
}

export const setPluginCategoryAssignment = mutation({
  args: {
    packageId: v.id("packages"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertModerator(user);

    const slug = args.slug.trim();
    if (!slug) {
      throw new ConvexError({ code: "INVALID_SLUG", message: "slug is required." });
    }
    const known = await loadFullCategorySlugSet(ctx, "pluginCategories");
    if (!known.has(slug)) {
      throw new ConvexError({
        code: "UNKNOWN_SLUG",
        message: `Plugin category slug "${slug}" is not in the dictionary (incl. archived).`,
      });
    }

    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Package not found." });
    }
    if (pkg.family === "skill") {
      // Soft guard; in theory the schema already prevents this combination by
      // routing skill rows to the `skills` table. Defend so a stale Id passed
      // from the UI cannot pivot a category between families.
      throw new ConvexError({
        code: "WRONG_FAMILY",
        message: "Use setSkillCategoryAssignment for skill rows.",
      });
    }
    if (pkg.pluginCategorySlug === slug) {
      // no-op — caller already on the target slug. Still audit? No: re-asserting
      // the same slug is not a meaningful operator decision.
      return { id: pkg._id, slug, changed: false };
    }

    const now = Date.now();
    await ctx.db.patch(pkg._id, {
      pluginCategorySlug: slug,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      action: "package.category.assign",
      targetType: "package",
      targetId: pkg._id,
      metadata: {
        from: pkg.pluginCategorySlug ?? null,
        to: slug,
        name: pkg.name,
      },
      createdAt: now,
    });
    return { id: pkg._id, slug, changed: true };
  },
});

export const setSkillCategoryAssignment = mutation({
  args: {
    skillId: v.id("skills"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertModerator(user);

    const slug = args.slug.trim();
    if (!slug) {
      throw new ConvexError({ code: "INVALID_SLUG", message: "slug is required." });
    }
    const known = await loadFullCategorySlugSet(ctx, "skillCategories");
    if (!known.has(slug)) {
      throw new ConvexError({
        code: "UNKNOWN_SLUG",
        message: `Skill category slug "${slug}" is not in the dictionary (incl. archived).`,
      });
    }

    const skill = await ctx.db.get(args.skillId);
    if (!skill) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Skill not found." });
    }
    if (skill.skillCategorySlug === slug) {
      return { id: skill._id, slug, changed: false };
    }

    const now = Date.now();
    await ctx.db.patch(skill._id, {
      skillCategorySlug: slug,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      action: "skill.category.assign",
      targetType: "skill",
      targetId: skill._id,
      metadata: {
        from: skill.skillCategorySlug ?? null,
        to: slug,
        slug: skill.slug,
      },
      createdAt: now,
    });
    return { id: skill._id, slug, changed: true };
  },
});

export const bulkSetPluginCategoryAssignment = mutation({
  args: {
    packageIds: v.array(v.id("packages")),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertModerator(user);

    if (args.packageIds.length === 0) {
      throw new ConvexError({ code: "EMPTY_SELECTION", message: "no packages selected." });
    }
    if (args.packageIds.length > BULK_ASSIGNMENT_CAP) {
      throw new ConvexError({
        code: "BULK_TOO_LARGE",
        message: `Bulk re-categorization is capped at ${BULK_ASSIGNMENT_CAP} rows per call.`,
      });
    }
    const slug = args.slug.trim();
    if (!slug) {
      throw new ConvexError({ code: "INVALID_SLUG", message: "slug is required." });
    }
    const known = await loadFullCategorySlugSet(ctx, "pluginCategories");
    if (!known.has(slug)) {
      throw new ConvexError({
        code: "UNKNOWN_SLUG",
        message: `Plugin category slug "${slug}" is not in the dictionary (incl. archived).`,
      });
    }

    const now = Date.now();
    const changed: Array<{ id: Id<"packages">; from: string | null }> = [];
    const skipped: Array<Id<"packages">> = [];
    for (const id of args.packageIds) {
      const pkg = (await ctx.db.get(id)) as Doc<"packages"> | null;
      if (!pkg || pkg.family === "skill") {
        skipped.push(id);
        continue;
      }
      if (pkg.pluginCategorySlug === slug) {
        skipped.push(id);
        continue;
      }
      await ctx.db.patch(id, { pluginCategorySlug: slug, updatedAt: now });
      changed.push({ id, from: pkg.pluginCategorySlug ?? null });
    }

    if (changed.length > 0) {
      // Single summary audit row. metadata carries the full id list so the
      // operator can trace which packages were touched in this batch — a
      // per-row audit on a 200-row bulk move would noise out the audit log.
      await ctx.db.insert("auditLogs", {
        actorUserId: user._id,
        action: "package.category.bulk_assign",
        targetType: "package",
        targetId: "package.category.bulk_assign",
        metadata: {
          to: slug,
          changedCount: changed.length,
          skippedCount: skipped.length,
          changed: changed.map((entry) => ({ id: entry.id, from: entry.from })),
        },
        createdAt: now,
      });
    }
    return { changedCount: changed.length, skippedCount: skipped.length };
  },
});

export const bulkSetSkillCategoryAssignment = mutation({
  args: {
    skillIds: v.array(v.id("skills")),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertModerator(user);

    if (args.skillIds.length === 0) {
      throw new ConvexError({ code: "EMPTY_SELECTION", message: "no skills selected." });
    }
    if (args.skillIds.length > BULK_ASSIGNMENT_CAP) {
      throw new ConvexError({
        code: "BULK_TOO_LARGE",
        message: `Bulk re-categorization is capped at ${BULK_ASSIGNMENT_CAP} rows per call.`,
      });
    }
    const slug = args.slug.trim();
    if (!slug) {
      throw new ConvexError({ code: "INVALID_SLUG", message: "slug is required." });
    }
    const known = await loadFullCategorySlugSet(ctx, "skillCategories");
    if (!known.has(slug)) {
      throw new ConvexError({
        code: "UNKNOWN_SLUG",
        message: `Skill category slug "${slug}" is not in the dictionary (incl. archived).`,
      });
    }

    const now = Date.now();
    const changed: Array<{ id: Id<"skills">; from: string | null }> = [];
    const skipped: Array<Id<"skills">> = [];
    for (const id of args.skillIds) {
      const skill = (await ctx.db.get(id)) as Doc<"skills"> | null;
      if (!skill) {
        skipped.push(id);
        continue;
      }
      if (skill.skillCategorySlug === slug) {
        skipped.push(id);
        continue;
      }
      await ctx.db.patch(id, { skillCategorySlug: slug, updatedAt: now });
      changed.push({ id, from: skill.skillCategorySlug ?? null });
    }

    if (changed.length > 0) {
      await ctx.db.insert("auditLogs", {
        actorUserId: user._id,
        action: "skill.category.bulk_assign",
        targetType: "skill",
        targetId: "skill.category.bulk_assign",
        metadata: {
          to: slug,
          changedCount: changed.length,
          skippedCount: skipped.length,
          changed: changed.map((entry) => ({ id: entry.id, from: entry.from })),
        },
        createdAt: now,
      });
    }
    return { changedCount: changed.length, skippedCount: skipped.length };
  },
});

// Management filter list — surfaces the rows the moderator needs to see when
// curating a specific bucket (typically "other" right after backfill, or an
// archived slug they want to drain). Returns lightweight summary rows; full
// detail loaded on click via the existing single-package management query.
//
// `categorySlug === "__other__"` is a sentinel matching rows whose stored
// slug is exactly "other" OR `undefined`. Pre-backfill rows on staging may
// still be undefined; in production after backfill they will all be "other".
// We tolerate both so the bucket stays useful during the rollout window.

const OTHER_BUCKET_SENTINEL = "__other__";

type ManagedAssignmentRow = {
  id: string;
  name: string;
  displayName: string;
  slug: string | null;
  family?: string;
  updatedAt: number;
};

export const listPluginsByCategoryForManagement = query({
  args: {
    categorySlug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ManagedAssignmentRow[]> => {
    const { user } = await requireUser(ctx);
    assertModerator(user);

    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const categorySlug = args.categorySlug?.trim();

    if (!categorySlug) {
      const rows = await ctx.db
        .query("packages")
        .withIndex("by_active_updated", (q) => q.eq("softDeletedAt", undefined))
        .order("desc")
        .take(limit);
      return rows.map(toPluginAssignmentRow);
    }

    if (categorySlug === OTHER_BUCKET_SENTINEL) {
      // Two-pass union: rows explicitly "other" + rows still undefined. Both
      // index lookups stay on `by_categorySlug_updated`. Convex does not have
      // a "OR over equality" primitive, so we materialise both halves with
      // small caps and merge in-memory.
      const half = Math.ceil(limit / 2);
      const explicit = await ctx.db
        .query("packages")
        .withIndex("by_categorySlug_updated", (q) => q.eq("pluginCategorySlug", "other"))
        .order("desc")
        .take(half);
      const undefinedRows = await ctx.db
        .query("packages")
        .withIndex("by_categorySlug_updated", (q) => q.eq("pluginCategorySlug", undefined))
        .order("desc")
        .take(half);
      const merged = [...explicit, ...undefinedRows]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
      return merged.map(toPluginAssignmentRow);
    }

    const rows = await ctx.db
      .query("packages")
      .withIndex("by_categorySlug_updated", (q) => q.eq("pluginCategorySlug", categorySlug))
      .order("desc")
      .take(limit);
    return rows.map(toPluginAssignmentRow);
  },
});

export const listSkillsByCategoryForManagement = query({
  args: {
    categorySlug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ManagedAssignmentRow[]> => {
    const { user } = await requireUser(ctx);
    assertModerator(user);

    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const categorySlug = args.categorySlug?.trim();

    if (!categorySlug) {
      const rows = await ctx.db
        .query("skills")
        .withIndex("by_active_updated", (q) => q.eq("softDeletedAt", undefined))
        .order("desc")
        .take(limit);
      return rows.map(toSkillAssignmentRow);
    }

    if (categorySlug === OTHER_BUCKET_SENTINEL) {
      const half = Math.ceil(limit / 2);
      const explicit = await ctx.db
        .query("skills")
        .withIndex("by_categorySlug_updated", (q) => q.eq("skillCategorySlug", "other"))
        .order("desc")
        .take(half);
      const undefinedRows = await ctx.db
        .query("skills")
        .withIndex("by_categorySlug_updated", (q) => q.eq("skillCategorySlug", undefined))
        .order("desc")
        .take(half);
      const merged = [...explicit, ...undefinedRows]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
      return merged.map(toSkillAssignmentRow);
    }

    const rows = await ctx.db
      .query("skills")
      .withIndex("by_categorySlug_updated", (q) => q.eq("skillCategorySlug", categorySlug))
      .order("desc")
      .take(limit);
    return rows.map(toSkillAssignmentRow);
  },
});

function toPluginAssignmentRow(row: Doc<"packages">): ManagedAssignmentRow {
  return {
    id: row._id,
    name: row.name,
    displayName: row.displayName,
    slug: row.pluginCategorySlug ?? null,
    family: row.family,
    updatedAt: row.updatedAt,
  };
}

function toSkillAssignmentRow(row: Doc<"skills">): ManagedAssignmentRow {
  return {
    id: row._id,
    name: row.slug,
    displayName: row.displayName,
    slug: row.skillCategorySlug ?? null,
    updatedAt: row.updatedAt,
  };
}

export type { ManagedAssignmentRow };
export { OTHER_BUCKET_SENTINEL, BULK_ASSIGNMENT_CAP };

// Silence "imported but unused" when MutationCtx is only referenced via
// inferred types in arrow handlers.
void (null as unknown as MutationCtx | null);
