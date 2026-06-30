// Marketplace category dictionaries — plugin & skill families.
// See docs/prd/marketplace-categories.md for the cross-repo decision context.
//
// Permission model (mirrors existing admin/moderator pattern, see convex/lib/access.ts):
//   - admin           → create, archive, unarchive
//   - admin + moderator → update label / icon / order
//   - everyone else   → reject
//
// slug is immutable: rejected at the args validator boundary (update mutations
// simply do not accept a slug arg) and at the table level (no patch ever
// writes the slug field after the initial insert).

import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { assertAdmin, assertModerator, requireUser } from "./lib/access";
import {
  DEFAULT_PLUGIN_CATEGORIES,
  DEFAULT_SKILL_CATEGORIES,
  type DefaultCategory,
  OTHER_CATEGORY_SLUG,
  isValidCategorySlug,
} from "./lib/categoriesDefaults";

type CategoryFamily = "plugin" | "skill";

type FamilyBinding = {
  table: "pluginCategories" | "skillCategories";
  targetType: "pluginCategory" | "skillCategory";
  actionPrefix: "plugin_category" | "skill_category";
};

const PLUGIN: FamilyBinding = {
  table: "pluginCategories",
  targetType: "pluginCategory",
  actionPrefix: "plugin_category",
};

const SKILL: FamilyBinding = {
  table: "skillCategories",
  targetType: "skillCategory",
  actionPrefix: "skill_category",
};

export type CategoryDictionaryEntry = {
  slug: string;
  label: string;
  order: number;
  icon: string | null;
};

export type CategoryManagementEntry = CategoryDictionaryEntry & {
  id: Id<"pluginCategories"> | Id<"skillCategories">;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

// ---- shared seed helper (pure-ish, only depends on ctx.db) ------------------

async function seedDefaultCategories(
  ctx: MutationCtx,
  binding: FamilyBinding,
  defaults: ReadonlyArray<DefaultCategory>,
): Promise<{ inserted: number; reason: "inserted" | "non-empty" }> {
  const existing = await ctx.db.query(binding.table).take(1);
  if (existing.length > 0) {
    return { inserted: 0, reason: "non-empty" };
  }
  const now = Date.now();
  for (const entry of defaults) {
    await ctx.db.insert(binding.table, {
      slug: entry.slug,
      label: entry.label,
      order: entry.order,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { inserted: defaults.length, reason: "inserted" };
}

// ---- shared read helpers -----------------------------------------------------

async function listActiveDictionary(
  ctx: QueryCtx,
  binding: FamilyBinding,
): Promise<CategoryDictionaryEntry[]> {
  const docs = await ctx.db
    .query(binding.table)
    .withIndex("by_active_order", (q) => q.eq("archived", false))
    .collect();
  return docs.map((doc) => ({
    slug: doc.slug,
    label: doc.label,
    order: doc.order,
    icon: doc.icon ?? null,
  }));
}

async function listAllForManagement(
  ctx: QueryCtx,
  binding: FamilyBinding,
): Promise<CategoryManagementEntry[]> {
  // Dictionary tables are small (~10-20 rows). A full scan here is acceptable
  // and management UI is low-traffic. Sorted client-side: active first, then by
  // operator-defined order. Archived rows sink to the bottom.
  const docs = await ctx.db.query(binding.table).collect();
  const sorted = [...docs].sort((a, b) => {
    const archivedDiff = Number(a.archived) - Number(b.archived);
    if (archivedDiff !== 0) return archivedDiff;
    return a.order - b.order;
  });
  return sorted.map((doc) => ({
    id: doc._id,
    slug: doc.slug,
    label: doc.label,
    order: doc.order,
    icon: doc.icon ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));
}

// ---- shared mutation helpers ------------------------------------------------

function normalizeLabel(input: string): string {
  return input.trim();
}

async function createCategory(
  ctx: MutationCtx,
  binding: FamilyBinding,
  args: { slug: string; label: string; order: number; icon?: string },
): Promise<{ id: Id<"pluginCategories"> | Id<"skillCategories">; slug: string }> {
  const { user } = await requireUser(ctx);
  assertAdmin(user);

  const slug = args.slug.trim();
  if (!isValidCategorySlug(slug)) {
    throw new ConvexError({
      code: "INVALID_SLUG",
      message: "slug must be lower-case kebab-case (e.g. 'ecommerce', 'social-media').",
    });
  }
  const label = normalizeLabel(args.label);
  if (label.length === 0) {
    throw new ConvexError({ code: "INVALID_LABEL", message: "label cannot be empty." });
  }
  if (!Number.isFinite(args.order)) {
    throw new ConvexError({ code: "INVALID_ORDER", message: "order must be a finite number." });
  }

  const duplicate = await ctx.db
    .query(binding.table)
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (duplicate) {
    throw new ConvexError({ code: "DUPLICATE_SLUG", message: `slug "${slug}" already exists.` });
  }

  const now = Date.now();
  const id = await ctx.db.insert(binding.table, {
    slug,
    label,
    order: args.order,
    icon: args.icon?.trim() ? args.icon.trim() : undefined,
    archived: false,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("auditLogs", {
    actorUserId: user._id,
    action: `${binding.actionPrefix}.create`,
    targetType: binding.targetType,
    targetId: id,
    metadata: {
      slug,
      label,
      order: args.order,
      icon: args.icon?.trim() ? args.icon.trim() : null,
    },
    createdAt: now,
  });

  return { id, slug };
}

async function updateCategory(
  ctx: MutationCtx,
  binding: FamilyBinding,
  args: {
    id: Id<"pluginCategories"> | Id<"skillCategories">;
    label?: string;
    icon?: string | null;
    order?: number;
  },
): Promise<{ id: Id<"pluginCategories"> | Id<"skillCategories"> }> {
  const { user } = await requireUser(ctx);
  assertModerator(user);

  const doc = (await ctx.db.get(args.id as Id<"pluginCategories">)) as
    | Doc<"pluginCategories">
    | Doc<"skillCategories">
    | null;
  if (!doc) {
    throw new ConvexError({ code: "NOT_FOUND", message: "category not found." });
  }

  const patch: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (args.label !== undefined) {
    const nextLabel = normalizeLabel(args.label);
    if (nextLabel.length === 0) {
      throw new ConvexError({ code: "INVALID_LABEL", message: "label cannot be empty." });
    }
    if (nextLabel !== doc.label) {
      patch.label = nextLabel;
      changes.label = { from: doc.label, to: nextLabel };
    }
  }
  if (args.icon !== undefined) {
    const nextIcon = args.icon === null ? undefined : args.icon.trim() || undefined;
    if (nextIcon !== doc.icon) {
      patch.icon = nextIcon;
      changes.icon = { from: doc.icon ?? null, to: nextIcon ?? null };
    }
  }
  if (args.order !== undefined) {
    if (!Number.isFinite(args.order)) {
      throw new ConvexError({ code: "INVALID_ORDER", message: "order must be a finite number." });
    }
    if (args.order !== doc.order) {
      patch.order = args.order;
      changes.order = { from: doc.order, to: args.order };
    }
  }

  if (Object.keys(patch).length === 0) {
    return { id: doc._id };
  }

  const now = Date.now();
  patch.updatedAt = now;
  await ctx.db.patch(doc._id, patch);

  await ctx.db.insert("auditLogs", {
    actorUserId: user._id,
    action: `${binding.actionPrefix}.update`,
    targetType: binding.targetType,
    targetId: doc._id,
    metadata: { slug: doc.slug, changes },
    createdAt: now,
  });

  return { id: doc._id };
}

async function setArchived(
  ctx: MutationCtx,
  binding: FamilyBinding,
  args: { id: Id<"pluginCategories"> | Id<"skillCategories">; archived: boolean },
): Promise<{ id: Id<"pluginCategories"> | Id<"skillCategories"> }> {
  const { user } = await requireUser(ctx);
  assertAdmin(user);

  const doc = (await ctx.db.get(args.id as Id<"pluginCategories">)) as
    | Doc<"pluginCategories">
    | Doc<"skillCategories">
    | null;
  if (!doc) {
    throw new ConvexError({ code: "NOT_FOUND", message: "category not found." });
  }
  if (doc.slug === OTHER_CATEGORY_SLUG && args.archived) {
    throw new ConvexError({
      code: "PROTECTED_SLUG",
      message: "the 'other' bucket cannot be archived — it is the uncategorized fallback.",
    });
  }
  if (doc.archived === args.archived) {
    return { id: doc._id };
  }

  const now = Date.now();
  await ctx.db.patch(doc._id, { archived: args.archived, updatedAt: now });

  await ctx.db.insert("auditLogs", {
    actorUserId: user._id,
    action: `${binding.actionPrefix}.${args.archived ? "archive" : "unarchive"}`,
    targetType: binding.targetType,
    targetId: doc._id,
    metadata: { slug: doc.slug },
    createdAt: now,
  });

  return { id: doc._id };
}

// ---- plugin category exports -------------------------------------------------

export const listPluginCategoriesDictionary = query({
  args: {},
  handler: (ctx) => listActiveDictionary(ctx, PLUGIN),
});

export const listAllPluginCategoriesForManagement = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    assertModerator(user);
    return listAllForManagement(ctx, PLUGIN);
  },
});

export const createPluginCategory = mutation({
  args: {
    slug: v.string(),
    label: v.string(),
    order: v.number(),
    icon: v.optional(v.string()),
  },
  handler: (ctx, args) => createCategory(ctx, PLUGIN, args),
});

export const updatePluginCategory = mutation({
  args: {
    id: v.id("pluginCategories"),
    label: v.optional(v.string()),
    icon: v.optional(v.union(v.string(), v.null())),
    order: v.optional(v.number()),
  },
  handler: (ctx, args) => updateCategory(ctx, PLUGIN, args),
});

export const archivePluginCategory = mutation({
  args: { id: v.id("pluginCategories") },
  handler: (ctx, args) => setArchived(ctx, PLUGIN, { id: args.id, archived: true }),
});

export const unarchivePluginCategory = mutation({
  args: { id: v.id("pluginCategories") },
  handler: (ctx, args) => setArchived(ctx, PLUGIN, { id: args.id, archived: false }),
});

export const seedDefaultPluginCategoriesInternal = internalMutation({
  args: {},
  handler: (ctx) => seedDefaultCategories(ctx, PLUGIN, DEFAULT_PLUGIN_CATEGORIES),
});

// ---- skill category exports --------------------------------------------------

export const listSkillCategoriesDictionary = query({
  args: {},
  handler: (ctx) => listActiveDictionary(ctx, SKILL),
});

export const listAllSkillCategoriesForManagement = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    assertModerator(user);
    return listAllForManagement(ctx, SKILL);
  },
});

export const createSkillCategory = mutation({
  args: {
    slug: v.string(),
    label: v.string(),
    order: v.number(),
    icon: v.optional(v.string()),
  },
  handler: (ctx, args) => createCategory(ctx, SKILL, args),
});

export const updateSkillCategory = mutation({
  args: {
    id: v.id("skillCategories"),
    label: v.optional(v.string()),
    icon: v.optional(v.union(v.string(), v.null())),
    order: v.optional(v.number()),
  },
  handler: (ctx, args) => updateCategory(ctx, SKILL, args),
});

export const archiveSkillCategory = mutation({
  args: { id: v.id("skillCategories") },
  handler: (ctx, args) => setArchived(ctx, SKILL, { id: args.id, archived: true }),
});

export const unarchiveSkillCategory = mutation({
  args: { id: v.id("skillCategories") },
  handler: (ctx, args) => setArchived(ctx, SKILL, { id: args.id, archived: false }),
});

export const seedDefaultSkillCategoriesInternal = internalMutation({
  args: {},
  handler: (ctx) => seedDefaultCategories(ctx, SKILL, DEFAULT_SKILL_CATEGORIES),
});

// Re-export for tests / dev seeds.
export type { CategoryFamily };
export { DEFAULT_PLUGIN_CATEGORIES, DEFAULT_SKILL_CATEGORIES };
