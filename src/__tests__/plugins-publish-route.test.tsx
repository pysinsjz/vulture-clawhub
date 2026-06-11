/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocsLinks } from "clawhub-schema";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: unknown }) => ({
    __config: config,
    __path: path,
  }),
  useSearch: () => ({
    ownerHandle: undefined,
    name: undefined,
    displayName: undefined,
    family: undefined,
    nextVersion: undefined,
    sourceRepo: undefined,
  }),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

const generateUploadUrl = vi.fn();
const publishRelease = vi.fn();
const fetchMock = vi.fn();
const useAuthStatusMock = vi.fn();
const useQueryMock = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("convex/react", () => ({
  ConvexReactClient: class {},
  useMutation: () => generateUploadUrl,
  useAction: () => publishRelease,
  useQuery: () => useQueryMock(),
}));

vi.mock("../lib/useAuthStatus", () => ({
  useAuthStatus: () => useAuthStatusMock(),
}));

import { PublishPluginRoute, Route } from "../routes/plugins/publish";

function renderPublishRoute() {
  render(createElement(PublishPluginRoute as never));
}

function withRelativePath(file: File, path: string) {
  Object.defineProperty(file, "webkitRelativePath", {
    value: path,
    configurable: true,
  });
  return file;
}

function makeCodePluginPackageJson(overrides: Record<string, unknown>) {
  return JSON.stringify({
    openclaw: {
      extensions: ["./index.ts"],
      compat: {
        pluginApi: ">=2026.3.24-beta.2",
      },
      build: {
        openclawVersion: "2026.3.24-beta.2",
      },
    },
    ...overrides,
  });
}

function getFileInput() {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("Missing file input");
  return input;
}

function getFileInputs() {
  return Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
}

describe("plugins publish route", () => {
  beforeEach(() => {
    generateUploadUrl.mockReset();
    publishRelease.mockReset();
    fetchMock.mockReset();
    useAuthStatusMock.mockReset();
    useQueryMock.mockReset();
    toastErrorMock.mockReset();

    useAuthStatusMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      me: { _id: "users:1" },
    });
    useQueryMock.mockReturnValue([
      {
        publisher: {
          _id: "publishers:vintageayu",
          handle: "vintageayu",
          displayName: "VintageAyu",
          kind: "user",
          image: "/clawd-logo.png",
        },
        role: "owner",
      },
    ]);
    generateUploadUrl.mockResolvedValue("https://upload.local");
    publishRelease.mockResolvedValue({ ok: true, packageId: "pkg:1", releaseId: "rel:1" });
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        storageId: `storage:${((init?.body as File | undefined)?.name ?? "unknown").replaceAll("/", "_")}`,
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  });

  it("registers the publish form on /plugins/publish", () => {
    expect(Route).toBeTruthy();
  });

  it("links to the plugin publishing guide", () => {
    renderPublishRoute();

    const guideLink = screen.getByRole("link", { name: /Plugin 发布指南/ });
    expect(guideLink.getAttribute("href")).toBe(
      "https://docs.openclaw.ai/clawhub/publishing#plugins",
    );
    expect(guideLink.getAttribute("target")).toBe("_blank");
  });

  it("requires sign-in before showing the plugin publish form", () => {
    useAuthStatusMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      me: null,
    });

    renderPublishRoute();

    expect(screen.getByText("登录后发布 Plugin")).toBeTruthy();
    expect(
      screen.getByText("你需要登录后才能在 ClawHub 上发布 Plugin。"),
    ).toBeTruthy();
    expect(screen.queryByText(/请先上传 Plugin 代码/)).toBeNull();
    expect(screen.queryByPlaceholderText("Plugin 名称")).toBeNull();
  });

  it("keeps metadata inputs locked until plugin code is uploaded", () => {
    renderPublishRoute();

    expect(screen.getByText(/请先上传 Plugin 代码/)).toBeTruthy();
    expect(screen.getByPlaceholderText("Plugin 名称").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByPlaceholderText("显示名称").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByPlaceholderText("版本").getAttribute("disabled")).not.toBeNull();
    expect(screen.queryByPlaceholderText("描述此版本的变更…")).toBeNull();
    expect(screen.getByLabelText("所有者").textContent).toContain("@vintageayu · VintageAyu");
    expect(document.querySelector('img[src="/clawd-logo.png"]')).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "发布 Plugin" }).getAttribute("disabled"),
    ).not.toBeNull();
  });

  it("opens only the directory picker when clicking Choose folder", () => {
    renderPublishRoute();

    const [archiveInput, directoryInput] = getFileInputs();
    const archiveClick = vi.fn();
    const directoryClick = vi.fn();
    archiveInput.click = archiveClick;
    directoryInput.click = directoryClick;

    fireEvent.click(screen.getByRole("button", { name: "选择文件夹" }));

    expect(directoryClick).toHaveBeenCalledTimes(1);
    expect(archiveClick).not.toHaveBeenCalled();
  });

  it("opens only the archive picker when clicking Choose archive", () => {
    renderPublishRoute();

    const [archiveInput, directoryInput] = getFileInputs();
    const archiveClick = vi.fn();
    const directoryClick = vi.fn();
    archiveInput.click = archiveClick;
    directoryInput.click = directoryClick;

    fireEvent.click(screen.getByRole("button", { name: "选择压缩包" }));

    expect(archiveClick).toHaveBeenCalledTimes(1);
    expect(directoryClick).not.toHaveBeenCalled();
  });

  it("publishes a code plugin folder with normalized file paths", async () => {
    renderPublishRoute();

    const packageJson = withRelativePath(
      new File(
        [
          makeCodePluginPackageJson({
            name: "demo-plugin",
            displayName: "Demo Plugin",
            version: "1.2.3",
            repository: "https://github.com/openclaw/demo-plugin.git",
          }),
        ],
        "package.json",
        { type: "application/json" },
      ),
      "demo-plugin/package.json",
    );
    const manifest = withRelativePath(
      new File(['{"id":"demo.plugin"}'], "openclaw.plugin.json", { type: "application/json" }),
      "demo-plugin/openclaw.plugin.json",
    );
    const dist = withRelativePath(
      new File(["export const demo = true;\n"], "index.js", { type: "text/javascript" }),
      "demo-plugin/dist/index.js",
    );

    fireEvent.change(getFileInput(), { target: { files: [packageJson, manifest, dist] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue("demo-plugin")).toBeTruthy();
      expect(screen.getByDisplayValue("Demo Plugin")).toBeTruthy();
      expect(screen.getByDisplayValue("1.2.3")).toBeTruthy();
      expect(screen.getByPlaceholderText("Plugin 名称").getAttribute("disabled")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "发布 Plugin" }));

    await waitFor(() => {
      expect(publishRelease).toHaveBeenCalledTimes(1);
    });

    expect(generateUploadUrl).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(publishRelease).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        name: "demo-plugin",
        displayName: "Demo Plugin",
        family: "code-plugin",
        version: "1.2.3",
        changelog: "",
        files: expect.arrayContaining([
          expect.objectContaining({ path: "package.json" }),
          expect.objectContaining({ path: "openclaw.plugin.json" }),
          expect.objectContaining({ path: "dist/index.js" }),
        ]),
      }),
    });
    expect(publishRelease.mock.calls[0]?.[0]?.payload).not.toHaveProperty("source");
  });

  it("shows backend publish failures inline on the upload form", async () => {
    publishRelease.mockRejectedValueOnce(
      new Error(
        "Plugin Inspector blocked publish: 1 breakage. missing-expected-seam: missing expected registration registerTool",
      ),
    );
    renderPublishRoute();

    const packageJson = withRelativePath(
      new File(
        [
          makeCodePluginPackageJson({
            name: "demo-plugin",
            displayName: "Demo Plugin",
            version: "1.2.3",
            repository: "https://github.com/openclaw/demo-plugin.git",
          }),
        ],
        "package.json",
        { type: "application/json" },
      ),
      "demo-plugin/package.json",
    );
    const manifest = withRelativePath(
      new File(['{"id":"demo.plugin"}'], "openclaw.plugin.json", { type: "application/json" }),
      "demo-plugin/openclaw.plugin.json",
    );
    const dist = withRelativePath(
      new File(["export const demo = true;\n"], "index.js", { type: "text/javascript" }),
      "demo-plugin/dist/index.js",
    );

    fireEvent.change(getFileInput(), { target: { files: [packageJson, manifest, dist] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue("demo-plugin")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "发布 Plugin" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Plugin Inspector 阻止了发布");
    });
    expect(screen.getByRole("columnheader", { name: "编码" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "消息" })).toBeTruthy();
    expect(screen.getByText("missing-expected-seam")).toBeTruthy();
    expect(screen.getByText("missing expected registration registerTool")).toBeTruthy();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("surfaces missing OpenClaw compatibility metadata before publish", async () => {
    renderPublishRoute();

    const packageJson = withRelativePath(
      new File(
        [
          makeCodePluginPackageJson({
            name: "demo-plugin",
            displayName: "Demo Plugin",
            version: "1.2.3",
            openclaw: {
              extensions: ["./index.ts"],
            },
          }),
        ],
        "package.json",
        { type: "application/json" },
      ),
      "demo-plugin/package.json",
    );
    const manifest = withRelativePath(
      new File(
        [
          JSON.stringify({
            id: "demo.plugin",
            name: "Demo Plugin",
            configSchema: { type: "object", additionalProperties: false },
          }),
        ],
        "openclaw.plugin.json",
        { type: "application/json" },
      ),
      "demo-plugin/openclaw.plugin.json",
    );

    fireEvent.change(getFileInput(), { target: { files: [packageJson, manifest] } });

    await waitFor(() => {
      expect(screen.getByText(/请修复包元数据：/)).toBeTruthy();
    });

    expect(screen.getByText(/openclaw\.compat\.pluginApi/i)).toBeTruthy();
    expect(screen.getByText(/openclaw\.build\.openclawVersion/i)).toBeTruthy();
    expect(screen.getByText("缺少元数据")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "发布 Plugin" }).getAttribute("disabled"),
    ).not.toBeNull();
    expect(publishRelease).not.toHaveBeenCalled();
  });

  it("blocks scoped package names that do not match the selected owner", async () => {
    renderPublishRoute();

    const packageJson = withRelativePath(
      new File(
        [
          makeCodePluginPackageJson({
            name: "@openclaw/dronzer",
            displayName: "Dronzer Controller",
            version: "1.0.0",
            repository: "https://github.com/VintageAyu/dronzerclaw.git",
          }),
        ],
        "package.json",
        { type: "application/json" },
      ),
      "dronzer/package.json",
    );
    const manifest = withRelativePath(
      new File(['{"id":"dronzer"}'], "openclaw.plugin.json", { type: "application/json" }),
      "dronzer/openclaw.plugin.json",
    );

    fireEvent.change(getFileInput(), { target: { files: [packageJson, manifest] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue("@openclaw/dronzer")).toBeTruthy();
      expect(
        screen.getAllByText(/Package scope "@openclaw" must match selected owner "@vintageayu"/i)
          .length,
      ).toBeGreaterThan(0);
    });

    const docsLink = screen.getByRole("link", { name: /了解发布机制/ });
    expect(docsLink.getAttribute("href")).toBe(DocsLinks.clawhub.packageScopeFaq);
    expect(docsLink.getAttribute("target")).toBe("_blank");
    expect(docsLink.getAttribute("rel")).toBe("noopener noreferrer");
    expect(
      screen.getByRole("button", { name: "发布 Plugin" }).getAttribute("disabled"),
    ).not.toBeNull();
    expect(publishRelease).not.toHaveBeenCalled();
  });

  it("does not mark the upload summary ready while validation errors are present", async () => {
    renderPublishRoute();

    const bigFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "too-big.bin", {
      type: "application/octet-stream",
    });

    fireEvent.change(getFileInput(), { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getAllByText(/每个文件不得超过 10MB/).length).toBeGreaterThan(0);
    });

    const summaryBorders = document.querySelectorAll(".border-emerald-300\\/45");
    expect(summaryBorders.length).toBe(0);
  });

  it("detects bundle packages and exposes the package family selector", async () => {
    renderPublishRoute();

    const packageJson = withRelativePath(
      new File(
        [
          makeCodePluginPackageJson({
            name: "demo-bundle",
            displayName: "Demo Bundle",
            version: "0.4.0",
          }),
        ],
        "package.json",
        { type: "application/json" },
      ),
      "demo-bundle/package.json",
    );
    const manifest = withRelativePath(
      new File(['{"id":"demo.bundle"}'], "openclaw.plugin.json", { type: "application/json" }),
      "demo-bundle/openclaw.plugin.json",
    );
    const bundleMarker = withRelativePath(
      new File(['{"name":"Demo Bundle"}'], "plugin.json", { type: "application/json" }),
      "demo-bundle/.codex-plugin/plugin.json",
    );
    const binary = withRelativePath(
      new File([new Uint8Array([1, 2, 3])], "plugin.wasm", { type: "application/wasm" }),
      "demo-bundle/dist/plugin.wasm",
    );

    fireEvent.change(getFileInput(), {
      target: { files: [packageJson, manifest, bundleMarker, binary] },
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("demo-bundle")).toBeTruthy();
      expect(screen.getByDisplayValue("Demo Bundle")).toBeTruthy();
      expect(screen.getByDisplayValue("0.4.0")).toBeTruthy();
      expect(screen.getAllByText("捆绑插件").length).toBeGreaterThan(0);
      expect(screen.getByText("Agent 元数据")).toBeTruthy();
      expect(screen.getByPlaceholderText("捆绑格式")).toBeTruthy();
      expect(screen.getByText(/替换包/)).toBeTruthy();
      expect(screen.getByText(/清空包/)).toBeTruthy();
    });
    expect(publishRelease).not.toHaveBeenCalled();
  });

  it("prefills metadata from a wrapped GitHub release package", async () => {
    renderPublishRoute();

    const packageJson = new File(
      [
        JSON.stringify({
          name: "@opik/opik-openclaw",
          version: "0.2.9",
          openclaw: {
            compat: {
              pluginApi: ">=2026.3.24-beta.2",
              minGatewayVersion: "2026.3.24-beta.2",
            },
            build: {
              openclawVersion: "2026.3.24-beta.2",
              pluginSdkVersion: "2026.3.24-beta.2",
            },
          },
          repository: {
            type: "git",
            url: "https://github.com/comet-ml/opik-openclaw.git",
          },
        }),
      ],
      "opik-openclaw-0.2.9/package.json",
      { type: "application/json" },
    );
    const manifest = new File(
      [JSON.stringify({ id: "opik-openclaw", name: "Opik" })],
      "opik-openclaw-0.2.9/openclaw.plugin.json",
      { type: "application/json" },
    );
    const readme = new File(["# Opik OpenClaw\n"], "opik-openclaw-0.2.9/README.md", {
      type: "text/markdown",
    });

    fireEvent.change(getFileInput(), { target: { files: [packageJson, manifest, readme] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue("@opik/opik-openclaw")).toBeTruthy();
      expect(screen.getByDisplayValue("Opik")).toBeTruthy();
      expect(screen.getByDisplayValue("0.2.9")).toBeTruthy();
      expect(screen.getByText(/已检测到包/)).toBeTruthy();
      expect(screen.queryByText(/^Compatibility:/i)).toBeNull();
      expect(screen.queryByText("Compatibility")).toBeNull();
      expect(screen.getByText("包清单")).toBeTruthy();
      expect(screen.getByText("Plugin 清单")).toBeTruthy();
      expect(screen.queryByText("opik-openclaw-0.2.9/package.json")).toBeNull();
    });
  });

  it("applies ignore rules before uploading a plugin folder", async () => {
    renderPublishRoute();

    const packageJson = withRelativePath(
      new File(
        [makeCodePluginPackageJson({ name: "demo-plugin", version: "1.0.0" })],
        "package.json",
        {
          type: "application/json",
        },
      ),
      "demo-plugin/package.json",
    );
    const ignoreFile = withRelativePath(
      new File(["dist/\n"], ".gitignore", { type: "text/plain" }),
      "demo-plugin/.gitignore",
    );
    const manifest = withRelativePath(
      new File(['{"id":"demo.plugin"}'], "openclaw.plugin.json", { type: "application/json" }),
      "demo-plugin/openclaw.plugin.json",
    );
    const kept = withRelativePath(
      new File(["export const demo = true;\n"], "index.js", { type: "text/javascript" }),
      "demo-plugin/src/index.js",
    );
    const ignoredNodeModules = withRelativePath(
      new File(["ignored"], "index.js", { type: "text/javascript" }),
      "demo-plugin/node_modules/dep/index.js",
    );
    const ignoredDist = withRelativePath(
      new File(["ignored"], "index.js", { type: "text/javascript" }),
      "demo-plugin/dist/index.js",
    );

    fireEvent.change(getFileInput(), {
      target: { files: [packageJson, ignoreFile, manifest, kept, ignoredNodeModules, ignoredDist] },
    });

    await waitFor(() => {
      expect(screen.getByText(/已忽略：node_modules\/dep\/index\.js/)).toBeTruthy();
    });

    expect(screen.queryByLabelText("ClawScan note")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "发布 Plugin" }));

    await waitFor(() => {
      expect(publishRelease).toHaveBeenCalledTimes(1);
    });

    expect(generateUploadUrl).toHaveBeenCalledTimes(5);
    const payload = publishRelease.mock.calls[0]?.[0]?.payload as {
      files: Array<{ path: string }>;
    };
    expect(payload.files.map((file) => file.path).sort()).toEqual([
      ".gitignore",
      "dist/index.js",
      "openclaw.plugin.json",
      "package.json",
      "src/index.js",
    ]);
    expect(payload).not.toHaveProperty("clawScanNote");
  });

  it("blocks plugin publish when a file exceeds 10MB", async () => {
    renderPublishRoute();

    const packageJson = withRelativePath(
      new File(
        [makeCodePluginPackageJson({ name: "demo-plugin", version: "1.0.0" })],
        "package.json",
        {
          type: "application/json",
        },
      ),
      "demo-plugin/package.json",
    );
    const manifest = withRelativePath(
      new File(['{"id":"demo.plugin"}'], "openclaw.plugin.json", { type: "application/json" }),
      "demo-plugin/openclaw.plugin.json",
    );
    const huge = withRelativePath(
      new File(["x"], "plugin.wasm", { type: "application/wasm" }),
      "demo-plugin/dist/plugin.wasm",
    );
    Object.defineProperty(huge, "size", {
      value: 10 * 1024 * 1024 + 1,
      configurable: true,
    });

    fireEvent.change(getFileInput(), { target: { files: [packageJson, manifest, huge] } });

    await waitFor(() => {
      expect(
        screen.getAllByText(/每个文件不得超过 10MB：plugin\.wasm/).length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getByRole("button", { name: "发布 Plugin" }).getAttribute("disabled"),
    ).not.toBeNull();
    expect(publishRelease).not.toHaveBeenCalled();
  });

  it("shows pending verification messaging after plugin publish", async () => {
    renderPublishRoute();

    const packageJson = withRelativePath(
      new File(
        [makeCodePluginPackageJson({ name: "demo-plugin", version: "1.0.0" })],
        "package.json",
        {
          type: "application/json",
        },
      ),
      "demo-plugin/package.json",
    );
    const manifest = withRelativePath(
      new File(['{"id":"demo.plugin"}'], "openclaw.plugin.json", { type: "application/json" }),
      "demo-plugin/openclaw.plugin.json",
    );
    const dist = withRelativePath(
      new File(["export const demo = true;\n"], "index.js", { type: "text/javascript" }),
      "demo-plugin/dist/index.js",
    );

    fireEvent.change(getFileInput(), { target: { files: [packageJson, manifest, dist] } });
    await waitFor(() => {
      expect(screen.getByDisplayValue("demo-plugin")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "发布 Plugin" }));

    expect(
      await screen.findByText(/等待安全检查与验证后才会公开列出。/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "发布 Plugin" }).getAttribute("disabled"),
    ).not.toBeNull();
  });

});
