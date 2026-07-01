import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BrowseSidebar } from "../../components/BrowseSidebar";
import { formatCompactStat } from "../../lib/numberFormat";
import { parseDir, parseSort } from "./-params";
import { SkillsResults } from "./-SkillsResults";
import {
  normalizeSkillsView,
  useSkillsBrowseModel,
  type SkillsSearchState,
} from "./-useSkillsBrowseModel";

const BROWSE_SORT_OPTIONS = [
  { value: "recommended", label: "推荐" },
  { value: "downloads", label: "下载最多" },
  { value: "stars", label: "收藏最多" },
  { value: "installs", label: "安装最多" },
  { value: "updated", label: "最近更新" },
  { value: "newest", label: "最新" },
  { value: "name", label: "名称" },
];

const SEARCH_SORT_OPTIONS = [
  { value: "downloads", label: "下载最多" },
  { value: "stars", label: "收藏最多" },
  { value: "installs", label: "安装最多" },
  { value: "updated", label: "最近更新" },
  { value: "newest", label: "最新" },
  { value: "name", label: "名称" },
];

// Any non-empty slug is accepted here; resolution against the operator
// dictionary (issue #44) happens reactively in useSkillsBrowseModel once the
// dictionary loads. An unknown/stale slug (e.g. an old bookmarked URL) simply
// resolves to no active category rather than failing route validation.
function parseSkillCategorySlug(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const Route = createFileRoute("/skills/")({
  validateSearch: (search): SkillsSearchState => {
    return {
      q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
      sort: typeof search.sort === "string" ? parseSort(search.sort) : undefined,
      dir: search.dir === "asc" || search.dir === "desc" ? search.dir : undefined,
      highlighted:
        search.highlighted === "1" || search.highlighted === "true" || search.highlighted === true
          ? true
          : undefined,
      featured:
        search.featured === "1" || search.featured === "true" || search.featured === true
          ? true
          : undefined,
      category: parseSkillCategorySlug(search.category),
      view: normalizeSkillsView(search.view),
      focus: search.focus === "search" ? "search" : undefined,
    };
  },
  component: SkillsIndex,
});

export function SkillsIndex() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const totalSkills = useQuery(api.skills.countPublicSkills);
  const totalSkillsText = typeof totalSkills === "number" ? formatCompactStat(totalSkills) : null;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Operator category dictionary (issue #44) — already in operator-defined
  // order (archived excluded, "other" sorted last), so it can be passed
  // straight through to the sidebar with no client-side reordering.
  const categoryDictionary =
    useQuery(api.marketplaceCategories.listSkillCategoriesDictionary) ?? [];
  const sidebarCategories = useMemo(
    () =>
      categoryDictionary.map((category) => ({
        slug: category.slug,
        label: category.label,
        icon: category.icon ?? "package",
      })),
    [categoryDictionary],
  );

  const model = useSkillsBrowseModel({
    navigate,
    search,
    searchInputRef,
    categories: sidebarCategories,
  });

  const sortOptionsWithRelevance = model.hasQuery
    ? [{ value: "relevance", label: "相关性" }, ...SEARCH_SORT_OPTIONS]
    : BROWSE_SORT_OPTIONS;

  const handleSortChange = useCallback(
    (value: string) => {
      if (value === "featured") {
        if (!model.featuredOnly) model.onToggleFeatured();
        return;
      }

      if (model.featuredOnly) {
        const nextSort = parseSort(value);
        void navigate({
          search: (prev: SkillsSearchState) => {
            const reusePreviousDir =
              prev.sort !== undefined &&
              prev.sort !== "recommended" &&
              prev.sort !== "default" &&
              prev.sort !== "relevance";
            return {
              ...prev,
              sort: nextSort,
              dir:
                nextSort === "recommended" || nextSort === "default"
                  ? undefined
                  : parseDir(reusePreviousDir ? prev.dir : undefined, nextSort),
              featured: undefined,
              highlighted: undefined,
            };
          },
          replace: true,
        });
        return;
      }

      model.onSortChange(value);
    },
    [model.featuredOnly, model.onSortChange, model.onToggleFeatured, navigate],
  );

  const handleClear = useCallback(() => {
    model.onClearFilters();
  }, [model.onClearFilters]);

  const handleCategoryChange = useCallback(
    (slug: string | undefined) => {
      const category = parseSkillCategorySlug(slug);
      void navigate({
        search: (prev: SkillsSearchState) => ({
          ...prev,
          category,
          featured: undefined,
          highlighted: undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  return (
    <main className="browse-page">
      <div className="browse-page-header">
        <button
          className="browse-sidebar-toggle"
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="切换筛选器"
        >
          筛选
        </button>
        <h1 className="browse-title">
          Skills
          {totalSkillsText ? <span className="browse-count">{totalSkillsText}</span> : null}
        </h1>
      </div>
      <div className="browse-page-search">
        <Search size={15} className="navbar-search-icon" aria-hidden="true" />
        <input
          ref={searchInputRef}
          className="browse-search-input"
          value={model.query}
          onChange={(event) => model.onQueryChange(event.target.value)}
          placeholder="搜索 Skill…"
        />
      </div>
      <div className={`browse-layout${sidebarOpen ? " sidebar-open" : ""}`}>
        <BrowseSidebar
          categories={sidebarCategories}
          activeCategory={model.activeCategory}
          onCategoryChange={handleCategoryChange}
          sortOptions={[{ value: "featured", label: "精选" }, ...sortOptionsWithRelevance]}
          activeSort={model.featuredOnly ? "featured" : model.sort}
          onSortChange={handleSortChange}
        />
        <div className="browse-results">
          <div className="browse-results-toolbar">
            <span className="browse-results-count">
              {model.isLoadingSkills ? "\u2014" : `${model.sorted.length} 个结果`}
              {model.hasQuery || model.activeCategory || model.featuredOnly ? (
                <button className="browse-clear-btn" type="button" onClick={handleClear}>
                  清除
                </button>
              ) : null}
            </span>
            <div className="browse-results-actions">
              <div className="browse-view-toggle">
                <button
                  className={`browse-view-btn${model.view === "list" ? " is-active" : ""}`}
                  type="button"
                  onClick={model.view === "grid" ? model.onToggleView : undefined}
                >
                  列表
                </button>
                <button
                  className={`browse-view-btn${model.view === "grid" ? " is-active" : ""}`}
                  type="button"
                  onClick={model.view === "list" ? model.onToggleView : undefined}
                >
                  网格
                </button>
              </div>
            </div>
          </div>
          <SkillsResults
            isLoadingSkills={model.isLoadingSkills}
            sorted={model.sorted}
            view={model.view}
            listDoneLoading={!model.isLoadingSkills && !model.canLoadMore && !model.isLoadingMore}
            hasQuery={model.hasQuery}
            canLoadMore={model.canLoadMore}
            isLoadingMore={model.isLoadingMore}
            canAutoLoad={model.canAutoLoad}
            loadMoreRef={model.loadMoreRef}
            loadMore={model.loadMore}
          />
        </div>
      </div>
    </main>
  );
}
