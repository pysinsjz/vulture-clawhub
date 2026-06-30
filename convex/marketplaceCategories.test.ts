import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

vi.mock("./lib/access", async () => {
  const actual = await vi.importActual<typeof import("./lib/access")>("./lib/access");
  return { ...actual, requireUser: vi.fn() };
});

const { requireUser } = await import("./lib/access");

const {
  archivePluginCategory,
  archiveSkillCategory,
  createPluginCategory,
  createSkillCategory,
  listAllPluginCategoriesForManagement,
  listPluginCategoriesDictionary,
  listSkillCategoriesDictionary,
  seedDefaultPluginCategoriesInternal,
  seedDefaultSkillCategoriesInternal,
  unarchivePluginCategory,
  updatePluginCategory,
  updateSkillCategory,
} = await import("./marketplaceCategories");

const { DEFAULT_PLUGIN_CATEGORIES, DEFAULT_SKILL_CATEGORIES } =
  await import("./lib/categoriesDefaults");

type WrappedHandler<TArgs, TResult> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

const seedPluginsHandler = (
  seedDefaultPluginCategoriesInternal as unknown as WrappedHandler<
    Record<string, never>,
    { inserted: number; reason: string }
  >
)._handler;
const seedSkillsHandler = (
  seedDefaultSkillCategoriesInternal as unknown as WrappedHandler<
    Record<string, never>,
    { inserted: number; reason: string }
  >
)._handler;
const createPluginHandler = (
  createPluginCategory as unknown as WrappedHandler<
    { slug: string; label: string; order: number; icon?: string },
    { id: string; slug: string }
  >
)._handler;
const updatePluginHandler = (
  updatePluginCategory as unknown as WrappedHandler<
    { id: string; label?: string; icon?: string | null; order?: number },
    { id: string }
  >
)._handler;
const archivePluginHandler = (
  archivePluginCategory as unknown as WrappedHandler<{ id: string }, { id: string }>
)._handler;
const unarchivePluginHandler = (
  unarchivePluginCategory as unknown as WrappedHandler<{ id: string }, { id: string }>
)._handler;
const createSkillHandler = (
  createSkillCategory as unknown as WrappedHandler<
    { slug: string; label: string; order: number; icon?: string },
    { id: string; slug: string }
  >
)._handler;
const updateSkillHandler = (
  updateSkillCategory as unknown as WrappedHandler<
    { id: string; label?: string; icon?: string | null; order?: number },
    { id: string }
  >
)._handler;
const archiveSkillHandler = (
  archiveSkillCategory as unknown as WrappedHandler<{ id: string }, { id: string }>
)._handler;
const listDictionaryHandler = (
  listPluginCategoriesDictionary as unknown as WrappedHandler<Record<string, never>, unknown>
)._handler;
const listAllHandler = (
  listAllPluginCategoriesForManagement as unknown as WrappedHandler<Record<string, never>, unknown>
)._handler;
const listSkillDictionaryHandler = (
  listSkillCategoriesDictionary as unknown as WrappedHandler<Record<string, never>, unknown>
)._handler;

type Row = Record<string, unknown> & { _id: string; _creationTime: number };

function makeFakeDb(initial?: Record<string, Array<Record<string, unknown>>>) {
  const tables: Record<string, Map<string, Row>> = {};
  let counter = 0;

  function table(name: string): Map<string, Row> {
    if (!tables[name]) tables[name] = new Map();
    return tables[name];
  }

  if (initial) {
    for (const [name, rows] of Object.entries(initial)) {
      for (const row of rows) {
        counter += 1;
        const id = (row._id as string | undefined) ?? `${name}:${counter}`;
        table(name).set(id, { _id: id, _creationTime: counter, ...row } as Row);
      }
    }
  }

  const inserts: Array<{ table: string; value: Row }> = [];
  const patches: Array<{ id: string; value: Record<string, unknown> }> = [];

  function buildChain(rows: Row[]) {
    return {
      unique: async () => {
        if (rows.length === 0) return null;
        if (rows.length > 1) throw new Error("unique() returned multiple rows");
        return rows[0];
      },
      collect: async () => rows.slice(),
      take: async (n: number) => rows.slice(0, n),
      order: () => buildChain(rows),
    };
  }

  function withIndex(name: string, indexName: string, builder?: (q: unknown) => unknown) {
    const rows = Array.from(table(name).values());
    if (indexName === "by_slug") {
      let target: string | undefined;
      const q = {
        eq: (_field: string, value: unknown) => {
          target = value as string;
          return q;
        },
      };
      if (builder) builder(q);
      return buildChain(rows.filter((r) => r.slug === target));
    }
    if (indexName === "by_active_order") {
      let target: boolean | undefined;
      const q = {
        eq: (_field: string, value: unknown) => {
          target = value as boolean;
          return q;
        },
      };
      if (builder) builder(q);
      const filtered = rows
        .filter((r) => r.archived === target)
        .sort((a, b) => (a.order as number) - (b.order as number));
      return buildChain(filtered);
    }
    throw new Error(`unexpected index ${indexName} on ${name}`);
  }

  const db = {
    normalizeId: vi.fn(),
    get: vi.fn(async (id: string) => {
      for (const map of Object.values(tables)) {
        if (map.has(id)) return map.get(id) ?? null;
      }
      return null;
    }),
    insert: vi.fn(async (name: string, value: Record<string, unknown>) => {
      counter += 1;
      const id = `${name}:${counter}`;
      const row: Row = { _id: id, _creationTime: counter, ...value };
      table(name).set(id, row);
      inserts.push({ table: name, value: row });
      return id;
    }),
    patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      for (const map of Object.values(tables)) {
        if (map.has(id)) {
          map.set(id, { ...(map.get(id) as Row), ...patch });
          patches.push({ id, value: patch });
          return;
        }
      }
      throw new Error(`patch: id ${id} not found`);
    }),
    query: (name: string) => {
      return {
        withIndex: (indexName: string, builder?: (q: unknown) => unknown) =>
          withIndex(name, indexName, builder),
        collect: async () => Array.from(table(name).values()),
        take: async (n: number) => Array.from(table(name).values()).slice(0, n),
        order: () => ({
          take: async (n: number) => Array.from(table(name).values()).slice(0, n),
        }),
      };
    },
  };

  return { db, tables, inserts, patches };
}

function makeUser(role: "admin" | "moderator" | "user", id = "users:actor") {
  return {
    _id: id,
    _creationTime: 1,
    role,
    deletedAt: null,
    deactivatedAt: null,
  } as unknown as Awaited<ReturnType<typeof requireUser>>["user"];
}

function bindUser(role: "admin" | "moderator" | "user") {
  const user = makeUser(role);
  (requireUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: user._id,
    user,
  });
  return user;
}

function makeCtx(initial?: Record<string, Array<Record<string, unknown>>>) {
  const fake = makeFakeDb(initial);
  return { fake, ctx: { db: fake.db } as never };
}

describe("seedDefaultPluginCategoriesInternal", () => {
  it("inserts the full default plugin dictionary on an empty table", async () => {
    const { ctx, fake } = makeCtx();
    const result = await seedPluginsHandler(ctx, {});
    expect(result).toEqual({
      inserted: DEFAULT_PLUGIN_CATEGORIES.length,
      reason: "inserted",
    });
    expect(fake.tables.pluginCategories?.size).toBe(DEFAULT_PLUGIN_CATEGORIES.length);
  });

  it("is idempotent: a second run inserts nothing", async () => {
    const { ctx, fake } = makeCtx();
    await seedPluginsHandler(ctx, {});
    const second = await seedPluginsHandler(ctx, {});
    expect(second).toEqual({ inserted: 0, reason: "non-empty" });
    expect(fake.tables.pluginCategories?.size).toBe(DEFAULT_PLUGIN_CATEGORIES.length);
  });
});

describe("seedDefaultSkillCategoriesInternal", () => {
  it("inserts the full default skill dictionary", async () => {
    const { ctx, fake } = makeCtx();
    const result = await seedSkillsHandler(ctx, {});
    expect(result.inserted).toBe(DEFAULT_SKILL_CATEGORIES.length);
    expect(fake.tables.skillCategories?.size).toBe(DEFAULT_SKILL_CATEGORIES.length);
  });
});

describe("createPluginCategory", () => {
  it("admin can create a category and writes an audit log", async () => {
    bindUser("admin");
    const { ctx, fake } = makeCtx();
    const result = await createPluginHandler(ctx, {
      slug: "new-cat",
      label: "新分类",
      order: 200,
    });
    expect(result.slug).toBe("new-cat");

    const row = fake.tables.pluginCategories?.get(result.id);
    expect(row).toMatchObject({
      slug: "new-cat",
      label: "新分类",
      order: 200,
      archived: false,
    });

    const audit = fake.inserts.find((entry) => entry.table === "auditLogs");
    expect(audit?.value).toMatchObject({
      action: "plugin_category.create",
      targetType: "pluginCategory",
      targetId: result.id,
      actorUserId: "users:actor",
    });
  });

  it("rejects a moderator", async () => {
    bindUser("moderator");
    const { ctx } = makeCtx();
    await expect(
      createPluginHandler(ctx, { slug: "fresh", label: "Fresh", order: 1 }),
    ).rejects.toThrow("Forbidden");
  });

  it("rejects a regular user", async () => {
    bindUser("user");
    const { ctx } = makeCtx();
    await expect(
      createPluginHandler(ctx, { slug: "fresh", label: "Fresh", order: 1 }),
    ).rejects.toThrow("Forbidden");
  });

  it("rejects an invalid slug (uppercase / non-kebab)", async () => {
    bindUser("admin");
    const { ctx } = makeCtx();
    await expect(
      createPluginHandler(ctx, { slug: "BadSlug", label: "Bad", order: 1 }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("rejects an empty label", async () => {
    bindUser("admin");
    const { ctx } = makeCtx();
    await expect(
      createPluginHandler(ctx, { slug: "fine-slug", label: "   ", order: 1 }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("rejects duplicate slug", async () => {
    bindUser("admin");
    const { ctx } = makeCtx({
      pluginCategories: [
        {
          _id: "pluginCategories:existing",
          slug: "ecommerce",
          label: "电商与市场",
          order: 10,
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    await expect(
      createPluginHandler(ctx, { slug: "ecommerce", label: "重复", order: 99 }),
    ).rejects.toBeInstanceOf(ConvexError);
  });
});

describe("updatePluginCategory", () => {
  function seededCtx(role: "admin" | "moderator" | "user") {
    bindUser(role);
    return makeCtx({
      pluginCategories: [
        {
          _id: "pluginCategories:row1",
          slug: "ecommerce",
          label: "电商与市场",
          order: 10,
          archived: false,
          createdAt: 100,
          updatedAt: 100,
        },
      ],
    });
  }

  it("moderator can update label / icon / order and writes audit log", async () => {
    const { ctx, fake } = seededCtx("moderator");
    await updatePluginHandler(ctx, {
      id: "pluginCategories:row1",
      label: "电商",
      icon: "shopping-cart",
      order: 5,
    });
    const row = fake.tables.pluginCategories?.get("pluginCategories:row1");
    expect(row).toMatchObject({
      slug: "ecommerce", // slug NEVER changes
      label: "电商",
      icon: "shopping-cart",
      order: 5,
    });
    const audit = fake.inserts.find((e) => e.table === "auditLogs");
    expect(audit?.value).toMatchObject({
      action: "plugin_category.update",
      targetType: "pluginCategory",
      targetId: "pluginCategories:row1",
    });
    const meta = audit?.value.metadata as { changes: Record<string, unknown> };
    expect(meta.changes).toHaveProperty("label");
    expect(meta.changes).toHaveProperty("icon");
    expect(meta.changes).toHaveProperty("order");
  });

  it("rejects a regular user", async () => {
    const { ctx } = seededCtx("user");
    await expect(
      updatePluginHandler(ctx, { id: "pluginCategories:row1", label: "no" }),
    ).rejects.toThrow("Forbidden");
  });

  it("never mutates slug even when handler arg is provided (immutability invariant)", async () => {
    const { ctx, fake } = seededCtx("admin");
    await updatePluginHandler(ctx, {
      id: "pluginCategories:row1",
      // @ts-expect-error -- args validator rejects slug; we still defend in the handler
      slug: "totally-different",
      label: "renamed",
    });
    const row = fake.tables.pluginCategories?.get("pluginCategories:row1");
    expect(row?.slug).toBe("ecommerce");
  });

  it("clears icon when explicitly set to null", async () => {
    const { ctx, fake } = seededCtx("admin");
    // Pre-set an icon.
    fake.tables.pluginCategories?.set("pluginCategories:row1", {
      ...(fake.tables.pluginCategories.get("pluginCategories:row1") as Row),
      icon: "old",
    });
    await updatePluginHandler(ctx, { id: "pluginCategories:row1", icon: null });
    const row = fake.tables.pluginCategories?.get("pluginCategories:row1");
    expect(row?.icon).toBeUndefined();
  });

  it("is a noop and writes no audit log when nothing actually changes", async () => {
    const { ctx, fake } = seededCtx("admin");
    await updatePluginHandler(ctx, { id: "pluginCategories:row1", label: "电商与市场" });
    expect(fake.inserts.some((e) => e.table === "auditLogs")).toBe(false);
  });
});

describe("archivePluginCategory / unarchivePluginCategory", () => {
  function seededCtx(role: "admin" | "moderator" | "user", archived: boolean = false) {
    bindUser(role);
    return makeCtx({
      pluginCategories: [
        {
          _id: "pluginCategories:row1",
          slug: "ecommerce",
          label: "电商与市场",
          order: 10,
          archived,
          createdAt: 100,
          updatedAt: 100,
        },
        {
          _id: "pluginCategories:other",
          slug: "other",
          label: "其他",
          order: 9999,
          archived: false,
          createdAt: 100,
          updatedAt: 100,
        },
      ],
      packages: [
        {
          _id: "packages:p1",
          name: "still-tagged",
          pluginCategorySlug: "ecommerce",
        },
      ],
    });
  }

  it("admin can archive a category, writes audit log, and never touches existing packages", async () => {
    const { ctx, fake } = seededCtx("admin");
    await archivePluginHandler(ctx, { id: "pluginCategories:row1" });
    const row = fake.tables.pluginCategories?.get("pluginCategories:row1");
    expect(row?.archived).toBe(true);

    // Existing packages were not mutated — archive is purely a dictionary flag.
    const pkg = fake.tables.packages?.get("packages:p1");
    expect(pkg).toMatchObject({ pluginCategorySlug: "ecommerce" });
    expect(fake.patches.some((p) => p.id === "packages:p1")).toBe(false);

    const audit = fake.inserts.find((e) => e.table === "auditLogs");
    expect(audit?.value).toMatchObject({
      action: "plugin_category.archive",
      targetType: "pluginCategory",
    });
  });

  it("rejects moderator", async () => {
    const { ctx } = seededCtx("moderator");
    await expect(archivePluginHandler(ctx, { id: "pluginCategories:row1" })).rejects.toThrow(
      "Forbidden",
    );
  });

  it("rejects archiving the 'other' fallback bucket", async () => {
    const { ctx } = seededCtx("admin");
    await expect(
      archivePluginHandler(ctx, { id: "pluginCategories:other" }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("admin can unarchive and writes audit log", async () => {
    const { ctx, fake } = seededCtx("admin", true);
    await unarchivePluginHandler(ctx, { id: "pluginCategories:row1" });
    const row = fake.tables.pluginCategories?.get("pluginCategories:row1");
    expect(row?.archived).toBe(false);
    const audit = fake.inserts.find((e) => e.table === "auditLogs");
    expect(audit?.value).toMatchObject({ action: "plugin_category.unarchive" });
  });
});

describe("listPluginCategoriesDictionary (public)", () => {
  it("excludes archived rows and sorts by order ascending", async () => {
    const { ctx } = makeCtx({
      pluginCategories: [
        {
          _id: "pluginCategories:b",
          slug: "marketing-ads",
          label: "营销与广告",
          order: 20,
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          _id: "pluginCategories:a",
          slug: "ecommerce",
          label: "电商与市场",
          order: 10,
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          _id: "pluginCategories:hidden",
          slug: "social-media",
          label: "社交媒体",
          order: 30,
          archived: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const result = (await listDictionaryHandler(ctx, {})) as Array<{ slug: string }>;
    expect(result.map((r) => r.slug)).toEqual(["ecommerce", "marketing-ads"]);
  });
});

describe("listSkillCategoriesDictionary (public)", () => {
  it("uses the skillCategories table", async () => {
    const { ctx } = makeCtx({
      skillCategories: [
        {
          _id: "skillCategories:a",
          slug: "sourcing",
          label: "货源与选品",
          order: 10,
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const result = (await listSkillDictionaryHandler(ctx, {})) as Array<{ slug: string }>;
    expect(result.map((r) => r.slug)).toEqual(["sourcing"]);
  });
});

describe("listAllPluginCategoriesForManagement", () => {
  it("requires moderator role", async () => {
    bindUser("user");
    const { ctx } = makeCtx();
    await expect(listAllHandler(ctx, {})).rejects.toThrow("Forbidden");
  });

  it("returns archived rows after active rows, sorted by order within each group", async () => {
    bindUser("moderator");
    const { ctx } = makeCtx({
      pluginCategories: [
        {
          slug: "a",
          label: "A",
          order: 30,
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          slug: "b",
          label: "B",
          order: 10,
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          slug: "z",
          label: "Z",
          order: 5,
          archived: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const rows = (await listAllHandler(ctx, {})) as Array<{ slug: string; archived: boolean }>;
    expect(rows.map((r) => r.slug)).toEqual(["b", "a", "z"]);
  });
});

describe("skill family smoke", () => {
  it("create + update + archive + listAll work via the skill binding", async () => {
    bindUser("admin");
    const { ctx, fake } = makeCtx();

    const created = await createSkillHandler(ctx, {
      slug: "sourcing",
      label: "货源与选品",
      order: 10,
    });
    expect(fake.inserts.find((e) => e.table === "auditLogs")?.value).toMatchObject({
      action: "skill_category.create",
      targetType: "skillCategory",
    });

    await updateSkillHandler(ctx, { id: created.id, label: "选品" });
    expect(fake.inserts.filter((e) => e.table === "auditLogs").pop()?.value).toMatchObject({
      action: "skill_category.update",
    });

    await archiveSkillHandler(ctx, { id: created.id });
    expect(fake.inserts.filter((e) => e.table === "auditLogs").pop()?.value).toMatchObject({
      action: "skill_category.archive",
    });

    const row = fake.tables.skillCategories?.get(created.id);
    expect(row?.archived).toBe(true);
  });
});
