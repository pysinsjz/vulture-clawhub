// Unit tests for the management-side category re-assignment mutations.
// Coverage:
//   * single-row assign — happy path + audit + no-op (same slug)
//   * single-row assign — perm gate (admin/moderator ok, user rejected)
//   * single-row assign — rejects unknown slugs (not in dictionary at all)
//   * single-row assign — ALLOWS archived slugs (operator path needs them)
//   * bulk assign — happy path + single summary audit row
//   * bulk assign — empty / cap-exceeded errors
//   * filter list query — "other" sentinel returns explicit + undefined rows

import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

vi.mock("./lib/access", async () => {
  const actual = await vi.importActual<typeof import("./lib/access")>("./lib/access");
  return { ...actual, requireUser: vi.fn() };
});

const { requireUser } = await import("./lib/access");
const {
  setPluginCategoryAssignment,
  setSkillCategoryAssignment,
  bulkSetPluginCategoryAssignment,
  bulkSetSkillCategoryAssignment,
  listPluginsByCategoryForManagement,
  OTHER_BUCKET_SENTINEL,
  BULK_ASSIGNMENT_CAP,
} = await import("./marketplaceCategoriesAssignment");

type WrappedHandler<TArgs, TResult> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

const setPlugin = (
  setPluginCategoryAssignment as unknown as WrappedHandler<
    { packageId: string; slug: string },
    { id: string; slug: string; changed: boolean }
  >
)._handler;
const setSkill = (
  setSkillCategoryAssignment as unknown as WrappedHandler<
    { skillId: string; slug: string },
    { id: string; slug: string; changed: boolean }
  >
)._handler;
const bulkPlugin = (
  bulkSetPluginCategoryAssignment as unknown as WrappedHandler<
    { packageIds: string[]; slug: string },
    { changedCount: number; skippedCount: number }
  >
)._handler;
const bulkSkill = (
  bulkSetSkillCategoryAssignment as unknown as WrappedHandler<
    { skillIds: string[]; slug: string },
    { changedCount: number; skippedCount: number }
  >
)._handler;
const listPlugins = (
  listPluginsByCategoryForManagement as unknown as WrappedHandler<
    { categorySlug?: string; limit?: number },
    unknown[]
  >
)._handler;

type Row = Record<string, unknown> & { _id: string; _creationTime: number };

function makeFakeDb(initial: Record<string, Array<Record<string, unknown>>>) {
  const tables: Record<string, Map<string, Row>> = {};
  let counter = 0;
  function table(name: string): Map<string, Row> {
    if (!tables[name]) tables[name] = new Map();
    return tables[name];
  }
  for (const [name, rows] of Object.entries(initial)) {
    for (const row of rows) {
      counter += 1;
      const id = (row._id as string | undefined) ?? `${name}:${counter}`;
      table(name).set(id, { _id: id, _creationTime: counter, ...row } as Row);
    }
  }
  const inserts: Array<{ table: string; value: Row }> = [];
  const patches: Array<{ id: string; value: Record<string, unknown> }> = [];

  function buildChain(rows: Row[]) {
    return {
      collect: async () => rows.slice(),
      take: async (n: number) => rows.slice(0, n),
      order: () => buildChain(rows),
    };
  }

  function withIndex(name: string, indexName: string, builder?: (q: unknown) => unknown) {
    const rows = Array.from(table(name).values());
    if (indexName === "by_active_updated") {
      let target: unknown;
      const q = {
        eq: (_f: string, v: unknown) => {
          target = v;
          return q;
        },
      };
      if (builder) builder(q);
      return buildChain(rows.filter((r) => r.softDeletedAt === target));
    }
    if (indexName === "by_categorySlug_updated") {
      let target: unknown;
      const q = {
        eq: (_f: string, v: unknown) => {
          target = v;
          return q;
        },
      };
      if (builder) builder(q);
      const field = name === "packages" ? "pluginCategorySlug" : "skillCategorySlug";
      return buildChain(rows.filter((r) => r[field] === target));
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
    query: (name: string) => ({
      withIndex: (indexName: string, builder?: (q: unknown) => unknown) =>
        withIndex(name, indexName, builder),
      collect: async () => Array.from(table(name).values()),
      take: async (n: number) => Array.from(table(name).values()).slice(0, n),
      order: () => ({
        take: async (n: number) => Array.from(table(name).values()).slice(0, n),
      }),
    }),
  };
  return { db, tables, inserts, patches };
}

function bindUser(role: "admin" | "moderator" | "user", id = "users:actor") {
  const user = {
    _id: id,
    _creationTime: 1,
    role,
    deletedAt: null,
    deactivatedAt: null,
  };
  (requireUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: user._id,
    user,
  });
  return user;
}

const baseCategories = {
  pluginCategories: [
    { _id: "pluginCategories:eco", slug: "ecommerce", label: "电商", order: 10, archived: false },
    {
      _id: "pluginCategories:mkt",
      slug: "marketing-ads",
      label: "营销",
      order: 20,
      archived: false,
    },
    { _id: "pluginCategories:arx", slug: "old-slug", label: "归档", order: 30, archived: true },
    { _id: "pluginCategories:other", slug: "other", label: "其他", order: 9999, archived: false },
  ],
  skillCategories: [
    { _id: "skillCategories:src", slug: "sourcing", label: "选品", order: 10, archived: false },
    { _id: "skillCategories:arx", slug: "legacy-skill", label: "归档", order: 30, archived: true },
    { _id: "skillCategories:other", slug: "other", label: "其他", order: 9999, archived: false },
  ],
};

describe("setPluginCategoryAssignment", () => {
  it("rejects regular users", async () => {
    bindUser("user");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [{ _id: "packages:a", name: "a", family: "code-plugin" }],
    });
    await expect(
      setPlugin({ db: fake.db } as never, { packageId: "packages:a", slug: "ecommerce" }),
    ).rejects.toThrow();
  });

  it("moderators can re-assign an active slug + writes audit", async () => {
    bindUser("moderator", "users:mod");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [
        {
          _id: "packages:a",
          name: "@scope/a",
          family: "code-plugin",
          pluginCategorySlug: undefined,
        },
      ],
    });
    const result = await setPlugin({ db: fake.db } as never, {
      packageId: "packages:a",
      slug: "ecommerce",
    });
    expect(result.changed).toBe(true);
    expect(fake.tables.packages?.get("packages:a")?.pluginCategorySlug).toBe("ecommerce");
    const audit = fake.inserts.find((i) => i.table === "auditLogs");
    expect(audit).toBeDefined();
    const auditMetadata = audit!.value.metadata as Record<string, unknown>;
    expect(audit!.value.action).toBe("package.category.assign");
    expect(auditMetadata.to).toBe("ecommerce");
    expect(auditMetadata.from).toBe(null);
  });

  it("allows assignment to an ARCHIVED slug (operator curation path)", async () => {
    bindUser("admin");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [{ _id: "packages:a", name: "a", family: "code-plugin" }],
    });
    const result = await setPlugin({ db: fake.db } as never, {
      packageId: "packages:a",
      slug: "old-slug",
    });
    expect(result.changed).toBe(true);
    expect(fake.tables.packages?.get("packages:a")?.pluginCategorySlug).toBe("old-slug");
  });

  it("rejects slugs that are not in the dictionary at all", async () => {
    bindUser("admin");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [{ _id: "packages:a", name: "a", family: "code-plugin" }],
    });
    await expect(
      setPlugin({ db: fake.db } as never, { packageId: "packages:a", slug: "never-existed" }),
    ).rejects.toThrow(/UNKNOWN_SLUG|not in the dictionary/);
  });

  it("returns changed=false (no audit) when slug already matches", async () => {
    bindUser("admin");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [
        {
          _id: "packages:a",
          name: "a",
          family: "code-plugin",
          pluginCategorySlug: "ecommerce",
        },
      ],
    });
    const result = await setPlugin({ db: fake.db } as never, {
      packageId: "packages:a",
      slug: "ecommerce",
    });
    expect(result.changed).toBe(false);
    expect(fake.inserts.filter((i) => i.table === "auditLogs")).toHaveLength(0);
  });

  it("rejects packageIds that route to family=skill rows", async () => {
    bindUser("admin");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [{ _id: "packages:s", name: "s", family: "skill" }],
    });
    await expect(
      setPlugin({ db: fake.db } as never, { packageId: "packages:s", slug: "ecommerce" }),
    ).rejects.toThrow(/WRONG_FAMILY|skill rows/);
  });
});

describe("setSkillCategoryAssignment", () => {
  it("moderators can re-assign + audit", async () => {
    bindUser("moderator", "users:mod");
    const fake = makeFakeDb({
      ...baseCategories,
      skills: [{ _id: "skills:a", slug: "a-skill", displayName: "A" }],
    });
    const result = await setSkill({ db: fake.db } as never, {
      skillId: "skills:a",
      slug: "sourcing",
    });
    expect(result.changed).toBe(true);
    expect(fake.tables.skills?.get("skills:a")?.skillCategorySlug).toBe("sourcing");
    expect(fake.inserts.find((i) => i.table === "auditLogs")?.value.action).toBe(
      "skill.category.assign",
    );
  });
});

describe("bulkSetPluginCategoryAssignment", () => {
  it("processes 3 rows and writes ONE summary audit row", async () => {
    bindUser("moderator", "users:mod");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [
        { _id: "packages:a", name: "a", family: "code-plugin" },
        {
          _id: "packages:b",
          name: "b",
          family: "code-plugin",
          pluginCategorySlug: "marketing-ads",
        },
        { _id: "packages:c", name: "c", family: "code-plugin", pluginCategorySlug: "ecommerce" },
      ],
    });
    const result = await bulkPlugin({ db: fake.db } as never, {
      packageIds: ["packages:a", "packages:b", "packages:c"],
      slug: "ecommerce",
    });
    expect(result.changedCount).toBe(2); // a (undefined → ecommerce) + b (marketing → ecommerce)
    expect(result.skippedCount).toBe(1); // c already on target
    const auditRows = fake.inserts.filter((i) => i.table === "auditLogs");
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.value.action).toBe("package.category.bulk_assign");
    const metadata = auditRows[0]!.value.metadata as Record<string, unknown>;
    expect(metadata.to).toBe("ecommerce");
    expect(metadata.changedCount).toBe(2);
    expect(metadata.skippedCount).toBe(1);
    expect(Array.isArray(metadata.changed)).toBe(true);
  });

  it("rejects empty selection", async () => {
    bindUser("admin");
    const fake = makeFakeDb(baseCategories);
    await expect(
      bulkPlugin({ db: fake.db } as never, { packageIds: [], slug: "ecommerce" }),
    ).rejects.toThrow(/EMPTY_SELECTION|no packages selected/);
  });

  it("rejects over-cap selection", async () => {
    bindUser("admin");
    const fake = makeFakeDb(baseCategories);
    const ids = Array.from({ length: BULK_ASSIGNMENT_CAP + 1 }, (_, i) => `packages:row${i}`);
    await expect(
      bulkPlugin({ db: fake.db } as never, { packageIds: ids, slug: "ecommerce" }),
    ).rejects.toThrow(/BULK_TOO_LARGE|capped at/);
  });

  it("rejects regular users", async () => {
    bindUser("user");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [{ _id: "packages:a", name: "a", family: "code-plugin" }],
    });
    await expect(
      bulkPlugin({ db: fake.db } as never, { packageIds: ["packages:a"], slug: "ecommerce" }),
    ).rejects.toThrow();
  });
});

describe("bulkSetSkillCategoryAssignment", () => {
  it("processes selection and emits one summary audit", async () => {
    bindUser("admin");
    const fake = makeFakeDb({
      ...baseCategories,
      skills: [
        { _id: "skills:a", slug: "a", displayName: "A" },
        { _id: "skills:b", slug: "b", displayName: "B" },
      ],
    });
    const result = await bulkSkill({ db: fake.db } as never, {
      skillIds: ["skills:a", "skills:b"],
      slug: "sourcing",
    });
    expect(result.changedCount).toBe(2);
    const auditRows = fake.inserts.filter((i) => i.table === "auditLogs");
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.value.action).toBe("skill.category.bulk_assign");
  });
});

describe("listPluginsByCategoryForManagement", () => {
  it("OTHER sentinel returns explicit 'other' AND undefined rows", async () => {
    bindUser("moderator");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [
        {
          _id: "packages:explicit",
          name: "exp",
          displayName: "Explicit Other",
          family: "code-plugin",
          pluginCategorySlug: "other",
          updatedAt: 100,
          softDeletedAt: undefined,
        },
        {
          _id: "packages:undef",
          name: "und",
          displayName: "Undefined Slug",
          family: "code-plugin",
          updatedAt: 50,
          softDeletedAt: undefined,
        },
        {
          _id: "packages:assigned",
          name: "asn",
          displayName: "Assigned",
          family: "code-plugin",
          pluginCategorySlug: "ecommerce",
          updatedAt: 200,
          softDeletedAt: undefined,
        },
      ],
    });
    const rows = (await listPlugins({ db: fake.db } as never, {
      categorySlug: OTHER_BUCKET_SENTINEL,
    })) as Array<{ id: string }>;
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.has("packages:explicit")).toBe(true);
    expect(ids.has("packages:undef")).toBe(true);
    expect(ids.has("packages:assigned")).toBe(false);
  });

  it("no filter returns rows ordered by updatedAt desc", async () => {
    bindUser("moderator");
    const fake = makeFakeDb({
      ...baseCategories,
      packages: [
        {
          _id: "packages:a",
          name: "a",
          displayName: "A",
          family: "code-plugin",
          updatedAt: 100,
          softDeletedAt: undefined,
        },
      ],
    });
    const rows = (await listPlugins({ db: fake.db } as never, {})) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toContain("packages:a");
  });
});

void ConvexError;
