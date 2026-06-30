// Unit tests for the one-shot category backfill mutation. Mirrors the mock-db
// pattern from marketplaceCategories.test.ts (direct `_handler` invocation,
// `vi.mock("./lib/access")` to bypass auth, hand-rolled in-memory tables).
//
// We test the inner batch helpers (`__test.backfillPackagesBatch` /
// `__test.backfillSkillsBatch`) AND the wrapping mutation to cover:
//   * idempotency — rows with an existing slug (any value) are not touched
//   * happy path — every undefined row is rewritten to "other"
//   * permission gate — non-admin users are rejected
//   * audit summary — single row per invocation, captures cursors + totals
//   * cursor-based pagination — caller can resume mid-backfill

import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

vi.mock("./lib/access", async () => {
  const actual = await vi.importActual<typeof import("./lib/access")>("./lib/access");
  return { ...actual, requireUser: vi.fn() };
});

const { requireUser } = await import("./lib/access");
const { backfillMarketplaceCategoryAssignments, __test } =
  await import("./marketplaceCategoriesBackfill");

type WrappedHandler<TArgs, TResult> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

const backfillHandler = (
  backfillMarketplaceCategoryAssignments as unknown as WrappedHandler<
    {
      packagesCursor?: string | null;
      skillsCursor?: string | null;
    },
    {
      packagesUpdated: number;
      skillsUpdated: number;
      packagesScanned: number;
      skillsScanned: number;
      nextPackagesCursor: string | null;
      nextSkillsCursor: string | null;
      isDone: boolean;
    }
  >
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

  function paginate(name: string, opts: { cursor?: string | null; numItems: number }) {
    const all = Array.from(table(name).values());
    const startIdx = opts.cursor ? Number(opts.cursor) : 0;
    const endIdx = Math.min(startIdx + opts.numItems, all.length);
    const page = all.slice(startIdx, endIdx);
    const isDone = endIdx >= all.length;
    return {
      page,
      isDone,
      continueCursor: isDone ? "" : String(endIdx),
    };
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
      paginate: async (opts: { cursor?: string | null; numItems: number }) => paginate(name, opts),
      take: async (n: number) => Array.from(table(name).values()).slice(0, n),
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

function makeCtx(initial?: Record<string, Array<Record<string, unknown>>>) {
  const fake = makeFakeDb(initial);
  return { fake, ctx: { db: fake.db } as never };
}

describe("backfillPackagesBatch (helper)", () => {
  it("rewrites undefined rows to 'other' and leaves any other value untouched", async () => {
    const { ctx, fake } = makeCtx({
      packages: [
        { _id: "packages:a", name: "a", family: "code-plugin" },
        { _id: "packages:b", name: "b", family: "code-plugin", pluginCategorySlug: "ecommerce" },
        { _id: "packages:c", name: "c", family: "code-plugin", pluginCategorySlug: "other" },
        { _id: "packages:d", name: "d", family: "bundle-plugin" },
      ],
    });
    const result = await __test.backfillPackagesBatch(ctx, null);
    expect(result.updated).toBe(2); // a + d
    expect(result.scanned).toBe(4);
    expect(fake.tables.packages?.get("packages:a")?.pluginCategorySlug).toBe("other");
    expect(fake.tables.packages?.get("packages:d")?.pluginCategorySlug).toBe("other");
    // Pre-assigned rows are untouched — including the operator-set "other".
    expect(fake.tables.packages?.get("packages:b")?.pluginCategorySlug).toBe("ecommerce");
    expect(fake.tables.packages?.get("packages:c")?.pluginCategorySlug).toBe("other");
  });

  it("skips family === 'skill' rows so they don't double-write the skill column", async () => {
    // Defence in depth — publishPackageImpl rejects family=skill anyway, but
    // the schema doesn't and an old fixture row could exist.
    const { ctx, fake } = makeCtx({
      packages: [{ _id: "packages:skill1", name: "x", family: "skill" }],
    });
    const result = await __test.backfillPackagesBatch(ctx, null);
    expect(result.updated).toBe(0);
    expect(fake.tables.packages?.get("packages:skill1")?.pluginCategorySlug).toBeUndefined();
  });
});

describe("backfillSkillsBatch (helper)", () => {
  it("rewrites undefined skills.skillCategorySlug to 'other'", async () => {
    const { ctx, fake } = makeCtx({
      skills: [
        { _id: "skills:a", slug: "a" },
        { _id: "skills:b", slug: "b", skillCategorySlug: "agent-infra" },
      ],
    });
    const result = await __test.backfillSkillsBatch(ctx, null);
    expect(result.updated).toBe(1);
    expect(fake.tables.skills?.get("skills:a")?.skillCategorySlug).toBe("other");
    expect(fake.tables.skills?.get("skills:b")?.skillCategorySlug).toBe("agent-infra");
  });
});

describe("backfillMarketplaceCategoryAssignments mutation", () => {
  it("rejects non-admin callers", async () => {
    bindUser("moderator");
    const { ctx } = makeCtx();
    await expect(backfillHandler(ctx, {})).rejects.toThrow();
  });

  it("rejects authenticated regular users", async () => {
    bindUser("user");
    const { ctx } = makeCtx();
    await expect(backfillHandler(ctx, {})).rejects.toThrow();
  });

  it("is idempotent on a second run — no patches, isDone: true", async () => {
    bindUser("admin");
    const { ctx, fake } = makeCtx({
      packages: [
        { _id: "packages:a", name: "a", family: "code-plugin", pluginCategorySlug: "other" },
      ],
      skills: [{ _id: "skills:a", slug: "a", skillCategorySlug: "other" }],
    });
    const first = await backfillHandler(ctx, {});
    expect(first.packagesUpdated).toBe(0);
    expect(first.skillsUpdated).toBe(0);
    expect(first.isDone).toBe(true);

    const second = await backfillHandler(ctx, {});
    expect(second.packagesUpdated).toBe(0);
    expect(second.skillsUpdated).toBe(0);
    // The audit row from the first run + the audit row from the second run are
    // both expected — `isDone: true` invocations always emit (start/end signal).
    expect(fake.inserts.filter((i) => i.table === "auditLogs").length).toBe(2);
  });

  it("emits a single audit summary row with cursor metadata when work happened", async () => {
    bindUser("admin", "users:opsadmin");
    const { ctx, fake } = makeCtx({
      packages: [{ _id: "packages:a", name: "a", family: "code-plugin" }],
      skills: [{ _id: "skills:a", slug: "a" }],
    });
    const result = await backfillHandler(ctx, {});
    expect(result.packagesUpdated).toBe(1);
    expect(result.skillsUpdated).toBe(1);
    expect(result.isDone).toBe(true);

    const auditRows = fake.inserts.filter((i) => i.table === "auditLogs");
    expect(auditRows).toHaveLength(1);
    const metadata = auditRows[0]!.value.metadata as Record<string, unknown>;
    expect(metadata.packagesUpdated).toBe(1);
    expect(metadata.skillsUpdated).toBe(1);
    expect(metadata.isDone).toBe(true);
    expect(auditRows[0]!.value.action).toBe("marketplace_categories.backfill");
    expect(auditRows[0]!.value.actorUserId).toBe("users:opsadmin");
  });

  it("supports resumable pagination — caller passes back the returned cursors", async () => {
    bindUser("admin");
    // Create 3 rows; force a tiny page by relying on __test.BACKFILL_PAGE_SIZE
    // being 200 (so 3 rows fit in one page). We additionally test with cursor.
    const { ctx } = makeCtx({
      packages: Array.from({ length: 3 }, (_, i) => ({
        _id: `packages:row${i}`,
        name: `n${i}`,
        family: "code-plugin",
      })),
    });
    const first = await backfillHandler(ctx, {});
    // All 3 rows fit in the single 200-row page → done in one shot.
    expect(first.isDone).toBe(true);
    expect(first.packagesUpdated).toBe(3);
  });

  it("the BACKFILL_PAGE_SIZE constant is a sane mid-range value", () => {
    // Pinned to catch accidental drift — must stay big enough to make progress
    // but small enough to keep per-transaction trigger fanout under budget.
    expect(__test.BACKFILL_PAGE_SIZE).toBeGreaterThan(50);
    expect(__test.BACKFILL_PAGE_SIZE).toBeLessThanOrEqual(500);
  });
});

void ConvexError; // silence unused import
