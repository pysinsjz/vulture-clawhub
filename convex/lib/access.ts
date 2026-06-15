import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

export type Role = "admin" | "moderator" | "user" | "mirror";

const DEV_IMPERSONATE_LOCAL_HANDLE = "local";

function readEnv(name: string) {
  const value = readKnownEnv(name)?.trim();
  return value ? value : undefined;
}

function readKnownEnv(name: string) {
  if (name === "CLAW_HUB_DEV_IMPERSONATE_USER_HANDLE") {
    return process.env.CLAW_HUB_DEV_IMPERSONATE_USER_HANDLE;
  }
  if (name === "CLAW_HUB_ENABLE_DEV_IMPERSONATION") {
    return process.env.CLAW_HUB_ENABLE_DEV_IMPERSONATION;
  }
  if (name === "CONVEX_DEPLOYMENT") {
    return process.env.CONVEX_DEPLOYMENT;
  }
  return undefined;
}

function isDevImpersonationAllowed() {
  const requestedHandle = readEnv("CLAW_HUB_DEV_IMPERSONATE_USER_HANDLE");
  if (requestedHandle !== DEV_IMPERSONATE_LOCAL_HANDLE) return false;

  const deployment = readEnv("CONVEX_DEPLOYMENT") ?? "";
  if (deployment.startsWith("prod:") || deployment.includes("production")) return false;
  return (
    deployment.startsWith("anonymous:") ||
    deployment.startsWith("dev:") ||
    deployment.startsWith("local:") ||
    readEnv("CLAW_HUB_ENABLE_DEV_IMPERSONATION") === "1"
  );
}

async function getDevImpersonatedUserId(
  ctx: Pick<MutationCtx | QueryCtx, "db">,
): Promise<Id<"users"> | undefined> {
  if (!isDevImpersonationAllowed()) return undefined;
  const user = await ctx.db
    .query("users")
    .withIndex("handle", (q) => q.eq("handle", DEV_IMPERSONATE_LOCAL_HANDLE))
    .unique();
  if (!user || user.deletedAt || user.deactivatedAt) return undefined;
  return user._id;
}

async function getDevImpersonatedUserIdFromAction(
  ctx: ActionCtx,
): Promise<Id<"users"> | undefined> {
  if (!isDevImpersonationAllowed()) return undefined;
  const user = await ctx.runQuery(internal.users.getByHandleInternal, {
    handle: DEV_IMPERSONATE_LOCAL_HANDLE,
  });
  if (!user || user.deletedAt || user.deactivatedAt) return undefined;
  return user._id;
}

// Internal-registry default identity. When `VULTURE_DEFAULT_SYSTEM_USER=1`,
// requests that resolve to no authenticated user fall back to the fixed
// "system" admin account — mirroring the HTTP API's tokenless system fallback
// so the reactive web UI is usable on a trusted internal network without a
// login flow. The fallback only reads an existing system user; bootstrap is
// handled by users.ensureSystemUser. See docs/vulture-trim/TRIM-SPEC.md.
const SYSTEM_USER_HANDLE = "system";

function isDefaultSystemUserEnabled() {
  return process.env.VULTURE_DEFAULT_SYSTEM_USER === "1";
}

async function getDefaultSystemUser(
  ctx: Pick<MutationCtx | QueryCtx, "db">,
): Promise<Doc<"users"> | undefined> {
  if (!isDefaultSystemUserEnabled()) return undefined;
  const user = await ctx.db
    .query("users")
    .withIndex("handle", (q) => q.eq("handle", SYSTEM_USER_HANDLE))
    .unique();
  if (!user || user.deletedAt || user.deactivatedAt) return undefined;
  return user;
}

async function getDefaultSystemUserFromAction(ctx: ActionCtx): Promise<Doc<"users"> | undefined> {
  if (!isDefaultSystemUserEnabled()) return undefined;
  const user = await ctx.runQuery(internal.users.getByHandleInternal, {
    handle: SYSTEM_USER_HANDLE,
  });
  if (!user || user.deletedAt || user.deactivatedAt) return undefined;
  return user as Doc<"users">;
}

export async function getOptionalActiveAuthUserId(
  ctx: MutationCtx | QueryCtx,
): Promise<Id<"users"> | undefined> {
  const devUserId = await getDevImpersonatedUserId(ctx);
  if (devUserId) return devUserId;
  try {
    const userId = await getAuthUserId(ctx);
    if (userId) {
      const user = await ctx.db.get(userId);
      if (user && !user.deletedAt && !user.deactivatedAt) return userId;
    }
  } catch {
    // Fall through to the internal-registry system fallback below.
  }
  return (await getDefaultSystemUser(ctx))?._id;
}

export async function getOptionalActiveAuthUserIdFromAction(
  ctx: ActionCtx,
): Promise<Id<"users"> | undefined> {
  const devUserId = await getDevImpersonatedUserIdFromAction(ctx);
  if (devUserId) return devUserId;
  try {
    const userId = await getAuthUserId(ctx);
    if (userId) {
      const user = await ctx.runQuery(internal.users.getByIdInternal, { userId });
      if (user && !user.deletedAt && !user.deactivatedAt) return userId;
    }
  } catch {
    // Fall through to the internal-registry system fallback below.
  }
  return (await getDefaultSystemUserFromAction(ctx))?._id;
}

export async function requireUser(ctx: MutationCtx | QueryCtx) {
  const devUserId = await getDevImpersonatedUserId(ctx);
  if (devUserId) {
    const devUser = await ctx.db.get(devUserId);
    if (!devUser || devUser.deletedAt || devUser.deactivatedAt) throw new Error("User not found");
    return { userId: devUserId, user: devUser };
  }

  let userId: Id<"users"> | null | undefined = null;
  try {
    userId = await getAuthUserId(ctx);
  } catch {
    userId = null;
  }
  if (!userId) {
    const systemUser = await getDefaultSystemUser(ctx);
    if (systemUser) return { userId: systemUser._id, user: systemUser };
    throw new Error("Unauthorized");
  }
  let user: Doc<"users"> | null;
  try {
    user = await ctx.db.get(userId);
  } catch {
    throw new Error("User not found");
  }
  if (!user || user.deletedAt || user.deactivatedAt) throw new Error("User not found");
  return { userId, user };
}

export async function requireUserFromAction(
  ctx: ActionCtx,
): Promise<{ userId: Id<"users">; user: Doc<"users"> }> {
  const devUserId = await getDevImpersonatedUserIdFromAction(ctx);
  if (devUserId) {
    const devUser = await ctx.runQuery(internal.users.getByIdInternal, { userId: devUserId });
    if (!devUser || devUser.deletedAt || devUser.deactivatedAt) throw new Error("User not found");
    return { userId: devUserId, user: devUser as Doc<"users"> };
  }

  let userId: Id<"users"> | null | undefined = null;
  try {
    userId = await getAuthUserId(ctx);
  } catch {
    userId = null;
  }
  if (!userId) {
    const systemUser = await getDefaultSystemUserFromAction(ctx);
    if (systemUser) return { userId: systemUser._id, user: systemUser };
    throw new Error("Unauthorized");
  }
  let user: Doc<"users"> | null;
  try {
    user = await ctx.runQuery(internal.users.getByIdInternal, { userId });
  } catch {
    throw new Error("User not found");
  }
  if (!user || user.deletedAt || user.deactivatedAt) throw new Error("User not found");
  return { userId, user: user as Doc<"users"> };
}

export function assertRole(user: Doc<"users">, allowed: Role[]) {
  if (!user.role || !allowed.includes(user.role as Role)) {
    throw new Error("Forbidden");
  }
}

export function assertAdmin(user: Doc<"users">) {
  assertRole(user, ["admin"]);
}

export function assertModerator(user: Doc<"users">) {
  assertRole(user, ["admin", "moderator"]);
}
