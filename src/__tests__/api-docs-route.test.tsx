/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: object) => ({ ...config }),
}));

vi.mock("swagger-ui-dist/swagger-ui-bundle.js", () => ({ default: vi.fn() }));
vi.mock("swagger-ui-dist/swagger-ui.css", () => ({ default: {} }));

describe("api-docs route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the docs shell with the spec toggle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ openapi: "3.0.3", paths: {} }),
      }),
    );

    const { Route } = await import("../routes/api-docs");
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

    expect(screen.getByRole("heading", { name: "API 文档" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "REST API" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Convex 函数 API" })).toBeTruthy();
    expect(document.querySelector('[data-testid="swagger-container"]')).toBeTruthy();
  });
});
