import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { buildGitHubApiHeaders } from "./githubAuth";
import { GITHUB_PROFILE_SYNC_WINDOW_MS } from "./githubProfileSync";

const GITHUB_API = "https://api.github.com";

type GitHubAccountGateCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

type GitHubUser = {
  login?: string;
  name?: string;
  avatar_url?: string;
  created_at?: string;
};

function assertGitHubNumericId(providerAccountId: string) {
  if (!/^[0-9]+$/.test(providerAccountId)) {
    throw new ConvexError("GitHub account lookup failed");
  }
}

async function fetchGitHubUserByNumericId(providerAccountId: string) {
  assertGitHubNumericId(providerAccountId);
  const url = `${GITHUB_API}/user/${providerAccountId}`;
  const headers = await buildGitHubApiHeaders({ userAgent: "clawhub" });
  const response = await fetch(url, {
    headers,
  });
  if (response.status !== 401 || !headers.Authorization) return response;

  console.warn("[githubAccount] GitHub API auth was rejected; retrying lookup without auth");
  return await fetch(url, {
    headers: { "User-Agent": "clawhub" },
  });
}

export async function fetchGitHubCreatedAtByProviderAccountId(providerAccountId: string) {
  const response = await fetchGitHubUserByNumericId(providerAccountId);
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new ConvexError("GitHub API rate limit exceeded — please try again in a few minutes");
    }
    throw new ConvexError("GitHub account lookup failed");
  }

  const payload = (await response.json()) as GitHubUser;
  const parsed = payload.created_at ? Date.parse(payload.created_at) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new ConvexError("GitHub account lookup failed");
  return parsed;
}

// Vulture: identity/auth is delegated to the external gateway, so the GitHub
// account-age publish/comment gate is removed. We retain a lightweight
// user-exists/active sanity guard (no GitHub API lookup, no age requirement).
// See docs/vulture-trim/TRIM-SPEC.md.
export async function requireGitHubAccountAge(ctx: GitHubAccountGateCtx, userId: Id<"users">) {
  const user = await ctx.runQuery(internal.users.getByIdInternal, { userId });
  if (!user || user.deletedAt || user.deactivatedAt) throw new ConvexError("User not found");
}

/**
 * Sync the user's GitHub profile (username, avatar) from the GitHub API.
 * This handles the case where a user renames their GitHub account.
 * Uses the immutable GitHub numeric ID to fetch the current profile.
 */
export async function syncGitHubProfile(ctx: ActionCtx, userId: Id<"users">) {
  const user = await ctx.runQuery(internal.users.getByIdInternal, { userId });
  if (!user || user.deletedAt || user.deactivatedAt) return;

  const now = Date.now();
  const lastSyncedAt = user.githubProfileSyncedAt ?? null;
  if (lastSyncedAt && now - lastSyncedAt < GITHUB_PROFILE_SYNC_WINDOW_MS) return;

  const providerAccountId = await ctx.runQuery(
    internal.githubIdentity.getGitHubProviderAccountIdInternal,
    { userId },
  );
  if (!providerAccountId) return;

  assertGitHubNumericId(providerAccountId);

  const response = await fetchGitHubUserByNumericId(providerAccountId);
  if (!response.ok) {
    // Silently fail - this is a best-effort sync, not critical path
    console.warn(`[syncGitHubProfile] GitHub API error for user ${userId}: ${response.status}`);
    return;
  }

  const payload = (await response.json()) as GitHubUser;
  const newLogin = payload.login?.trim();
  const newImage = payload.avatar_url?.trim();

  const profileName = payload.name?.trim();

  if (!newLogin) return;

  const args: {
    userId: Id<"users">;
    name: string;
    image?: string;
    syncedAt: number;
    profileName?: string;
  } = {
    userId,
    name: newLogin,
    image: newImage,
    syncedAt: now,
  };
  if (profileName && profileName !== newLogin) {
    args.profileName = profileName;
  }

  await ctx.runMutation(internal.users.syncGitHubProfileInternal, args);
}
