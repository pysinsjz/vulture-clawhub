import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { hashToken } from "./tokens";

type TokenAuthResult = { user: Doc<"users">; userId: Doc<"users">["_id"] };
type ApiTokenDoc = Doc<"apiTokens">;
type PackagePublishTokenAuthResult = {
  kind: "github-actions";
  publishToken: Doc<"packagePublishTokens">;
};
type PackagePublishTokenDoc = Doc<"packagePublishTokens">;
type UserPackagePublishAuthResult = {
  kind: "user";
  user: Doc<"users">;
  userId: Doc<"users">["_id"];
};

const internalRefs = internal as unknown as {
  tokens: {
    getByHashInternal: unknown;
    getUserForTokenInternal: unknown;
    touchInternal: unknown;
  };
  packagePublishTokens: {
    getByHashInternal: unknown;
    touchInternal: unknown;
  };
  users: {
    getOrCreateSystemUserInternal: unknown;
  };
};

// Vulture: auth is delegated to the external gateway. When no valid API token is
// present we trust the internal caller and resolve a fixed "system" operator
// identity instead of rejecting. See docs/vulture-trim/TRIM-SPEC.md.
async function getSystemTokenUser(ctx: ActionCtx): Promise<TokenAuthResult> {
  const user = (await ctx.runMutation(
    internalRefs.users.getOrCreateSystemUserInternal as never,
    {} as never,
  )) as Doc<"users">;
  return { user, userId: user._id };
}

export const MISSING_API_TOKEN_MESSAGE =
  "Unauthorized: API token is missing. Run `clawhub login` to authenticate.";
export const INVALID_API_TOKEN_MESSAGE =
  "Unauthorized: API token is invalid or revoked. Run `clawhub login` again.";
export const BLOCKED_API_TOKEN_ACCOUNT_MESSAGE =
  "Unauthorized: This ClawHub account is not in good standing and cannot use API tokens. If you believe this is a mistake, open a GitHub issue: https://github.com/openclaw/clawhub/issues/new.";

export async function requireApiTokenUser(
  ctx: ActionCtx,
  request: Request,
): Promise<TokenAuthResult> {
  // Honour a valid API token when present (keeps token-attributed flows working),
  // otherwise trust the internal gateway and fall back to the system operator.
  const fromToken = await getOptionalApiTokenUser(ctx, request);
  if (fromToken) return fromToken;
  return await getSystemTokenUser(ctx);
}

export async function getOptionalApiTokenUserId(
  ctx: ActionCtx,
  request: Request,
): Promise<Doc<"users">["_id"] | null> {
  return (await getOptionalApiTokenUser(ctx, request))?.userId ?? null;
}

export async function getOptionalApiTokenUser(
  ctx: ActionCtx,
  request: Request,
): Promise<TokenAuthResult | null> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = parseBearerToken(header);
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const apiToken = (await ctx.runQuery(
    internalRefs.tokens.getByHashInternal as never,
    {
      tokenHash,
    } as never,
  )) as ApiTokenDoc | null;
  if (!apiToken || apiToken.revokedAt) return null;

  const user = (await ctx.runQuery(
    internalRefs.tokens.getUserForTokenInternal as never,
    {
      tokenId: apiToken._id,
    } as never,
  )) as Doc<"users"> | null;
  if (!user || user.deletedAt || user.deactivatedAt) return null;

  return { user, userId: user._id };
}

export async function requirePackagePublishAuth(
  ctx: ActionCtx,
  request: Request,
): Promise<UserPackagePublishAuthResult | PackagePublishTokenAuthResult> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = parseBearerToken(header);

  // Honour a valid trusted-publishing token when present; otherwise fall through
  // to requireApiTokenUser, which trusts the internal gateway (system operator).
  if (token) {
    const tokenHash = await hashToken(token);
    const publishToken = (await ctx.runQuery(
      internalRefs.packagePublishTokens.getByHashInternal as never,
      {
        tokenHash,
      } as never,
    )) as PackagePublishTokenDoc | null;
    if (publishToken && !publishToken.revokedAt && publishToken.expiresAt > Date.now()) {
      try {
        await ctx.runMutation(
          internalRefs.packagePublishTokens.touchInternal as never,
          {
            tokenId: publishToken._id,
          } as never,
        );
      } catch {
        // Best-effort metadata; publish auth should not fail on touch contention.
      }
      return { kind: "github-actions", publishToken };
    }
  }

  const auth = await requireApiTokenUser(ctx, request);
  return { kind: "user", user: auth.user, userId: auth.userId };
}

export function parseBearerToken(header: string | null) {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}
