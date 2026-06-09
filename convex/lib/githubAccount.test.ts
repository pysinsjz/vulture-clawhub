/* @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { requireGitHubAccountAge, syncGitHubProfile } from "./githubAccount";

vi.mock("../_generated/api", () => ({
  internal: {
    githubIdentity: {
      getGitHubProviderAccountIdInternal: Symbol("getGitHubProviderAccountIdInternal"),
    },
    users: {
      getByIdInternal: Symbol("getByIdInternal"),
      setGitHubCreatedAtInternal: Symbol("setGitHubCreatedAtInternal"),
      syncGitHubProfileInternal: Symbol("syncGitHubProfileInternal"),
    },
  },
}));

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Vulture: the GitHub account-age publish/comment gate is removed (identity is
// delegated to the external gateway). requireGitHubAccountAge now only performs a
// lightweight user-exists/active sanity check with no GitHub API lookup and no
// age requirement. See docs/vulture-trim/TRIM-SPEC.md.
describe("requireGitHubAccountAge (gate removed)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("passes for an active user without any GitHub API lookup", async () => {
    const runQuery = vi.fn().mockResolvedValue({ _id: "users:1" });
    const runMutation = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await requireGitHubAccountAge({ runQuery, runMutation } as never, "users:1" as never);

    expect(runQuery).toHaveBeenCalledWith(internal.users.getByIdInternal, { userId: "users:1" });
    expect(runQuery).not.toHaveBeenCalledWith(
      internal.githubIdentity.getGitHubProviderAccountIdInternal,
      { userId: "users:1" },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("no longer gates very new accounts", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      _id: "users:1",
      githubCreatedAt: Date.now(),
    });
    const runMutation = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requireGitHubAccountAge({ runQuery, runMutation } as never, "users:1" as never),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing users", async () => {
    const runQuery = vi.fn().mockResolvedValue(null);
    const runMutation = vi.fn();

    await expect(
      requireGitHubAccountAge({ runQuery, runMutation } as never, "users:missing" as never),
    ).rejects.toThrow(/User not found/i);
  });

  it("rejects deactivated users", async () => {
    const runQuery = vi.fn().mockResolvedValue({ _id: "users:1", deactivatedAt: Date.now() });
    const runMutation = vi.fn();

    await expect(
      requireGitHubAccountAge({ runQuery, runMutation } as never, "users:1" as never),
    ).rejects.toThrow(/User not found/i);
  });
});

describe("syncGitHubProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips recent syncs (throttle)", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-02T12:00:00Z");
    vi.setSystemTime(now);

    const runQuery = vi.fn().mockResolvedValueOnce({
      _id: "users:1",
      name: "oldname",
      githubProfileSyncedAt: now.getTime(),
    });
    const runMutation = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await syncGitHubProfile({ runQuery, runMutation } as never, "users:1" as never);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("updates profile even when only avatar changes", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-02T12:00:00Z");
    vi.setSystemTime(now);

    const runQuery = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "users:1",
        name: "same",
        image: "https://avatars.githubusercontent.com/u/1?v=3",
        githubProfileSyncedAt: now.getTime() - 10 * ONE_DAY_MS,
      })
      .mockResolvedValueOnce("12345");
    const runMutation = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        login: "same",
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncGitHubProfile({ runQuery, runMutation } as never, "users:1" as never);

    expect(runMutation).toHaveBeenCalledWith(internal.users.syncGitHubProfileInternal, {
      userId: "users:1",
      name: "same",
      image: "https://avatars.githubusercontent.com/u/1?v=4",
      syncedAt: now.getTime(),
    });
  });

  it("updates name and records sync timestamp", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-02T12:00:00Z");
    vi.setSystemTime(now);

    const runQuery = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "users:1",
        name: "old",
        githubProfileSyncedAt: now.getTime() - 10 * ONE_DAY_MS,
      })
      .mockResolvedValueOnce("12345");
    const runMutation = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        login: "new",
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=1",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncGitHubProfile({ runQuery, runMutation } as never, "users:1" as never);

    expect(runMutation).toHaveBeenCalledWith(internal.users.syncGitHubProfileInternal, {
      userId: "users:1",
      name: "new",
      image: "https://avatars.githubusercontent.com/u/1?v=1",
      syncedAt: now.getTime(),
    });
  });

  it("forwards GitHub profile name (full name) when present", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-02T12:00:00Z");
    vi.setSystemTime(now);

    const runQuery = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "users:1",
        name: "same",
        githubProfileSyncedAt: now.getTime() - 10 * ONE_DAY_MS,
      })
      .mockResolvedValueOnce("12345");
    const runMutation = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        login: "same",
        name: "Real Name",
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=1",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncGitHubProfile({ runQuery, runMutation } as never, "users:1" as never);

    expect(runMutation).toHaveBeenCalledWith(internal.users.syncGitHubProfileInternal, {
      userId: "users:1",
      name: "same",
      image: "https://avatars.githubusercontent.com/u/1?v=1",
      profileName: "Real Name",
      syncedAt: now.getTime(),
    });
  });
});
