import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getUserFacingConvexError } from "../../lib/convexError";

export const SKILL_AUDIT_LOG_LIMIT = 10;
export const USER_BAN_REASON_MAX_LENGTH = 500;

export type ManagementUserListResult = FunctionReturnType<typeof api.users.list>;
export type SkillBySlugResult = FunctionReturnType<typeof api.skills.getBySlugForStaff>;
export type PluginByNameResult = FunctionReturnType<typeof api.packages.getByNameForStaff>;
export type RecentVersionEntry = FunctionReturnType<typeof api.skills.listRecentVersions>[number];
export type ManagedSkillEntry = FunctionReturnType<typeof api.skills.listForManagement>[number];
export type ManagedPluginEntry = FunctionReturnType<typeof api.packages.listForManagement>[number];
export type DuplicateCandidateEntry = FunctionReturnType<
  typeof api.skills.listDuplicateCandidates
>[number];
export type ManagementUserSummary = NonNullable<NonNullable<SkillBySlugResult>["overrideReviewer"]>;

export type ManagementView =
  | "overview"
  | "users"
  | "publishers"
  | "skills"
  | "plugins"
  | "plugin-categories"
  | "skill-categories"
  | "duplicates"
  | "recent"
  | "audit"
  | "system"
  | "settings";

export type ManagementOwnerOption = {
  userId: Id<"users">;
  label: string;
};

export function resolveOwnerParam(
  handle: string | null | undefined,
  ownerId?: Id<"users"> | Id<"publishers">,
) {
  return handle?.trim().toLowerCase() || (ownerId ? String(ownerId) : "unknown");
}

export function formatTimestamp(value: number) {
  return new Date(value).toLocaleString();
}

export function formatShortTimestamp(value: number) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatWholeNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat().format(Math.round(value));
}

export function formatMutationError(error: unknown) {
  return getUserFacingConvexError(error, "请求失败。");
}

export function formatManualOverrideState(
  override:
    | {
        verdict: string;
        note: string;
        reviewerUserId: string;
        updatedAt: number;
      }
    | null
    | undefined,
  reviewer?: ManagementUserSummary | null,
) {
  if (!override) return "无覆盖。";
  return `${formatVerdictLabel(override.verdict)} · 审核员 ${formatManagementUserLabel(reviewer, override.reviewerUserId)} · 更新于 ${formatTimestamp(
    override.updatedAt,
  )} · ${override.note}`;
}

export function formatManagementUserLabel(
  user: ManagementUserSummary | null | undefined,
  fallbackId?: string | null,
) {
  if (user?.handle?.trim()) return `@${user.handle.trim()}`;
  if (user?.displayName?.trim()) return user.displayName.trim();
  if (user?.name?.trim()) return user.name.trim();
  if (fallbackId?.trim()) return fallbackId.trim();
  return "未知用户";
}

export function formatAuditActionLabel(action: string, metadata?: unknown) {
  const record = asAuditMetadataRecord(metadata);
  if (action === "skill.manual_override.set") {
    const verdict = typeof record?.verdict === "string" ? record.verdict : "unknown";
    return `覆盖设为 ${formatVerdictLabel(verdict)}`;
  }
  if (action === "skill.manual_override.clear") {
    return "已清除覆盖";
  }
  if (action === "skill.owner.change") {
    return "已变更所有者";
  }
  if (action === "skill.duplicate.set") {
    return "已设置重复目标";
  }
  if (action === "skill.duplicate.clear") {
    return "已清除重复目标";
  }
  if (action === "skill.auto_hide") {
    return "Skill 已自动隐藏";
  }
  if (action === "skill.hard_delete") {
    return "Skill 已硬删除";
  }
  if (action.startsWith("skill.transfer.")) {
    return `转移 ${action.slice("skill.transfer.".length).replaceAll("_", " ")}`;
  }
  if (action.startsWith("skill.")) {
    return action.slice("skill.".length).replaceAll(".", " ").replaceAll("_", " ");
  }
  return action.replaceAll(".", " ").replaceAll("_", " ");
}

export function formatAuditMetadataSummary(action: string, metadata?: unknown) {
  const record = asAuditMetadataRecord(metadata);
  if (!record) return null;

  if (action === "skill.manual_override.set") {
    const note = typeof record.note === "string" ? record.note.trim() : "";
    if (note) return note;
    const previousVerdict =
      typeof record.previousVerdict === "string" ? record.previousVerdict : null;
    return previousVerdict ? `先前判定：${formatVerdictLabel(previousVerdict)}` : null;
  }

  if (action === "skill.manual_override.clear") {
    const note = typeof record.note === "string" ? record.note.trim() : "";
    if (note) return note;
    const previousVerdict =
      typeof record.previousVerdict === "string" ? record.previousVerdict : null;
    return previousVerdict ? `先前覆盖判定：${formatVerdictLabel(previousVerdict)}` : null;
  }

  if (action === "skill.owner.change") {
    const from = typeof record.from === "string" ? record.from : null;
    const to = typeof record.to === "string" ? record.to : null;
    if (from || to) return `从 ${from ?? "未知"} 到 ${to ?? "未知"}`;
  }

  if (action === "skill.duplicate.set") {
    return typeof record.canonicalSlug === "string" ? `规范 Skill：${record.canonicalSlug}` : null;
  }

  if (action === "skill.duplicate.clear") {
    return "已清除规范 Skill。";
  }

  if (action === "skill.auto_hide") {
    return typeof record.reportCount === "number" ? `${record.reportCount} 条活跃举报` : null;
  }

  if (action === "skill.hard_delete") {
    return typeof record.slug === "string" ? `已删除 slug：${record.slug}` : null;
  }

  if (typeof record.note === "string" && record.note.trim()) {
    return record.note.trim();
  }
  if (typeof record.reason === "string" && record.reason.trim()) {
    return record.reason.trim();
  }
  return null;
}

function asAuditMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

function formatVerdictLabel(verdict: string) {
  return verdict === "clean" ? "正常" : verdict;
}
