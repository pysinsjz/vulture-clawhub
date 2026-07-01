import { PLUGIN_CATEGORY_DEFINITIONS } from "clawhub-schema";

export type BrowseCategory = {
  slug: string;
  label: string;
  icon: string;
};

/** Minimal shape needed to render a category chip/link (dictionary entry or browse category). */
export type CategoryRef = {
  slug: string;
  label: string;
};

// Plugin browse categories are still the legacy keyword-derived taxonomy
// (PLUGIN_CATEGORY_DEFINITIONS) — the operator dictionary (issue #44) is only
// wired into the skill browse page so far. Migrating plugins requires the
// shared /api/v1/plugins HTTP contract (also used by the CLI/Gateway) to grow
// a new, additive filter param; tracked separately.
export const PLUGIN_CATEGORIES: BrowseCategory[] = PLUGIN_CATEGORY_DEFINITIONS.map(
  ({ slug, label, icon }) => ({
    slug,
    label,
    icon,
  }),
);

export function buildSkillCategoryBrowseHref(category: CategoryRef) {
  const params = new URLSearchParams({ category: category.slug });
  return `/skills?${params.toString()}`;
}
