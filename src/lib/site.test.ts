/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSiteDescription, getSiteName, getSiteUrl } from "./site";

const SITE_ENV_KEYS = ["SITE_URL", "VITE_SITE_URL"];

function withServerEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("site (intranet single-mode)", () => {
  beforeEach(() => {
    for (const key of SITE_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of SITE_ENV_KEYS) delete process.env[key];
  });

  it("returns VultureHub branding", () => {
    expect(getSiteName()).toBe("VultureHub");
    expect(getSiteDescription()).toMatch(/VultureHub/);
  });

  it("returns the configured VITE_SITE_URL origin when present", () => {
    const url = withServerEnv({ VITE_SITE_URL: "https://registry.example.local/extra" }, () =>
      getSiteUrl(),
    );
    expect(url).toBe("https://registry.example.local");
  });

  it("falls back to the default site URL when VITE_SITE_URL is unset", () => {
    expect(getSiteUrl()).toBe("https://registry.vulture.local");
  });

  it("ignores malformed VITE_SITE_URL and falls back to default", () => {
    const url = withServerEnv({ VITE_SITE_URL: "not a url" }, () => getSiteUrl());
    expect(url).toBe("https://registry.vulture.local");
  });
});
