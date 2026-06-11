/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const { convexQueryMock, fetchFeaturedPluginsMock } = vi.hoisted(() => ({
  convexQueryMock: vi.fn(),
  fetchFeaturedPluginsMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component?: unknown }) => ({
    __config: config,
  }),
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to?: string }) => (
    <a className={className} href={to ?? "/"}>
      {children}
    </a>
  ),
  useNavigate: () => navigateMock,
}));

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useQuery: () => undefined,
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    skills: {
      listPublicPageV4: "skills:listPublicPageV4",
    },
  },
}));

vi.mock("../convex/client", () => ({
  convexHttp: {
    query: convexQueryMock,
  },
}));

vi.mock("../lib/featuredCatalog", () => ({
  fetchFeaturedPlugins: fetchFeaturedPluginsMock,
}));

describe("home route", () => {
  beforeEach(() => {
    convexQueryMock.mockResolvedValue({ page: [] });
    fetchFeaturedPluginsMock.mockResolvedValue([]);
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function renderHome() {
    const { Route } = await import("../routes/index");
    const Component = (Route as unknown as { __config: { component: React.ComponentType } })
      .__config.component;

    render(<Component />);
  }

  it("renders the VultureHub intranet hero with site name and search box", async () => {
    await renderHome();

    expect(screen.getByText("VultureHub")).toBeTruthy();
    expect(
      screen.getByText("内网注册中心：搜索并安装 Skill 与 Plugin"),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("搜索 Skill 或 Plugin")).toBeTruthy();
  });

  it("marks the three home category options for one-or-three-column breakpoints", async () => {
    await renderHome();

    const grid = document.querySelector(".home-v2-categories-grid");

    expect(grid?.getAttribute("data-count")).toBe("3");
    expect(grid?.getAttribute("data-layout")).toBe("1-3");
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.getByText("Plugins")).toBeTruthy();
    expect(screen.getByText("发布者")).toBeTruthy();
  });

  it("submits the hero search form by navigating to /search with the trimmed query", async () => {
    await renderHome();

    const input = screen.getByPlaceholderText("搜索 Skill 或 Plugin") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  agent  " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/search",
      search: { q: "agent" },
    });
  });

  it("renders the Latest skills section from listPublicPageV4", async () => {
    const skillEntries = Array.from({ length: 6 }, (_, index) => ({
      skill: {
        _id: `skill-latest-${index}`,
        ownerUserId: `user-latest-${index}`,
        slug: `latest-${index}`,
        displayName: `Latest Skill ${index + 1}`,
        summary: `Latest skill ${index + 1} summary.`,
        stats: { stars: 100 + index, downloads: 12_000 + index * 1000 },
      },
      ownerHandle: `creator${index + 1}`,
    }));

    convexQueryMock.mockResolvedValue({ page: skillEntries });

    await renderHome();

    expect(await screen.findByText("最新 Skill")).toBeTruthy();
    expect(document.querySelectorAll(".home-v2-trending-grid .home-v2-trend-card")).toHaveLength(6);
    expect(document.querySelector(".home-v2-trend-title")?.textContent).toBe("Latest Skill 1");
    expect(document.querySelector(".home-v2-trend-creator")?.textContent).toBe("作者 creator1");

    const listArgs = getListPublicPageArgs();
    expect(listArgs).toEqual(
      expect.objectContaining({
        numItems: 6,
        dir: "desc",
      }),
    );
    expect(listArgs).not.toHaveProperty("sort");
  });

  it("renders the Latest plugins section from fetchFeaturedPlugins", async () => {
    fetchFeaturedPluginsMock.mockResolvedValue([
      {
        name: "vulture-demo-plugin",
        displayName: "Demo Plugin",
        ownerHandle: "openclaw",
        summary: "Demo gateway plugin.",
        latestVersion: "1.0.1",
        isOfficial: true,
      },
    ]);

    await renderHome();

    expect(await screen.findByText("最新 Plugin")).toBeTruthy();
    expect(screen.getByText("Demo Plugin")).toBeTruthy();
    expect(screen.getByText("作者 @openclaw")).toBeTruthy();
    expect(screen.getByText("官方")).toBeTruthy();
    expect(screen.getByText("v1.0.1")).toBeTruthy();
  });
});

function getListPublicPageArgs(): Record<string, unknown> {
  const call = convexQueryMock.mock.calls.find((candidate: unknown[]) => {
    return candidate[0] === "skills:listPublicPageV4";
  });
  const args = call?.[1];
  if (!isRecord(args)) {
    throw new Error("Expected listPublicPageV4 args to be an object");
  }
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
