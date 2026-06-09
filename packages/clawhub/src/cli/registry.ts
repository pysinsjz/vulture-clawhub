import { readGlobalConfig, writeGlobalConfig } from "../config.js";
import { discoverRegistryFromSite } from "../discovery.js";
import type { GlobalOpts } from "./types.js";

// Vulture: internal registry has no fixed public URL. Operators point the CLI at
// their gateway via VULTURE_REGISTRY / VULTURE_SITE (or --registry / --site).
const DEFAULT_VULTURE_REGISTRY = "https://registry.vulture.local";
export const DEFAULT_SITE = process.env.VULTURE_SITE?.trim() || DEFAULT_VULTURE_REGISTRY;
export const DEFAULT_REGISTRY = process.env.VULTURE_REGISTRY?.trim() || DEFAULT_VULTURE_REGISTRY;
const LEGACY_REGISTRY_HOSTS = new Set([
  "auth.clawdhub.com",
  "auth.clawhub.com",
  "auth.clawhub.ai",
  "registry.clawhub.ai",
]);

export async function resolveRegistry(opts: GlobalOpts) {
  const explicit = opts.registrySource !== "default" ? opts.registry.trim() : "";
  if (explicit) return explicit;

  const discovery = await discoverRegistryFromSite(opts.site).catch(() => null);
  const discovered = discovery?.apiBase?.trim();
  if (discovered) return discovered;

  const cfg = await readGlobalConfig();
  const cached = cfg?.registry?.trim();
  if (cached && !isLegacyRegistry(cached)) return cached;
  return DEFAULT_REGISTRY;
}

export async function getRegistry(opts: GlobalOpts, params?: { cache?: boolean }) {
  const cache = params?.cache !== false;
  const registry = await resolveRegistry(opts);
  if (!cache) return registry;
  const cfg = await readGlobalConfig();
  const cached = cfg?.registry?.trim();
  const shouldUpdate =
    !cached ||
    isLegacyRegistry(cached) ||
    (cached === DEFAULT_REGISTRY && registry !== DEFAULT_REGISTRY);
  if (shouldUpdate) await writeGlobalConfig({ registry, token: cfg?.token });
  return registry;
}

function isLegacyRegistry(registry: string) {
  try {
    return LEGACY_REGISTRY_HOSTS.has(new URL(registry).hostname);
  } catch {
    return false;
  }
}
