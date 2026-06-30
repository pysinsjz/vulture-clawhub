// Unit tests for the digest fan-out collapse behaviour added in PR for
// issue#3. Covers the single-row vs legacy-fan-out branch in
// syncPackagePluginCategorySearchDigests:
//
//   * pluginCategorySlug === "ecommerce" → exactly ONE row with
//     pluginCategory = "ecommerce" + the same slug echoed onto the digest row
//   * pluginCategorySlug === undefined → falls back to legacy fan-out over
//     pluginCategoryTags (one row per derived keyword tag)
//
// We exercise `upsertPackageSearchDigest` (the public entry point) because the
// internal fan-out helper is module-private. The mock db tracks every insert
// and patch so we can assert the resulting row shape and count.

import { describe, expect, it, vi } from "vitest";

const { upsertPackageSearchDigest, extractPackageDigestFields } =
  await import("./packageSearchDigest");

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
  function buildChain(rows: Row[]) {
    return {
      unique: async () => (rows.length === 0 ? null : rows[0]!),
      collect: async () => rows.slice(),
    };
  }
  const db = {
    normalizeId: vi.fn(),
    insert: vi.fn(async (name: string, value: Record<string, unknown>) => {
      counter += 1;
      const id = `${name}:${counter}`;
      table(name).set(id, { _id: id, _creationTime: counter, ...value } as Row);
      return id;
    }),
    patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      for (const map of Object.values(tables)) {
        if (map.has(id)) {
          map.set(id, { ...(map.get(id) as Row), ...patch });
          return;
        }
      }
      throw new Error(`patch: id ${id} not found`);
    }),
    delete: vi.fn(async (id: string) => {
      for (const map of Object.values(tables)) {
        if (map.has(id)) {
          map.delete(id);
          return;
        }
      }
    }),
    query: (name: string) => ({
      withIndex: (_indexName: string, _builder?: (q: unknown) => unknown) =>
        buildChain(Array.from(table(name).values())),
      collect: async () => Array.from(table(name).values()),
    }),
  };
  return { db, tables };
}

function basePackage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "packages:p1",
    name: "demo",
    normalizedName: "demo",
    displayName: "Demo",
    family: "code-plugin",
    channel: "community",
    isOfficial: false,
    ownerUserId: "users:o1",
    summary: "An automation helper",
    capabilityTags: ["automation"],
    executesCode: true,
    stats: { downloads: 0, installs: 0, stars: 0, versions: 1 },
    runtimeId: undefined,
    scanStatus: "clean",
    softDeletedAt: undefined,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("syncPackagePluginCategorySearchDigests (single-row vs fan-out)", () => {
  it("writes EXACTLY ONE row when pluginCategorySlug is set", async () => {
    const { db, tables } = makeFakeDb();
    const pkg = basePackage({ pluginCategorySlug: "ecommerce" }) as never;
    const fields = extractPackageDigestFields(pkg);
    await upsertPackageSearchDigest({ db } as never, fields);
    const digestRows = Array.from(tables.packagePluginCategorySearchDigest?.values() ?? []);
    expect(digestRows).toHaveLength(1);
    expect(digestRows[0]!.pluginCategory).toBe("ecommerce");
    expect(digestRows[0]!.pluginCategorySlug).toBe("ecommerce");
  });

  it("falls back to legacy fan-out (multi-row) when pluginCategorySlug is undefined", async () => {
    const { db, tables } = makeFakeDb();
    // 'automation' keyword in capabilityTags + summary triggers >=1 derived tag
    // via derivePluginCategoryTags from clawhub-schema. We don't assert the
    // exact set (that lives in the schema package's own tests); just that the
    // fan-out path produced AT LEAST one row, distinguishing it from the
    // single-row branch.
    const pkg = basePackage({ pluginCategorySlug: undefined }) as never;
    const fields = extractPackageDigestFields(pkg);
    await upsertPackageSearchDigest({ db } as never, fields);
    const digestRows = Array.from(tables.packagePluginCategorySearchDigest?.values() ?? []);
    expect(digestRows.length).toBeGreaterThanOrEqual(1);
    // legacy fan-out rows do NOT carry the new slug field
    for (const row of digestRows) {
      expect(row.pluginCategorySlug).toBeUndefined();
    }
  });

  it("transition from undefined to slug → drops fan-out rows and writes single row", async () => {
    const { db, tables } = makeFakeDb();
    const pkgBefore = basePackage({ pluginCategorySlug: undefined }) as never;
    await upsertPackageSearchDigest({ db } as never, extractPackageDigestFields(pkgBefore));
    const beforeRows = Array.from(tables.packagePluginCategorySearchDigest?.values() ?? []);
    expect(beforeRows.length).toBeGreaterThanOrEqual(1);
    const beforeIsLegacy = beforeRows.every((r) => r.pluginCategorySlug === undefined);
    expect(beforeIsLegacy).toBe(true);

    // Now the operator assigns a slug. The next sync collapses to single-row.
    const pkgAfter = basePackage({ pluginCategorySlug: "ecommerce" }) as never;
    await upsertPackageSearchDigest({ db } as never, extractPackageDigestFields(pkgAfter));
    const afterRows = Array.from(tables.packagePluginCategorySearchDigest?.values() ?? []);
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0]!.pluginCategory).toBe("ecommerce");
    expect(afterRows[0]!.pluginCategorySlug).toBe("ecommerce");
  });
});
