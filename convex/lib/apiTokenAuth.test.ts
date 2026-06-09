import { describe, expect, it, vi } from "vitest";
import { getOptionalApiTokenUserId, requireApiTokenUser } from "./apiTokenAuth";
import { hashToken } from "./tokens";

describe("getOptionalApiTokenUserId", () => {
  it("returns null when auth header is missing", async () => {
    const ctx = {
      runQuery: vi.fn(),
    };
    const request = new Request("https://example.com");

    const userId = await getOptionalApiTokenUserId(ctx as never, request);

    expect(userId).toBeNull();
    expect(ctx.runQuery).not.toHaveBeenCalled();
  });

  it("returns null for unknown token", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue(null),
    };
    const request = new Request("https://example.com", {
      headers: { authorization: "Bearer token-1" },
    });

    const userId = await getOptionalApiTokenUserId(ctx as never, request);

    expect(userId).toBeNull();
    expect(ctx.runQuery).toHaveBeenCalledTimes(1);
    expect(ctx.runQuery.mock.calls[0]?.[1]).toEqual({
      tokenHash: await hashToken("token-1"),
    });
  });

  it("returns user id when token and user are valid", async () => {
    const tokenId = "apiTokens_1";
    const expectedUserId = "users_1";
    const ctx = {
      runQuery: vi
        .fn()
        .mockImplementation(async (_fn, args: { tokenHash?: string; tokenId?: string }) => {
          if (args.tokenHash) {
            return { _id: tokenId, revokedAt: undefined };
          }
          if (args.tokenId) {
            return { _id: expectedUserId, deletedAt: undefined };
          }
          return null;
        }),
    };
    const request = new Request("https://example.com", {
      headers: { authorization: "Bearer token-2" },
    });

    const userId = await getOptionalApiTokenUserId(ctx as never, request);

    expect(userId).toBe(expectedUserId);
    expect(ctx.runQuery).toHaveBeenCalledTimes(2);
  });

  it("returns null when user is deleted", async () => {
    const tokenId = "apiTokens_2";
    const ctx = {
      runQuery: vi
        .fn()
        .mockImplementation(async (_fn, args: { tokenHash?: string; tokenId?: string }) => {
          if (args.tokenHash) {
            return { _id: tokenId, revokedAt: undefined };
          }
          if (args.tokenId) {
            return { _id: "users_deleted", deletedAt: Date.now() };
          }
          return null;
        }),
    };
    const request = new Request("https://example.com", {
      headers: { authorization: "Bearer token-3" },
    });

    const userId = await getOptionalApiTokenUserId(ctx as never, request);

    expect(userId).toBeNull();
    expect(ctx.runQuery).toHaveBeenCalledTimes(2);
  });

  it("returns null when user is deactivated", async () => {
    const tokenId = "apiTokens_3";
    const ctx = {
      runQuery: vi
        .fn()
        .mockImplementation(async (_fn, args: { tokenHash?: string; tokenId?: string }) => {
          if (args.tokenHash) {
            return { _id: tokenId, revokedAt: undefined };
          }
          if (args.tokenId) {
            return { _id: "users_deactivated", deactivatedAt: Date.now() };
          }
          return null;
        }),
    };
    const request = new Request("https://example.com", {
      headers: { authorization: "Bearer token-4" },
    });

    const userId = await getOptionalApiTokenUserId(ctx as never, request);

    expect(userId).toBeNull();
    expect(ctx.runQuery).toHaveBeenCalledTimes(2);
  });
});

// Vulture: auth is delegated to the external gateway. requireApiTokenUser honours
// a valid token when present, otherwise trusts the internal caller and resolves
// the fixed "system" operator via internal.users.getOrCreateSystemUserInternal.
describe("requireApiTokenUser (internal-trust)", () => {
  it("falls back to the system operator when no token is present", async () => {
    const systemUser = { _id: "users_system", handle: "system", role: "admin" };
    const ctx = { runQuery: vi.fn(), runMutation: vi.fn().mockResolvedValue(systemUser) };

    const result = await requireApiTokenUser(ctx as never, new Request("https://example.com"));

    expect(result).toEqual({ user: systemUser, userId: "users_system" });
    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
  });

  it("falls back to the system operator for unknown or revoked tokens", async () => {
    const systemUser = { _id: "users_system", handle: "system" };
    const ctx = {
      runQuery: vi.fn().mockResolvedValue(null),
      runMutation: vi.fn().mockResolvedValue(systemUser),
    };

    const result = await requireApiTokenUser(
      ctx as never,
      new Request("https://example.com", { headers: { authorization: "Bearer token-5" } }),
    );

    expect(result.userId).toBe("users_system");
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
  });

  it("honours a valid API token when present", async () => {
    const ctx = {
      runQuery: vi
        .fn()
        .mockImplementation(async (_fn, args: { tokenHash?: string; tokenId?: string }) => {
          if (args.tokenHash) return { _id: "apiTokens_x", revokedAt: undefined };
          if (args.tokenId) return { _id: "users_real", deletedAt: undefined };
          return null;
        }),
      runMutation: vi.fn(),
    };

    const result = await requireApiTokenUser(
      ctx as never,
      new Request("https://example.com", { headers: { authorization: "Bearer token-good" } }),
    );

    expect(result.userId).toBe("users_real");
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });
});
