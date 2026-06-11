/**
 * Shared navigation configuration used by Header and Footer to eliminate
 * triple duplication of nav link definitions.
 */

/** Lucide icon name used as a key to look up the component at render time. */
type NavIconName = "wrench" | "plug";

interface NavItemBase {
  /** Visible link text */
  label: string;
  /** Link only shown when user is authenticated */
  authRequired: boolean;
  /** Link only shown for staff / moderator users */
  staffOnly: boolean;
  /** Additional path prefixes that should also highlight this nav item (e.g. /skill for /skills) */
  activePathPrefixes?: string[];
}

interface RouteNavItem extends NavItemBase {
  /** Route path passed to `<Link to>` */
  to: string;
  href?: never;
  /** Optional search params object passed to `<Link search>` */
  search?: Record<string, unknown>;
  /** Optional lucide icon name shown beside the label in navbar tabs */
  icon?: NavIconName;
}

interface ExternalNavItem extends NavItemBase {
  /** External URL rendered as a normal anchor */
  href: string;
  to?: never;
  search?: never;
  icon?: never;
}

type NavItem = RouteNavItem | ExternalNavItem;

// ---------------------------------------------------------------------------
// Search-param shapes (kept here so Header, Footer, and mobile menu all agree)
// ---------------------------------------------------------------------------

const SKILLS_SEARCH = {
  q: undefined,
  sort: undefined,
  dir: undefined,
  highlighted: undefined,
  view: undefined,
  focus: undefined,
} as const;

const PUBLISHERS_SEARCH = { q: undefined } as const;

const PUBLISH_SKILL_SEARCH = { updateSlug: undefined } as const;

const PUBLISH_PLUGIN_SEARCH = {
  ownerHandle: undefined,
  name: undefined,
  displayName: undefined,
  family: undefined,
  nextVersion: undefined,
  sourceRepo: undefined,
} as const;

// ---------------------------------------------------------------------------
// Primary nav items: Skills | Plugins
// ---------------------------------------------------------------------------

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    label: "Skills",
    to: "/skills",
    search: SKILLS_SEARCH,
    icon: "wrench",
    authRequired: false,
    staffOnly: false,
    activePathPrefixes: ["/skill/"],
  },
  {
    label: "Plugins",
    to: "/plugins",
    icon: "plug",
    authRequired: false,
    staffOnly: false,
    activePathPrefixes: ["/plugin/"],
  },
];

// ---------------------------------------------------------------------------
// Secondary nav items
// ---------------------------------------------------------------------------

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    label: "发布者",
    to: "/publishers",
    search: PUBLISHERS_SEARCH,
    authRequired: false,
    staffOnly: false,
  },
  {
    label: "发布 Skill",
    to: "/skills/publish",
    search: PUBLISH_SKILL_SEARCH,
    authRequired: true,
    staffOnly: false,
  },
  {
    label: "发布 Plugin",
    to: "/plugins/publish",
    search: PUBLISH_PLUGIN_SEARCH,
    authRequired: true,
    staffOnly: false,
  },
];

// ---------------------------------------------------------------------------
// Footer sections
// ---------------------------------------------------------------------------

interface FooterNavSection {
  /** Stable English slug used for DOM ids; decoupled from the translated title. */
  slug: string;
  title: string;
  items: FooterNavItem[];
}

type FooterNavItem =
  | {
      kind: "link";
      label: string;
      to: string;
      search?: Record<string, unknown>;
    }
  | { kind: "external"; label: string; href: string }
  | { kind: "text"; label: string };

export const FOOTER_NAV_SECTIONS: FooterNavSection[] = [
  {
    slug: "browse",
    title: "浏览",
    items: [
      { kind: "link", label: "Skills", to: "/skills", search: SKILLS_SEARCH },
      { kind: "link", label: "Plugins", to: "/plugins" },
      { kind: "link", label: "审计", to: "/audits", search: { type: undefined } },
      { kind: "link", label: "API 文档", to: "/api-docs" },
    ],
  },
  {
    slug: "publish",
    title: "发布",
    items: [
      {
        kind: "link",
        label: "发布 Skill",
        to: "/skills/publish",
        search: PUBLISH_SKILL_SEARCH,
      },
      {
        kind: "link",
        label: "发布 Plugin",
        to: "/plugins/publish",
        search: PUBLISH_PLUGIN_SEARCH,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Filter a nav item array based on current auth/staff context. */
export function filterNavItems(
  items: NavItem[],
  ctx: { isAuthenticated: boolean; isStaff: boolean },
): NavItem[] {
  return items.filter((item) => {
    if (item.authRequired && !ctx.isAuthenticated) return false;
    if (item.staffOnly && !ctx.isStaff) return false;
    return true;
  });
}
