// Default category dictionaries seeded into ClawHub on first deploy.
// Source of truth for the order/slug/label choices: docs/prd/marketplace-categories.md.
// Seed mutations only insert these when the target table is empty, so post-seed
// operator edits in the management UI survive subsequent deploys.

export type CategoryFamily = "plugin" | "skill";

export type DefaultCategory = {
  slug: string;
  label: string;
  order: number;
};

export const OTHER_CATEGORY_SLUG = "other";

// Slugs reserved as the operational "other" bucket. Always end up at order >= 9999
// so the dictionary query naturally sorts them last even if an operator
// reorders the rest of the list.
export const OTHER_CATEGORY_ORDER = 9999;

export const DEFAULT_PLUGIN_CATEGORIES: ReadonlyArray<DefaultCategory> = [
  { slug: "ecommerce", label: "电商与市场", order: 10 },
  { slug: "marketing-ads", label: "营销与广告", order: 20 },
  { slug: "social-media", label: "社交媒体", order: 30 },
  { slug: "comms-collab", label: "通讯与协作", order: 40 },
  { slug: "productivity", label: "生产力与知识管理", order: 50 },
  { slug: "business-ops", label: "业务运营", order: 60 },
  { slug: "design", label: "创意与设计", order: 70 },
  { slug: "logistics", label: "物流与履约", order: 80 },
  { slug: "devtools-data", label: "开发者与数据工具", order: 90 },
  { slug: "events-projects", label: "活动与项目", order: 100 },
  { slug: OTHER_CATEGORY_SLUG, label: "其他", order: OTHER_CATEGORY_ORDER },
];

export const DEFAULT_SKILL_CATEGORIES: ReadonlyArray<DefaultCategory> = [
  { slug: "sourcing", label: "货源与选品", order: 10 },
  { slug: "market-research", label: "市场调研与分析", order: 20 },
  { slug: "design-visual", label: "产品设计与视觉", order: 30 },
  { slug: "content-marketing", label: "内容创作与营销", order: 40 },
  { slug: "traffic-ads", label: "流量获取与广告", order: 50 },
  { slug: "shop-ops", label: "店铺运营与基建", order: 60 },
  { slug: "logistics-customs", label: "物流与关税", order: 70 },
  { slug: "data-finance", label: "数据分析与财务", order: 80 },
  { slug: "customer-lifecycle", label: "客户生命周期与留存", order: 90 },
  { slug: "docs-office", label: "文档与办公效率", order: 100 },
  { slug: "agent-infra", label: "Agent 管理与基建", order: 110 },
  { slug: OTHER_CATEGORY_SLUG, label: "其他", order: OTHER_CATEGORY_ORDER },
];

// kebab-case: lower-case ASCII letters, digits, dashes; no leading/trailing dash;
// no double dash. Matches the format used for the default dictionary above.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidCategorySlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
