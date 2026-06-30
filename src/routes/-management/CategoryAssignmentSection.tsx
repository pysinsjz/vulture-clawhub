// Reusable section embedded at the top of PluginsPage / SkillsPage for the
// management category re-assignment flow (PRD: marketplace-categories, AC#9):
//   * filter the list by category (including the synthetic "other" bucket and
//     archived slugs)
//   * inline-edit a single row's slug
//   * multi-select + bulk apply a target slug
//
// Self-contained on purpose so the existing PluginsPage / SkillsPage props
// surface does not have to grow — those pages just render `<CategoryAssignmentSection family={...} />`.
//
// Permission: `assertModerator` is enforced server-side on every mutation
// dispatched from here, so we render the section for the moderator/admin
// callsite and let the mutation surface 403s if the user role drifts mid-session.

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

// Matches the sentinel exported by convex/marketplaceCategoriesAssignment.ts.
// Kept inline (not imported from convex) because component code is bundled
// without server-only files.
const OTHER_BUCKET_SENTINEL = "__other__";

type Family = "plugin" | "skill";

type ManagementCategory = {
  id: string;
  slug: string;
  label: string;
  order: number;
  icon: string | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

type AssignmentRow = {
  id: string;
  name: string;
  displayName: string;
  slug: string | null;
  family?: string;
  updatedAt: number;
};

export function CategoryAssignmentSection({ family }: { family: Family }) {
  const isPlugin = family === "plugin";

  const categories = useQuery(
    isPlugin
      ? api.marketplaceCategories.listAllPluginCategoriesForManagement
      : api.marketplaceCategories.listAllSkillCategoriesForManagement,
    {},
  ) as ManagementCategory[] | undefined;

  // null = "all rows" (no filter applied); a string is the dictionary slug or
  // the OTHER_BUCKET_SENTINEL. Stored as `string | null` (not undefined) so we
  // can distinguish "user explicitly chose the all-rows view" from "page just
  // mounted, query not yet loaded".
  const [filterSlug, setFilterSlug] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSlug, setBulkSlug] = useState<string>("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const rows = useQuery(
    isPlugin
      ? api.marketplaceCategoriesAssignment.listPluginsByCategoryForManagement
      : api.marketplaceCategoriesAssignment.listSkillsByCategoryForManagement,
    { categorySlug: filterSlug ?? undefined, limit: 200 },
  ) as AssignmentRow[] | undefined;

  const setSingle = useMutation(
    isPlugin
      ? api.marketplaceCategoriesAssignment.setPluginCategoryAssignment
      : api.marketplaceCategoriesAssignment.setSkillCategoryAssignment,
  );
  const setBulk = useMutation(
    isPlugin
      ? api.marketplaceCategoriesAssignment.bulkSetPluginCategoryAssignment
      : api.marketplaceCategoriesAssignment.bulkSetSkillCategoryAssignment,
  );

  // Lookup helpers: dictionary indexed by slug for label rendering, and the
  // archived list shown after the active list in the assign dropdown so the
  // moderator can still move legacy publishes into archived buckets.
  const categoryBySlug = useMemo(() => {
    const map = new Map<string, ManagementCategory>();
    for (const entry of categories ?? []) {
      map.set(entry.slug, entry);
    }
    return map;
  }, [categories]);

  const orderedCategories = useMemo(() => {
    if (!categories) return [];
    return [...categories].sort((a, b) => {
      const archivedDiff = Number(a.archived) - Number(b.archived);
      if (archivedDiff !== 0) return archivedDiff;
      return a.order - b.order;
    });
  }, [categories]);

  if (!categories) {
    return <div className="management-empty">正在加载分类…</div>;
  }

  const visibleRows = rows ?? [];
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id));

  function toggleRowSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleRows.map((row) => row.id)));
  }

  async function assignSingle(row: AssignmentRow, nextSlug: string) {
    if (!nextSlug) return;
    setPendingIds((current) => new Set(current).add(row.id));
    try {
      if (isPlugin) {
        await setSingle({
          packageId: row.id as Id<"packages">,
          slug: nextSlug,
        });
      } else {
        await setSingle({
          skillId: row.id as Id<"skills">,
          slug: nextSlug,
        });
      }
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  }

  async function applyBulk() {
    if (!bulkSlug || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setPendingIds(new Set(ids));
    try {
      if (isPlugin) {
        await setBulk({
          packageIds: ids as Id<"packages">[],
          slug: bulkSlug,
        });
      } else {
        await setBulk({
          skillIds: ids as Id<"skills">[],
          slug: bulkSlug,
        });
      }
      setSelectedIds(new Set());
    } finally {
      setPendingIds(new Set());
    }
  }

  return (
    <div
      className="management-view"
      style={{
        marginTop: "1rem",
        padding: "1rem",
        border: "1px dashed var(--line)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <h3 className="section-title text-[1.05rem] m-0">
        {isPlugin ? "Plugin 分类整理" : "Skill 分类整理"}
      </h3>
      <p className="section-subtitle m-0 mt-1">
        按归类筛选 · 单条改归属 · 多选批量改归属。所有操作写入 audit
        log。归档分类仍可被分配（运营整理场景）。
      </p>

      <div
        className="management-controls"
        style={{ marginTop: "0.75rem", gap: "0.5rem", flexWrap: "wrap" }}
      >
        <div className="management-control" style={{ minWidth: "220px" }}>
          <span className="mono">按归类筛选</span>
          <Select
            value={filterSlug ?? "__all__"}
            onValueChange={(value) => setFilterSlug(value === "__all__" ? null : value)}
          >
            <SelectTrigger className="min-h-[36px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部</SelectItem>
              <SelectItem value={OTHER_BUCKET_SENTINEL}>其他（含未归类）</SelectItem>
              {orderedCategories.map((entry) => (
                <SelectItem key={entry.slug} value={entry.slug}>
                  {entry.label} ({entry.slug}){entry.archived ? " · 归档" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="management-control" style={{ minWidth: "260px" }}>
          <span className="mono">批量改为</span>
          <Select value={bulkSlug} onValueChange={setBulkSlug}>
            <SelectTrigger className="min-h-[36px]">
              <SelectValue placeholder="选择目标分类" />
            </SelectTrigger>
            <SelectContent>
              {orderedCategories.map((entry) => (
                <SelectItem key={entry.slug} value={entry.slug}>
                  {entry.label} ({entry.slug}){entry.archived ? " · 归档" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          disabled={!bulkSlug || selectedIds.size === 0}
          onClick={() => void applyBulk()}
        >
          应用到选中 {selectedIds.size} 条
        </Button>
      </div>

      <div className="management-list" style={{ marginTop: "0.75rem" }}>
        {rows === undefined ? (
          <div className="management-empty">正在加载…</div>
        ) : visibleRows.length === 0 ? (
          <div className="management-empty">无匹配行。</div>
        ) : (
          <>
            <div className="management-item" style={{ background: "transparent" }}>
              <div className="management-item-main">
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => toggleAllVisible()}
                  />
                  <span className="section-subtitle m-0">全选可见 ({visibleRows.length})</span>
                </label>
              </div>
            </div>
            {visibleRows.map((row) => {
              const dictEntry = row.slug ? categoryBySlug.get(row.slug) : undefined;
              const isPending = pendingIds.has(row.id);
              const isChecked = selectedIds.has(row.id);
              return (
                <div key={row.id} className="management-item">
                  <div className="management-item-main">
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRowSelected(row.id)}
                      />
                      <span>
                        <strong>{row.displayName}</strong>{" "}
                        <span className="mono section-subtitle">{row.name}</span>
                      </span>
                    </label>
                    <div className="section-subtitle m-0">
                      当前：
                      {row.slug ? (
                        <>
                          {dictEntry?.label ?? row.slug} <span className="mono">({row.slug})</span>
                          {dictEntry?.archived ? (
                            <Badge variant="warning" size="sm">
                              归档
                            </Badge>
                          ) : null}
                        </>
                      ) : (
                        <Badge variant="warning" size="sm">
                          未归类
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="management-actions" style={{ minWidth: "200px" }}>
                    <Select
                      disabled={isPending}
                      value={row.slug ?? ""}
                      onValueChange={(nextSlug) => void assignSingle(row, nextSlug)}
                    >
                      <SelectTrigger className="min-h-[32px]">
                        <SelectValue placeholder="改归类…" />
                      </SelectTrigger>
                      <SelectContent>
                        {orderedCategories.map((entry) => (
                          <SelectItem key={entry.slug} value={entry.slug}>
                            {entry.label}
                            {entry.archived ? " · 归档" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
