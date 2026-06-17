# ClawHub — Project Rules

## Convex Performance Rules

- For public listing/browse pages, use `ConvexHttpClient.query()` (one-shot fetch),
  not `useQuery`/`usePaginatedQuery` (reactive subscription). Reserve reactive
  queries for data the user needs to see update in real time.
- Denormalize hot read paths into a single lightweight "digest" table. Every
  `ctx.db.get()` join adds a table to the reactive invalidation scope.
- When a `skillSearchDigest` row is available, use `digestToOwnerInfo(digest)`
  to resolve owner data. NEVER call `ctx.db.get(ownerUserId)` when digest
  owner fields (`ownerHandle`, `ownerName`, `ownerDisplayName`, `ownerImage`)
  are already present. Reading from `users` adds the entire table to the
  reactive read set and wastes bandwidth.
- Use `convex-helpers` Triggers to sync denormalized tables automatically.
  Always add change detection — skip the write if no fields actually changed.
- Use compound indexes instead of JS filtering. If you're filtering docs after
  the query, you're scanning documents you'll throw away.
- For search results scored by computed values (vector + lexical + popularity),
  fetch all results once and paginate client-side. Don't re-run the full search
  pipeline on "load more."
- Backfills on reactively-subscribed tables need `delayMs` between batches.
- Mutations that read >8 MB should use the Action → Query → Mutation pattern
  to split reads across transactions.

## Convex Conventions

- All mutations import from `convex/functions.ts` (not `convex/_generated/server`)
  to get trigger wrapping. Type imports still come from `convex/_generated/server`.
- NEVER use `--typecheck=disable` on `npx convex deploy`.
- Use `npx convex dev --once` to push functions once (not long-running watcher).

## Production Release

- Production deploys are manual-only. Merging to `main` does **not** deploy.
- Start the GitHub Actions `Deploy` workflow from `main` with `gh workflow run deploy.yml --repo openclaw/clawhub --ref main`.
- The workflow supports `full`, `backend`, and `frontend` targets.
- `frontend` currently waits for the Vercel production deploy on the selected `main` SHA and then runs smoke checks. It does not trigger Vercel directly yet.
- The workflow uses the `Production` environment for deploy secrets, but it does not wait for a separate approval.
- Required prod secret: `CONVEX_DEPLOY_KEY` on the `Production` environment. Optional smoke secret: `PLAYWRIGHT_AUTH_STORAGE_STATE_JSON`.
- CLI npm releases are manual-only and tag-based through `ClawHub CLI NPM Release`. Stable tags only: `vX.Y.Z`. Run a `preflight_only=true` pass first, then rerun with the same tag plus `preflight_run_id` for the real publish.
- Real CLI publishes wait at `npm-release` and rely on npm trusted publishing for `openclaw/clawhub` + `clawhub-cli-npm-release.yml` + `npm-release`.

## Testing

- Tests use `._handler` to call mutation handlers directly with mock `db` objects.
- Mock `db` objects MUST include `normalizeId: vi.fn()` for trigger wrapper compatibility.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **vulture-clawhub** (20985 symbols, 34580 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/vulture-clawhub/context` | Codebase overview, check index freshness |
| `gitnexus://repo/vulture-clawhub/clusters` | All functional areas |
| `gitnexus://repo/vulture-clawhub/processes` | All execution flows |
| `gitnexus://repo/vulture-clawhub/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
