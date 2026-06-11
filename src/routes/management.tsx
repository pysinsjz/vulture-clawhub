import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronRight,
  GitBranch,
  PackageSearch,
  Plug,
  UserRound,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { ManagementSkeleton } from "../components/skeletons/ProtectedPageSkeletons";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { isAdmin, isModerator } from "../lib/roles";
import { useAuthStatus } from "../lib/useAuthStatus";
import { DuplicatesPage } from "./-management/DuplicatesPage";
import {
  formatManagementUserLabel,
  formatMutationError,
  formatWholeNumber,
  SKILL_AUDIT_LOG_LIMIT,
  type DuplicateCandidateEntry,
  type ManagementOwnerOption,
  type ManagementUserListResult,
  type ManagementView,
  type PluginByNameResult,
  type RecentVersionEntry,
  type SkillBySlugResult,
  USER_BAN_REASON_MAX_LENGTH,
} from "./-management/managementShared";
import { PluginsPage } from "./-management/PluginsPage";
import { RecentPushesPage } from "./-management/RecentPushesPage";
import { SkillsPage } from "./-management/SkillsPage";
import { UsersPage } from "./-management/UsersPage";

const MANAGEMENT_VIEWS = new Set<string>([
  "overview",
  "users",
  "publishers",
  "skills",
  "plugins",
  "duplicates",
  "recent",
  "audit",
  "system",
  "settings",
]);

function isManagementView(value: unknown): value is ManagementView {
  return typeof value === "string" && MANAGEMENT_VIEWS.has(value);
}

type ManagementConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel: string;
  destructive?: boolean;
  reason?: {
    label: string;
    placeholder?: string;
    required?: boolean;
    maxLength?: number;
  };
  onConfirm: (reason: string | undefined) => void;
};

// Convex `useQuery` returns undefined while a new query (e.g. a changed search arg)
// is in flight. Keep the previous result visible during that window so search-driven
// lists do not blank out to a loading state on every keystroke.
function useStableQuery<T>(value: T | undefined): T | undefined {
  const ref = useRef<T | undefined>(value);
  if (value !== undefined) ref.current = value;
  return ref.current;
}

function ManagementConfirmDialog({
  request,
  onClose,
}: {
  request: ManagementConfirmRequest | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason("");
  }, [request]);

  const reasonRequired = request?.reason?.required ?? false;
  const canConfirm = !reasonRequired || reason.trim().length > 0;

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="management-confirm">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.body ? <DialogDescription>{request.body}</DialogDescription> : null}
        </DialogHeader>
        {request?.reason ? (
          <label className="management-confirm-field">
            <span>{request.reason.label}</span>
            <Textarea
              autoFocus
              rows={3}
              maxLength={request.reason.maxLength}
              placeholder={request.reason.placeholder}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            variant={request?.destructive ? "destructive" : "primary"}
            disabled={!canConfirm}
            onClick={() => {
              request?.onConfirm(reason.trim() || undefined);
              onClose();
            }}
          >
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/management")({
  validateSearch: (search) => {
    const validated: {
      skill?: string;
      plugin?: string;
      view?: ManagementView;
    } = {};
    if (typeof search.skill === "string" && search.skill.trim()) {
      validated.skill = search.skill;
    }
    if (typeof search.plugin === "string" && search.plugin.trim()) {
      validated.plugin = search.plugin;
    }
    if (isManagementView(search.view)) {
      validated.view = search.view;
    }
    return validated;
  },
  component: Management,
});

export function Management() {
  const { isLoading: isAuthLoading, me } = useAuthStatus();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const staff = isModerator(me);
  const admin = isAdmin(me);

  const selectedSlug = search.skill?.trim();
  const selectedPluginName = search.plugin?.trim();
  const activeView = resolveManagementView(search.view, selectedSlug, selectedPluginName);
  const selectedSkill = useQuery(
    api.skills.getBySlugForStaff,
    staff && selectedSlug ? { slug: selectedSlug, auditLogLimit: SKILL_AUDIT_LOG_LIMIT } : "skip",
  ) as SkillBySlugResult | undefined;
  const selectedPlugin = useQuery(
    api.packages.getByNameForStaff,
    staff && selectedPluginName ? { name: selectedPluginName } : "skip",
  ) as PluginByNameResult | undefined;
  const selectedSkillId = selectedSkill?.skill?._id ?? null;
  const recentVersions = useQuery(api.skills.listRecentVersions, staff ? { limit: 20 } : "skip") as
    | RecentVersionEntry[]
    | undefined;
  const duplicateCandidates = useQuery(
    api.skills.listDuplicateCandidates,
    staff ? { limit: 20 } : "skip",
  ) as DuplicateCandidateEntry[] | undefined;

  const setRole = useMutation(api.users.setRole);
  const banUser = useMutation(api.users.banUser);
  const unbanUser = useMutation(api.users.unbanUser);
  const setBatch = useMutation(api.skills.setBatch);
  const setPackageBatch = useMutation(api.packages.setBatch);
  const setSoftDeleted = useMutation(api.skills.setSoftDeleted);
  const hardDelete = useMutation(api.skills.hardDelete);
  const changeOwner = useMutation(api.skills.changeOwner);
  const setDuplicate = useMutation(api.skills.setDuplicate);
  const setOfficialBadge = useMutation(api.skills.setOfficialBadge);
  const setDeprecatedBadge = useMutation(api.skills.setDeprecatedBadge);
  const setSkillManualOverride = useMutation(api.skills.setSkillManualOverride);
  const clearSkillManualOverride = useMutation(api.skills.clearSkillManualOverride);

  const [selectedDuplicate, setSelectedDuplicate] = useState("");
  const [selectedOwner, setSelectedOwner] = useState<Id<"users"> | "">("");
  const [userSearch, setUserSearch] = useState("");
  const [userSearchDebounced, setUserSearchDebounced] = useState("");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerSearchDebounced, setOwnerSearchDebounced] = useState("");
  const [pluginSearch, setPluginSearch] = useState(selectedPluginName ?? "");
  const [skillSearch, setSkillSearch] = useState(selectedSlug ?? "");
  const [skillOverrideNote, setSkillOverrideNote] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<ManagementConfirmRequest | null>(null);

  const userQuery = userSearchDebounced.trim();
  const userResult = useStableQuery(
    useQuery(
      api.users.list,
      admin && activeView === "users" ? { limit: 200, search: userQuery || undefined } : "skip",
    ) as ManagementUserListResult | undefined,
  );
  const ownerQuery = ownerSearchDebounced.trim();
  const ownerResult = useStableQuery(
    useQuery(
      api.users.list,
      admin && activeView === "skills" ? { limit: 200, search: ownerQuery || undefined } : "skip",
    ) as ManagementUserListResult | undefined,
  );
  const selectedOwnerUserId = selectedSkill?.skill?.ownerUserId ?? null;
  const selectedCanonicalSlug = selectedSkill?.canonical?.skill?.slug ?? "";

  useEffect(() => {
    if (!selectedSkillId || !selectedOwnerUserId) return;
    setSelectedDuplicate(selectedCanonicalSlug);
    setSelectedOwner(selectedOwnerUserId);
  }, [selectedCanonicalSlug, selectedOwnerUserId, selectedSkillId]);

  useEffect(() => {
    setSkillOverrideNote("");
  }, [selectedSkillId]);

  useEffect(() => {
    setPluginSearch(selectedPluginName ?? "");
  }, [selectedPluginName]);

  useEffect(() => {
    setSkillSearch(selectedSlug ?? "");
  }, [selectedSlug]);

  useEffect(() => {
    const handle = setTimeout(() => setUserSearchDebounced(userSearch), 250);
    return () => clearTimeout(handle);
  }, [userSearch]);

  useEffect(() => {
    const handle = setTimeout(() => setOwnerSearchDebounced(ownerSearch), 250);
    return () => clearTimeout(handle);
  }, [ownerSearch]);

  if (isAuthLoading) {
    return <ManagementSkeleton />;
  }

  if (!staff) {
    return (
      <main className="section">
        <Card>仅限管理人员。</Card>
      </main>
    );
  }

  const filteredUsers = userResult?.items ?? [];
  const userTotal = userResult?.total ?? 0;
  const userSummary = userResult
    ? `显示 ${filteredUsers.length}，共 ${userTotal}`
    : "正在加载用户…";
  const ownerUsers = ownerResult?.items ?? [];
  const selectedOwnerOption: ManagementOwnerOption | null = selectedSkill?.owner?.linkedUserId
    ? {
        userId: selectedSkill.owner.linkedUserId,
        label: `@${selectedSkill.owner.handle ?? selectedSkill.owner.displayName ?? "user"}`,
      }
    : null;
  const ownerUserOptions: ManagementOwnerOption[] = ownerUsers.map((user) => ({
    userId: user._id,
    label: formatManagementUserLabel(user, user._id),
  }));
  const ownerOptions =
    selectedOwnerOption &&
    !ownerUserOptions.some((option) => option.userId === selectedOwnerOption.userId)
      ? [selectedOwnerOption, ...ownerUserOptions]
      : ownerUserOptions;
  const ownerSummary = ownerResult
    ? `显示 ${ownerOptions.length}，共 ${Math.max(ownerResult.total, ownerOptions.length)}`
    : "正在加载所有者…";
  const userEmptyLabel = userResult
    ? filteredUsers.length === 0
      ? userQuery
        ? "没有匹配的用户。"
        : "暂无用户。"
      : ""
    : "正在加载用户…";

  const applySkillOverride = () => {
    if (!selectedSkill?.skill) return;
    void setSkillManualOverride({
      skillId: selectedSkill.skill._id,
      note: skillOverrideNote,
    })
      .then(() => {
        setSkillOverrideNote("");
        toast.success("已标记 Skill 正常。");
      })
      .catch((error) => toast.error(formatMutationError(error)));
  };

  const clearSkillOverride = () => {
    if (!selectedSkill?.skill?.manualOverride) return;
    void clearSkillManualOverride({
      skillId: selectedSkill.skill._id,
      note: skillOverrideNote,
    })
      .then(() => {
        setSkillOverrideNote("");
        toast.success("覆盖已清除。");
      })
      .catch((error) => toast.error(formatMutationError(error)));
  };

  const managePlugin = () => {
    const name = pluginSearch.trim();
    if (!name) return;
    void navigate({
      to: "/management",
      search: { view: "plugins", skill: undefined, plugin: name },
    });
  };
  const manageSkill = () => {
    const slug = skillSearch.trim();
    if (!slug) return;
    void navigate({
      to: "/management",
      search: { view: "skills", skill: slug, plugin: undefined },
    });
  };
  const requestBanUser = (userId: Id<"users">, label: string) => {
    setConfirmRequest({
      title: `封禁 ${label}？`,
      body: "隐藏其 Skill 及个人 Package/Plugin 资源，并吊销 Package 发布令牌。",
      confirmLabel: "封禁用户",
      destructive: true,
      reason: {
        label: "原因（可选）",
        placeholder: "为何封禁该用户？",
        maxLength: USER_BAN_REASON_MAX_LENGTH,
      },
      onConfirm: (reason) => {
        void banUser({ userId, reason })
          .then(() => toast.success(`已封禁 ${label}。`))
          .catch((error) => toast.error(formatMutationError(error)));
      },
    });
  };

  const requestUnbanUser = (userId: Id<"users">, label: string) => {
    setConfirmRequest({
      title: `解封 ${label}？`,
      body: "恢复符合条件的 Skill 及因封禁隐藏的个人 Package/Plugin 资源。",
      confirmLabel: "解封用户",
      reason: {
        label: "原因（可选）",
        placeholder: "为何解封该用户？",
        maxLength: USER_BAN_REASON_MAX_LENGTH,
      },
      onConfirm: (reason) => {
        void unbanUser({ userId, reason })
          .then(() => toast.success(`已解封 ${label}。`))
          .catch((error) => toast.error(formatMutationError(error)));
      },
    });
  };

  const requestToggleSkillHidden = (skill: Doc<"skills">) => {
    const hide = !skill.softDeletedAt;
    setConfirmRequest({
      title: hide ? `隐藏 ${skill.displayName}？` : `恢复 ${skill.displayName}？`,
      confirmLabel: hide ? "隐藏 Skill" : "恢复 Skill",
      destructive: hide,
      reason: {
        label: "原因",
        placeholder: hide ? "为何隐藏此 Skill？" : "为何恢复此 Skill？",
        required: true,
      },
      onConfirm: (reason) => {
        void setSoftDeleted({
          skillId: skill._id,
          deleted: hide,
          reason: reason ?? "",
        })
          .then(() => toast.success(hide ? "Skill 已隐藏。" : "Skill 已恢复。"))
          .catch((error) => toast.error(formatMutationError(error)));
      },
    });
  };

  const requestHardDeleteSkill = (skill: Doc<"skills">) => {
    setConfirmRequest({
      title: `硬删除 ${skill.displayName}？`,
      body: "这将永久删除该 Skill 及其历史，且无法撤销。",
      confirmLabel: "硬删除",
      destructive: true,
      onConfirm: () => {
        void hardDelete({ skillId: skill._id })
          .then(() => toast.success("Skill 已硬删除。"))
          .catch((error) => toast.error(formatMutationError(error)));
      },
    });
  };

  return (
    <main className="management-shell">
      <ManagementSidebar
        activeView={activeView}
        admin={admin}
        duplicateCount={duplicateCandidates?.length}
        recentCount={recentVersions?.length}
        userCount={userResult ? userTotal : undefined}
      />
      <section className="management-main">
        <div className="management-breadcrumb">
          <span>管理</span>
          <ChevronRight size={13} aria-hidden="true" />
          <strong>{formatManagementViewLabel(activeView)}</strong>
        </div>

        {activeView === "skills" ? (
          <SkillsPage
            admin={admin}
            currentUserId={me?._id ?? null}
            ownerOptions={ownerOptions}
            ownerSearch={ownerSearch}
            ownerSummary={ownerSummary}
            ownerUsers={ownerUsers}
            selectedDuplicate={selectedDuplicate}
            selectedOwner={selectedOwner}
            selectedSkill={selectedSkill}
            selectedSlug={selectedSlug}
            skillOverrideNote={skillOverrideNote}
            skillSearch={skillSearch}
            staff={staff}
            onApplySkillOverride={applySkillOverride}
            onBanUser={requestBanUser}
            onChangeOwner={(skillId, ownerUserId) => {
              void changeOwner({ skillId, ownerUserId });
            }}
            onChangeOwnerSearch={setOwnerSearch}
            onChangeSelectedDuplicate={setSelectedDuplicate}
            onChangeSelectedOwner={setSelectedOwner}
            onChangeSkillOverrideNote={setSkillOverrideNote}
            onChangeSkillSearch={setSkillSearch}
            onClearSkillOverride={clearSkillOverride}
            onHardDeleteSkill={requestHardDeleteSkill}
            onManageSkill={manageSkill}
            onSetBatch={(skillId, batch) => {
              void setBatch({ skillId, batch });
            }}
            onSetDeprecatedBadge={(skillId, deprecated) => {
              void setDeprecatedBadge({ skillId, deprecated });
            }}
            onSetDuplicate={(skillId, canonicalSlug) => {
              void setDuplicate({ skillId, canonicalSlug });
            }}
            onSetOfficialBadge={(skillId, official) => {
              void setOfficialBadge({ skillId, official });
            }}
            onToggleSkillHidden={requestToggleSkillHidden}
          />
        ) : null}

        {activeView === "plugins" ? (
          <PluginsPage
            pluginSearch={pluginSearch}
            selectedPlugin={selectedPlugin}
            selectedPluginName={selectedPluginName}
            onChangePluginSearch={setPluginSearch}
            onManagePlugin={managePlugin}
            onSetPackageBatch={(packageId, batch) => {
              void setPackageBatch({ packageId, batch }).catch((error) =>
                toast.error(formatMutationError(error)),
              );
            }}
          />
        ) : null}

        {activeView === "duplicates" ? (
          <DuplicatesPage
            duplicateCandidates={duplicateCandidates}
            onSetDuplicate={(skillId, canonicalSlug) => {
              void setDuplicate({ skillId, canonicalSlug });
            }}
          />
        ) : null}

        {activeView === "recent" ? <RecentPushesPage recentVersions={recentVersions} /> : null}

        {admin && activeView === "users" ? (
          <UsersPage
            currentUserId={me?._id ?? null}
            filteredUsers={filteredUsers}
            search={userSearch}
            summary={userSummary}
            userEmptyLabel={userEmptyLabel}
            onBanUser={requestBanUser}
            onChangeSearch={setUserSearch}
            onSetRole={(userId, role) => {
              void setRole({ userId, role });
            }}
            onUnbanUser={requestUnbanUser}
          />
        ) : null}
        {!admin && activeView === "users" ? (
          <ManagementPlaceholder
            title="用户"
            description="用户管理仅管理员可用。"
          />
        ) : null}
        {activeView === "overview" ? (
          <ManagementPlaceholder
            title="概览"
            description="使用侧栏进入专门的管理队列。"
          />
        ) : null}
        {activeView === "publishers" ? (
          <ManagementPlaceholder
            title="发布者"
            description="发布者专属工具将在脱离一次性审核流程后落地于此。"
          />
        ) : null}
        {activeView === "audit" ? (
          <ManagementPlaceholder
            title="审计日志"
            description="审计日志查询目前仍在各工具内分别处理。"
          />
        ) : null}
        {activeView === "system" ? (
          <ManagementPlaceholder
            title="系统"
            description="系统维护快捷入口可加入此处，避免挤占审核队列。"
          />
        ) : null}
        {activeView === "settings" ? (
          <ManagementPlaceholder
            title="设置"
            description="当员工设置超出内联控件时，可拆分到此视图。"
          />
        ) : null}
      </section>
      <ManagementConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </main>
  );
}

function ManagementPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <Card className="management-placeholder">
      <h2 className="section-title text-[1.2rem] m-0">{title}</h2>
      <p className="section-subtitle m-0">{description}</p>
    </Card>
  );
}

function ManagementSidebar({
  activeView,
  admin,
  duplicateCount,
  recentCount,
  userCount,
}: {
  activeView: ManagementView;
  admin: boolean;
  duplicateCount?: number;
  recentCount?: number;
  userCount?: number;
}) {
  return (
    <aside className="management-sidebar">
      <nav aria-label="管理分区">
        <div className="management-sidebar-heading">管理</div>
        <div className="management-sidebar-section-title">队列</div>
        <div className="management-sidebar-group">
          <ManagementSidebarLink
            active={activeView === "duplicates"}
            badge={queueBadge(duplicateCount)}
            icon={<PackageSearch size={15} />}
            label="疑似重复"
            view="duplicates"
          />
          <ManagementSidebarLink
            active={activeView === "recent"}
            badge={queueBadge(recentCount)}
            icon={<GitBranch size={15} />}
            label="最近推送"
            view="recent"
          />
        </div>

        <div className="management-sidebar-section-title">员工工具</div>
        <div className="management-sidebar-group">
          {admin ? (
            <ManagementSidebarLink
              active={activeView === "users"}
              badge={userCount === undefined ? undefined : formatWholeNumber(userCount)}
              icon={<UserRound size={15} />}
              label="用户"
              view="users"
            />
          ) : null}
          <ManagementSidebarLink
            active={activeView === "skills"}
            icon={<Wrench size={15} />}
            label="Skill"
            view="skills"
          />
          <ManagementSidebarLink
            active={activeView === "plugins"}
            icon={<Plug size={15} />}
            label="Plugin"
            view="plugins"
          />
        </div>
      </nav>
    </aside>
  );
}

function ManagementSidebarLink({
  active,
  badge,
  icon,
  label,
  view,
}: {
  active: boolean;
  badge?: string;
  icon: ReactNode;
  label: string;
  view: ManagementView;
}) {
  return (
    <Link
      className={active ? "management-sidebar-link is-active" : "management-sidebar-link"}
      to="/management"
      search={{ view, skill: undefined, plugin: undefined }}
    >
      {icon}
      <span>{label}</span>
      {badge ? <small>{badge}</small> : null}
    </Link>
  );
}

function resolveManagementView(
  view: ManagementView | undefined,
  selectedSlug?: string,
  selectedPluginName?: string,
): ManagementView {
  if (selectedSlug) return "skills";
  if (selectedPluginName) return "plugins";
  return view ?? "overview";
}

const MANAGEMENT_VIEW_LABELS: Record<ManagementView, string> = {
  overview: "概览",
  users: "用户",
  publishers: "发布者",
  skills: "Skill",
  plugins: "Plugin",
  duplicates: "疑似重复",
  recent: "最近推送",
  audit: "审计日志",
  system: "系统",
  settings: "设置",
};

function formatManagementViewLabel(view: ManagementView) {
  return MANAGEMENT_VIEW_LABELS[view];
}

/** Queue badges only carry signal when there is a backlog; hide 0 and loading. */
function queueBadge(count: number | undefined) {
  return count ? formatWholeNumber(count) : undefined;
}
