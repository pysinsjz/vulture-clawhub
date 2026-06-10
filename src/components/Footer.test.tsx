/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: (props: { children: ReactNode; to?: string }) => (
    <a href={props.to ?? "/"}>{props.children}</a>
  ),
}));

import { Footer } from "./Footer";

describe("Footer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockMatchMedia(matches: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }

  it("renders the trimmed Browse + Publish footer for the intranet registry", () => {
    const { container } = render(<Footer />);

    const columns = container.querySelectorAll(".footer-col");
    expect(columns).toHaveLength(2);

    const browse = screen.getByRole("heading", { name: "Browse" }).closest(".footer-col");
    const publish = screen.getByRole("heading", { name: "Publish" }).closest(".footer-col");

    expect(browse).not.toBeNull();
    expect(publish).not.toBeNull();

    expect(
      within(browse as HTMLElement)
        .getByRole("link", { name: "Skills" })
        .getAttribute("href"),
    ).toBe("/skills");
    expect(
      within(browse as HTMLElement)
        .getByRole("link", { name: "Plugins" })
        .getAttribute("href"),
    ).toBe("/plugins");
    expect(
      within(publish as HTMLElement)
        .getByRole("link", { name: "Publish Skill" })
        .getAttribute("href"),
    ).toBe("/skills/publish");
    expect(
      within(publish as HTMLElement)
        .getByRole("link", { name: "Publish Plugin" })
        .getAttribute("href"),
    ).toBe("/plugins/publish");

    // Public-marketplace links (Community / Platform / GitHub / OpenClaw) are
    // intentionally absent in the internal registry footer.
    expect(screen.queryByRole("heading", { name: "Community" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Platform" })).toBeNull();
    expect(screen.queryByRole("link", { name: "GitHub" })).toBeNull();
    expect(screen.queryByRole("link", { name: "OpenClaw" })).toBeNull();
  });

  it("collapses footer sections by heading until toggled open", async () => {
    mockMatchMedia(true);
    render(<Footer />);

    const browseToggle = screen.getByRole("button", { name: "Browse" });
    const browseLinks = document.getElementById("footer-section-browse-links");
    const publishToggle = screen.getByRole("button", { name: "Publish" });
    const publishLinks = document.getElementById("footer-section-publish-links");

    expect(browseLinks).not.toBeNull();
    expect(publishLinks).not.toBeNull();
    await waitFor(() => expect(browseToggle.getAttribute("aria-expanded")).toBe("false"));
    expect(browseLinks?.getAttribute("data-open")).toBe("false");
    expect(publishToggle.getAttribute("aria-expanded")).toBe("false");
    expect(publishLinks?.getAttribute("data-open")).toBe("false");

    fireEvent.click(browseToggle);

    expect(browseToggle.getAttribute("aria-expanded")).toBe("true");
    expect(browseLinks?.getAttribute("data-open")).toBe("true");
    expect(
      within(browseLinks as HTMLElement)
        .getByRole("link", { name: "Skills" })
        .getAttribute("href"),
    ).toBe("/skills");
    expect(publishLinks?.getAttribute("data-open")).toBe("false");

    fireEvent.click(browseToggle);

    expect(browseToggle.getAttribute("aria-expanded")).toBe("false");
    expect(browseLinks?.getAttribute("data-open")).toBe("false");
  });
});
