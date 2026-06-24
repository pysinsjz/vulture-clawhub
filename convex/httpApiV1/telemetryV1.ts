import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { applyRateLimit } from "../lib/httpRateLimit";
import { json, text } from "./shared";

// Gateway contract §3.1 — POST /api/v1/telemetry/install
// Body: { roots: [{ rootId, label, skills: [{slug, version}], plugins: [{name, version}] }] }
// Auth: none (ClawHub is internal-net; trust boundary is the gateway).
// Persistence: skills are forwarded to the existing reportCliSyncInternal mutation,
// attributed to the bootstrapped system user. Plugin install rows have no schema yet
// (see [[vulture-trim-project]]); the handler validates plugin entries per contract
// but does not persist them — gateway still gets a 2xx ack as required.

type SkillEntry = { slug: string; version?: string };
type PluginEntry = { name: string; version?: string };
type RootEntry = {
  rootId: string;
  label: string;
  skills: SkillEntry[];
  plugins: PluginEntry[];
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function parseRoots(body: unknown): RootEntry[] | { error: string } {
  if (!body || typeof body !== "object") return { error: "Body must be an object" };
  const roots = (body as { roots?: unknown }).roots;
  if (!Array.isArray(roots)) return { error: "Missing 'roots' array" };
  if (roots.length > 1000) return { error: "Too many roots" };
  const out: RootEntry[] = [];
  for (const raw of roots) {
    if (!raw || typeof raw !== "object") return { error: "Root entry must be an object" };
    const r = raw as Record<string, unknown>;
    if (!isString(r.rootId) || !r.rootId.trim()) return { error: "Root missing 'rootId'" };
    if (!isString(r.label)) return { error: "Root missing 'label'" };
    const skillsRaw = r.skills ?? [];
    const pluginsRaw = r.plugins ?? [];
    if (!Array.isArray(skillsRaw)) return { error: "Root 'skills' must be array" };
    if (!Array.isArray(pluginsRaw)) return { error: "Root 'plugins' must be array" };
    const skills: SkillEntry[] = [];
    for (const s of skillsRaw) {
      if (!s || typeof s !== "object") return { error: "Skill entry must be an object" };
      const slug = (s as { slug?: unknown }).slug;
      const version = (s as { version?: unknown }).version;
      if (!isString(slug) || !slug.trim()) return { error: "Skill missing 'slug'" };
      skills.push({
        slug: slug.trim().toLowerCase(),
        version: isString(version) && version.trim() ? version.trim() : undefined,
      });
    }
    const plugins: PluginEntry[] = [];
    for (const p of pluginsRaw) {
      if (!p || typeof p !== "object") return { error: "Plugin entry must be an object" };
      const name = (p as { name?: unknown }).name;
      const version = (p as { version?: unknown }).version;
      if (!isString(name) || !name.trim()) return { error: "Plugin missing 'name'" };
      plugins.push({
        name: name.trim(),
        version: isString(version) && version.trim() ? version.trim() : undefined,
      });
    }
    out.push({
      rootId: r.rootId.trim(),
      label: r.label,
      skills,
      plugins,
    });
  }
  return out;
}

export async function telemetryInstallV1Handler(ctx: ActionCtx, request: Request) {
  if (request.method !== "POST") return text("Method not allowed", 405);

  const rate = await applyRateLimit(ctx, request, "write");
  if (!rate.ok) return rate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return text("Invalid JSON", 400, rate.headers);
  }

  const parsed = parseRoots(body);
  if ("error" in parsed) return text(parsed.error, 400, rate.headers);

  // Resolve the bootstrapped system user — gateway hands us no identity, but the
  // existing telemetry mutation requires `users:_id`.
  const systemUser = (await ctx.runMutation(
    internal.users.getOrCreateSystemUserInternal,
    {},
  )) as Doc<"users">;

  await ctx.runMutation(internal.telemetry.reportCliSyncInternal, {
    userId: systemUser._id,
    roots: parsed.map((root) => ({
      rootId: root.rootId,
      label: root.label,
      skills: root.skills,
    })),
  });

  // Plugin install rows are TODO — schema work needed before persistence.
  // Acked here per contract; tracked separately.
  return json({ ok: true }, 200, rate.headers);
}
