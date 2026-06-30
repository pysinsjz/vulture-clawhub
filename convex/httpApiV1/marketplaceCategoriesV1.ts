// HTTP wrappers around the marketplace category dictionary queries.
// Issue#2 PR#5 added the underlying Convex queries
// (`listPluginCategoriesDictionary` / `listSkillCategoriesDictionary`) but
// forgot to expose them as REST. Gateway calls ClawHub over plain HTTP per
// `contracts/marketplace.md` ("Convex HTTP Actions 站点口 :3211 + /api/v1"
// prefix), so a query-only export is invisible to Gateway. These wrappers
// close that gap.
//
// Output shape: `{ categories: [{ slug, label, order, icon }] }` — exactly
// the dictionary entries returned by the underlying query (which already
// filters `archived === false` and sorts by `order`). Gateway joins this
// against the package / skill list to compute counts.
//
// Auth: none — ClawHub internal endpoints assume Gateway has already
// authenticated the caller (same contract as `listSkillsV1Handler` /
// `listPluginsV1Handler`). Rate-limited under the standard "read" bucket.
//
// CORS: handled by the parent httpRouter wiring (preflight via
// `httpPreflight.ts`); these handlers just return `json(...)`.

import { api } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { applyRateLimit } from "../lib/httpRateLimit";
import { json } from "./shared";

type CategoryDictionaryEntry = {
  slug: string;
  label: string;
  order: number;
  icon: string | null;
};

export async function listPluginCategoriesV1Handler(ctx: ActionCtx, request: Request) {
  const rate = await applyRateLimit(ctx, request, "read");
  if (!rate.ok) return rate.response;

  const items = (await ctx.runQuery(
    api.marketplaceCategories.listPluginCategoriesDictionary,
    {},
  )) as CategoryDictionaryEntry[];

  return json({ categories: items }, 200, rate.headers);
}

export async function listSkillCategoriesV1Handler(ctx: ActionCtx, request: Request) {
  const rate = await applyRateLimit(ctx, request, "read");
  if (!rate.ok) return rate.response;

  const items = (await ctx.runQuery(
    api.marketplaceCategories.listSkillCategoriesDictionary,
    {},
  )) as CategoryDictionaryEntry[];

  return json({ categories: items }, 200, rate.headers);
}

export type { CategoryDictionaryEntry };
