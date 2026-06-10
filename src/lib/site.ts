import { getRuntimeEnv } from "./runtimeEnv";

const DEFAULT_SITE_URL = "https://registry.vulture.local";

export function getSiteUrl() {
  const explicit = getRuntimeEnv("VITE_SITE_URL");
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_SITE_URL;
}

export function getSiteName() {
  return "VultureHub";
}

export function getSiteDescription() {
  return "VultureHub — internal registry for agent skills and gateway plugins.";
}
