/* @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Management } from "./management";

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const navigateMock = vi.fn();
let searchState: Record<string, string | undefined> = {};
let authUser: { _id: string; handle: string; role: "admin" | "moderator" | "user" } = {
  _id: "users:admin",
  handle: "admin",
  role: "admin",
};

function makeManagementUser(
  id: string,
  handle: string,
  role: "admin" | "moderator" | "user" = "user",
) {
  return {
    _id: id,
    _creationTime: 1,
    handle,
    name: handle,
    displayName: handle,
    role,
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeSelectedSkill(owner = makeManagementUser("users:owner", "owner")) {
  return {
    skill: {
      _id: "skills:owned",
      _creationTime: 1,
      slug: "owned-skill",
      displayName: "Owned Skill",
      ownerUserId: owner._id,
      updatedAt: 1716000000000,
      badges: {},
      moderationFlags: [],
    },
    latestVersion: null,
    owner: {
      _id: `publishers:${owner.handle}`,
      _creationTime: 1,
      kind: "user",
      handle: owner.handle,
      displayName: owner.displayName,
      linkedUserId: owner._id,
    },
    overrideReviewer: null,
    auditLogs: [],
    canonical: null,
  };
}

function linkHref(to: string, search: unknown) {
  if (!search || typeof search !== "object") return to;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string" && value.trim()) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${to}?${query}` : to;
}

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: object) => ({
    ...config,
    useSearch: () => searchState,
  }),
  Link: ({
    children,
    search,
    to,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
    search?: unknown;
  }) => <a href={linkHref(to, search)}>{children}</a>,
  useNavigate: () => navigateMock,
}));

vi.mock("../lib/useAuthStatus", () => ({
  useAuthStatus: () => ({
    me: authUser,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

describe("Management", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    navigateMock.mockReset();
    searchState = {};
    authUser = {
      _id: "users:admin",
      handle: "admin",
      role: "admin",
    };
    useMutationMock.mockReturnValue(vi.fn());
    useQueryMock.mockImplementation((query, args) => {
      if (args === "skip") return undefined;
      const name = getFunctionName(query);
      if (name === "skills:listRecentVersions") return [];
      if (name === "skills:listDuplicateCandidates") return [];
      if (name === "users:list") return { items: [], total: 0 };
      return undefined;
    });
  });

  it("renders the management sidebar for staff", () => {
    render(<Management />);

    expect(screen.getByRole("navigation", { name: "管理分区" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "用户" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /用户 0/ })).toBeNull();
  });

  it("shows users as a separate management view", () => {
    searchState = { view: "users" };

    render(<Management />);

    expect(screen.getByRole("heading", { name: "用户" })).toBeTruthy();
  });

  it("shows users while unrelated management queues are still loading", () => {
    searchState = { view: "users" };
    useQueryMock.mockImplementation((query, args) => {
      if (args === "skip") return undefined;
      const name = getFunctionName(query);
      if (name === "users:list") return { items: [], total: 0 };
      return undefined;
    });

    render(<Management />);

    expect(screen.getByRole("heading", { name: "用户" })).toBeTruthy();
    expect(screen.queryByText("Loading management console…")).toBeNull();
  });

  it("routes sidebar links to separate management views", () => {
    render(<Management />);

    expect(screen.getByRole("link", { name: "疑似重复" }).getAttribute("href")).toBe(
      "/management?view=duplicates",
    );
    expect(screen.getByRole("link", { name: "最近推送" }).getAttribute("href")).toBe(
      "/management?view=recent",
    );
    expect(screen.getByRole("link", { name: "用户" }).getAttribute("href")).toBe(
      "/management?view=users",
    );
  });

  it("does not expose the users sidebar link to moderators", () => {
    authUser = {
      _id: "users:moderator",
      handle: "moderator",
      role: "moderator",
    };

    render(<Management />);

    expect(screen.queryByRole("link", { name: /用户/ })).toBeNull();
  });

  it("shows recent pushes as a separate management view", () => {
    searchState = { view: "recent" };

    render(<Management />);

    expect(screen.getByRole("heading", { name: "最近推送" })).toBeTruthy();
  });

  it("shows duplicate candidates as a separate management view", () => {
    searchState = { view: "duplicates" };

    render(<Management />);

    expect(screen.getByRole("heading", { name: "疑似重复" })).toBeTruthy();
  });

  it("keeps owner search available in the skill tools view", async () => {
    searchState = { view: "skills", skill: "owned-skill" };
    const currentOwner = makeManagementUser("users:owner", "owner");
    const futureOwner = makeManagementUser("users:future", "future-owner");

    useQueryMock.mockImplementation((query, args) => {
      if (args === "skip") return undefined;
      const name = getFunctionName(query);
      if (name === "skills:getBySlugForStaff") return makeSelectedSkill(currentOwner);
      if (name === "skills:listRecentVersions") return [];
      if (name === "skills:listDuplicateCandidates") return [];
      if (name === "users:list") {
        return args &&
          typeof args === "object" &&
          "search" in args &&
          args.search === "future-owner"
          ? { items: [futureOwner], total: 1 }
          : { items: [currentOwner], total: 201 };
      }
      return undefined;
    });

    render(<Management />);

    expect(screen.getByRole("heading", { name: "Skill 工具" })).toBeTruthy();
    expect(screen.getByText("显示 1，共 201")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("按 handle 搜索用户"), {
      target: { value: "future-owner" },
    });

    await waitFor(() => {
      expect(screen.getByText("显示 2，共 2")).toBeTruthy();
      expect(
        useQueryMock.mock.calls.some(([query, args]) => {
          return (
            getFunctionName(query) === "users:list" &&
            args &&
            typeof args === "object" &&
            "search" in args &&
            args.search === "future-owner"
          );
        }),
      ).toBe(true);
    });
  });
});
