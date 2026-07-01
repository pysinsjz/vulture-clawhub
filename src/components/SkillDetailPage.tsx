import { useNavigate } from "@tanstack/react-router";
import type { ClawdisSkillMetadata } from "clawhub-schema";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, TriangleAlert, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { getUserFacingConvexError } from "../lib/convexError";
import { isModerator } from "../lib/roles";
import { skillCardLoadKey } from "../lib/skillCards";
import type { SkillBySlugResult, SkillPageInitialData } from "../lib/skillPage";
import { resolveGitHubSkillReadmeHref } from "../lib/skillReadmeLinks";
import { useAuthStatus } from "../lib/useAuthStatus";
import { DetailBody, DetailPageShell } from "./DetailPageShell";
import { DetailSecuritySummary } from "./DetailSecuritySummary";
import { GenericNotFoundPage } from "./GenericNotFoundPage";
import { SkillDetailSkeleton } from "./skeletons/SkillDetailSkeleton";
import { SkillDetailTabs, type DetailTab } from "./SkillDetailTabs";
import {
  buildSkillHref,
  formatConfigSnippet,
  formatNixInstallSnippet,
  formatOsList,
  stripFrontmatter,
} from "./skillDetailUtils";
import { SkillHeader } from "./SkillHeader";
import { buildSkillInstallTabs } from "./SkillInstallCard";
import { SkillOwnershipPanel } from "./SkillOwnershipPanel";
import { SkillRelatedSection, type RelatedSkillEntry } from "./SkillRelatedSection";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type SkillDetailPageProps = {
  slug: string;
  canonicalOwner?: string;
  redirectToCanonical?: boolean;
  initialData?: SkillPageInitialData | null;
  mode?: "detail" | "settings";
};

type SkillFile = Doc<"skillVersions">["files"][number];
type SkillDetailVersion = NonNullable<NonNullable<SkillBySlugResult>["latestVersion"]> & {
  generatedSkillCard?: SkillFile | null;
};
type GitHubBackedSkillFields = {
  installKind?: "github";
  githubHasSkillCard?: boolean;
  githubScanStatus?: string | null;
};

function tabFromHash(hash: string): DetailTab {
  const normalized = hash.replace(/^#/, "").toLowerCase();
  if (normalized === "files") return "files";
  if (normalized === "skill-card" || normalized === "card") return "skill-card";
  if (normalized === "compare") return "compare";
  if (normalized === "versions") return "versions";
  if (
    normalized === "runtime" ||
    normalized === "dependencies" ||
    normalized === "install" ||
    normalized === "links"
  ) {
    return normalized;
  }
  return "readme";
}


function buildStaffVisibilityAlert({
  artifactKind,
  moderationReason,
  moderationNote,
  isAutoHidden,
  isRemoved,
  isSoftDeleted,
  modInfo,
}: {
  artifactKind: "skill" | "plugin";
  moderationReason?: string;
  moderationNote?: string;
  isAutoHidden: boolean;
  isRemoved: boolean;
  isSoftDeleted: boolean;
  modInfo?: { isMalwareBlocked: boolean; isSuspicious: boolean } | null;
}) {
  if (isRemoved) {
    return `该 ${artifactKind === "plugin" ? "Plugin" : "Skill"} 已被审核移出公开展示。`;
  }

  let reason = "因审核处理。";
  if (isAutoHidden) {
    reason = "因多次举报被自动隐藏。";
  } else if (moderationReason === "manual.report") {
    reason = "因工作人员复核了举报。";
  } else if (moderationReason === "pending.scan" || moderationReason === "pending.scan.stale") {
    reason = "因安全检查尚未完成。";
  } else if (moderationReason === "quality.low") {
    reason = "因质量问题被暂缓。";
  } else if (moderationReason === "user.banned") {
    reason = "因发布者账号已被封禁。";
  } else if (moderationReason === "user.moderation") {
    reason = "因发布者账号正在接受审核。";
  } else if (moderationReason === "owner.merged") {
    reason = "因已被合并到另一个 Skill。";
  } else if (moderationReason === "security.redaction") {
    reason = "因安全脱敏处理被隐藏。";
  } else if (moderationReason?.startsWith("scanner.") && moderationReason.endsWith(".malicious")) {
    reason = "因自动安全检查发现安全警告或恶意内容。";
  } else if (moderationReason?.startsWith("scanner.") && moderationReason.endsWith(".suspicious")) {
    reason = "因自动安全检查发现安全警告或恶意内容。";
  } else if (modInfo?.isMalwareBlocked) {
    reason = "因自动安全检查发现安全警告或恶意内容。";
  } else if (modInfo?.isSuspicious) {
    reason = "因自动安全检查发现安全警告或恶意内容。";
  } else if (isSoftDeleted && !moderationReason) {
    reason = "因已被取消发布。";
  }

  const base = `该 ${artifactKind === "plugin" ? "Plugin" : "Skill"} 已被隐藏，不再公开展示，${reason}`;
  if (!moderationNote) return base;

  const normalizedNote = moderationNote.trim();
  const generatedNotes = new Set([
    "Auto-hidden after 4 unique reports.",
    "Removed from public view.",
    "Hidden from public view.",
  ]);
  if (!normalizedNote || generatedNotes.has(normalizedNote)) return base;
  return `${base} 审核备注：${normalizedNote}`;
}

export function SkillDetailPage({
  slug,
  canonicalOwner,
  redirectToCanonical,
  initialData,
  mode = "detail",
}: SkillDetailPageProps) {
  const navigate = useNavigate();
  const { me } = useAuthStatus();
  const initialResult = initialData?.result ?? undefined;

  const isStaff = isModerator(me);
  const staffResult = useQuery(api.skills.getBySlugForStaff, isStaff ? { slug } : "skip") as
    | SkillBySlugResult
    | undefined;
  const publicResult = useQuery(api.skills.getBySlug, !isStaff ? { slug } : "skip") as
    | SkillBySlugResult
    | undefined;
  const result = isStaff ? staffResult : publicResult === undefined ? initialResult : publicResult;

  const updateSummary = useMutation(api.skills.updateSummary);
  const getReadme = useAction(api.skills.getReadme);
  const getSkillCard = useAction(api.skills.getSkillCard);
  const myPublishers = useQuery(api.publishers.listMine, me ? {} : "skip") as
    | Array<{ publisher: { _id: Id<"publishers"> }; role: string }>
    | undefined;

  const [readme, setReadme] = useState<string | null>(initialData?.readme ?? null);
  const [readmeError, setReadmeError] = useState<string | null>(initialData?.readmeError ?? null);
  const [loadedReadmeVersionId, setLoadedReadmeVersionId] = useState<Id<"skillVersions"> | null>(
    initialResult?.latestVersion?._id ?? null,
  );
  const [skillCard, setSkillCard] = useState<string | null>(null);
  const [skillCardError, setSkillCardError] = useState<string | null>(null);
  const [loadedSkillCardKey, setLoadedSkillCardKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("readme");
  const [shouldPrefetchCompare, setShouldPrefetchCompare] = useState(false);

  const isLoadingSkill = isStaff ? staffResult === undefined : result === undefined;
  const skill = result?.skill;
  const owner = result?.owner ?? null;
  const latestVersion = (result?.latestVersion ?? null) as SkillDetailVersion | null;
  // Dictionary (issue #44): resolve the skill's authoritative category slug to
  // its 中文 label. The "other" catch-all never renders a chip or drives
  // related-skill recommendations — same behavior as the pre-dictionary
  // keyword system, which had no keywords for its Other bucket.
  const skillCategories = useQuery(api.marketplaceCategories.listSkillCategoriesDictionary) as
    | Array<{ slug: string; label: string }>
    | undefined;
  const relatedCategory = useMemo(() => {
    if (!skill || !skillCategories) return null;
    const categorySlug = skill.skillCategorySlug ?? "other";
    if (categorySlug === "other") return null;
    return skillCategories.find((category) => category.slug === categorySlug) ?? null;
  }, [skill, skillCategories]);
  const shouldLoadRelatedSkills = Boolean(skill && relatedCategory);
  const relatedSkillsResult = useQuery(
    api.skills.listRelatedByCategory,
    shouldLoadRelatedSkills && skill && relatedCategory
      ? {
          skillId: skill._id,
          categorySlug: relatedCategory.slug,
          limit: 5,
        }
      : "skip",
  ) as { items: RelatedSkillEntry[] } | undefined;

  const versions = useQuery(
    api.skills.listVersions,
    skill ? { skillId: skill._id, limit: 50 } : "skip",
  ) as Doc<"skillVersions">[] | undefined;
  const shouldLoadDiffVersions = Boolean(
    skill && (activeTab === "compare" || shouldPrefetchCompare),
  );
  const diffVersions = useQuery(
    api.skills.listVersions,
    shouldLoadDiffVersions && skill ? { skillId: skill._id, limit: 200 } : "skip",
  ) as Doc<"skillVersions">[] | undefined;

  const displayedSkill = skill;

  const myManagePublisherIds = useMemo(
    () =>
      new Set(
        (Array.isArray(myPublishers) ? myPublishers : [])
          .filter((entry) => entry.role === "owner" || entry.role === "admin")
          .map((entry) => entry.publisher._id),
      ),
    [myPublishers],
  );
  const canAccessSettings =
    Boolean(me && skill && me._id === skill.ownerUserId) ||
    isStaff ||
    Boolean(skill?.ownerPublisherId && myManagePublisherIds.has(skill.ownerPublisherId));
  const ownedSkills = useQuery(
    api.skills.list,
    canAccessSettings && skill
      ? skill.ownerPublisherId
        ? { ownerPublisherId: skill.ownerPublisherId, limit: 100 }
        : { ownerUserId: skill.ownerUserId, limit: 100 }
      : "skip",
  ) as Array<{ _id: Id<"skills">; slug: string; displayName: string }> | undefined;
  const ownerHandle = owner?.handle ?? null;
  const ownerParam = ownerHandle?.trim().toLowerCase() || (owner?._id ? String(owner._id) : null);
  const settingsHref =
    canAccessSettings && skill
      ? `${buildSkillHref(ownerHandle, owner?._id ?? null, skill.slug)}/settings`
      : null;
  const newVersionHref =
    canAccessSettings && skill
      ? `/skills/publish?${new URLSearchParams({
          updateSlug: skill.slug,
          ...(ownerHandle ? { ownerHandle } : {}),
        }).toString()}`
      : null;
  const canonicalOwnerParam =
    typeof canonicalOwner === "string" ? canonicalOwner.trim().toLowerCase() : null;
  const wantsCanonicalRedirect = Boolean(
    ownerParam &&
    ((result?.resolvedSlug && result.resolvedSlug !== slug) ||
      redirectToCanonical ||
      (canonicalOwnerParam && canonicalOwnerParam !== ownerParam)),
  );
  const redirectSlug = result?.resolvedSlug ?? skill?.slug ?? slug;

  const forkOf = result?.forkOf ?? null;
  const canonical = result?.canonical ?? null;
  const modInfo = result?.moderationInfo ?? null;
  const suppressVersionScanResults =
    !isStaff &&
    Boolean(modInfo?.overrideActive) &&
    !modInfo?.isMalwareBlocked &&
    !modInfo?.isSuspicious;
  const scanResultsSuppressedMessage = suppressVersionScanResults
    ? "这些发布版本上的安全发现已由工作人员复核并确认可公开使用。"
    : null;
  const forkOfLabel = forkOf?.kind === "duplicate" ? "复制自" : "fork 自";
  const forkOfOwnerHandle = forkOf?.owner?.handle ?? null;
  const forkOfOwnerId = forkOf?.owner?.userId ?? null;
  const canonicalOwnerHandle = canonical?.owner?.handle ?? null;
  const canonicalOwnerId = canonical?.owner?.userId ?? null;
  const forkOfHref = forkOf?.skill?.slug
    ? buildSkillHref(forkOfOwnerHandle, forkOfOwnerId, forkOf.skill.slug)
    : null;
  const canonicalHref =
    canonical?.skill?.slug && canonical.skill.slug !== forkOf?.skill?.slug
      ? buildSkillHref(canonicalOwnerHandle, canonicalOwnerId, canonical.skill.slug)
      : null;

  const staffSkill = isStaff && skill ? (skill as Doc<"skills">) : null;
  const moderationStatus =
    staffSkill?.moderationStatus ?? (staffSkill?.softDeletedAt ? "hidden" : undefined);
  const isHidden = moderationStatus === "hidden" || Boolean(staffSkill?.softDeletedAt);
  const isRemoved = moderationStatus === "removed";
  const isAutoHidden = isHidden && staffSkill?.moderationReason === "auto.reports";
  const staffVisibilityTag = isRemoved
    ? "已移除"
    : isAutoHidden
      ? "自动隐藏"
      : isHidden
        ? "已隐藏"
        : null;
  const staffModerationNote = staffVisibilityTag
    ? buildStaffVisibilityAlert({
        artifactKind: "skill",
        moderationReason: staffSkill?.moderationReason,
        moderationNote: staffSkill?.moderationNotes?.trim(),
        isAutoHidden,
        isRemoved,
        isSoftDeleted: Boolean(staffSkill?.softDeletedAt),
        modInfo,
      })
    : null;

  const latestVersionId = latestVersion?._id ?? null;

  const clawdis = (latestVersion?.parsed as { clawdis?: ClawdisSkillMetadata } | undefined)
    ?.clawdis;
  const osLabels = useMemo(() => formatOsList(clawdis?.os), [clawdis?.os]);
  const nixPlugin = clawdis?.nix?.plugin;
  const nixSnippet = nixPlugin ? formatNixInstallSnippet(nixPlugin) : null;
  const configRequirements = clawdis?.config;
  const configExample = configRequirements?.example
    ? formatConfigSnippet(configRequirements.example)
    : null;
  const cliHelp = clawdis?.cliHelp;
  const hasPluginBundle = Boolean(nixSnippet || configRequirements || cliHelp);
  const githubBackedFields = skill as GitHubBackedSkillFields | null | undefined;
  const isGitHubBackedSkill = githubBackedFields?.installKind === "github" && !latestVersionId;
  const githubReadme = useQuery(
    api.skills.getGitHubSkillContent,
    isGitHubBackedSkill && skill ? { skillId: skill._id, kind: "readme" } : "skip",
  ) as { path: string; text: string; sourceBaseUrl?: string } | null | undefined;
  const githubSkillCard = useQuery(
    api.skills.getGitHubSkillContent,
    isGitHubBackedSkill && skill && githubBackedFields?.githubHasSkillCard !== false
      ? { skillId: skill._id, kind: "skill-card" }
      : "skip",
  ) as { path: string; text: string; sourceBaseUrl?: string } | null | undefined;
  const githubSourceBaseUrl = githubReadme?.sourceBaseUrl ?? githubSkillCard?.sourceBaseUrl;
  const readmeHrefResolver = useMemo(() => {
    if (!isGitHubBackedSkill || !githubSourceBaseUrl) return undefined;
    return (href: string) => resolveGitHubSkillReadmeHref(href, githubSourceBaseUrl);
  }, [githubSourceBaseUrl, isGitHubBackedSkill]);
  const displayedReadme = isGitHubBackedSkill ? (githubReadme?.text ?? null) : readme;
  const displayedReadmeError = isGitHubBackedSkill
    ? githubReadme === null
      ? "暂无 SKILL.md"
      : null
    : readmeError;

  const readmeContent = useMemo(() => {
    if (!displayedReadme) return null;
    return stripFrontmatter(displayedReadme);
  }, [displayedReadme]);
  const latestFiles: SkillFile[] = latestVersion?.files ?? [];
  const skillCardFile = useMemo(
    () => latestVersion?.generatedSkillCard ?? null,
    [latestVersion?.generatedSkillCard],
  );
  const hasArchiveSkillCard = Boolean(skillCardFile);
  const hasSkillCard = hasArchiveSkillCard || Boolean(githubSkillCard);
  const displayedSkillCard = isGitHubBackedSkill ? (githubSkillCard?.text ?? null) : skillCard;
  const displayedSkillCardError = isGitHubBackedSkill
    ? githubSkillCard === null
      ? "暂无 Skill Card"
      : null
    : skillCardError;
  const currentSkillCardKey = useMemo(
    () => skillCardLoadKey(latestVersionId, skillCardFile),
    [latestVersionId, skillCardFile],
  );

  useEffect(() => {
    if (!wantsCanonicalRedirect || !ownerParam || !redirectSlug) return;
    const params = { owner: ownerParam, slug: redirectSlug };
    if (mode === "settings") {
      void navigate({
        to: "/$owner/$slug/settings",
        params,
        replace: true,
      });
      return;
    }
    void navigate({
      to: "/$owner/$slug",
      params,
      replace: true,
    });
  }, [mode, navigate, ownerParam, redirectSlug, wantsCanonicalRedirect]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncTabFromHash = () => {
      setActiveTab(tabFromHash(window.location.hash));
    };
    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);
    return () => {
      window.removeEventListener("hashchange", syncTabFromHash);
    };
  }, []);

  // Set of tab IDs that are currently rendered — used to validate hash-driven
  // navigation so stale bookmarks fall back to readme rather than leaving the
  // content pane blank.
  const validTabIds = useMemo<Set<DetailTab>>(() => {
    const installTabs = buildSkillInstallTabs({ clawdis, osLabels });
    const baseTabs: DetailTab[] = isGitHubBackedSkill
      ? ["readme"]
      : ["readme", "files", "versions"];
    if (hasSkillCard) baseTabs.splice(1, 0, "skill-card");
    if (!isGitHubBackedSkill && (versions?.length ?? 0) > 1) baseTabs.push("compare");
    return new Set([...baseTabs, ...installTabs.map((t) => t.id)]);
  }, [clawdis, hasSkillCard, isGitHubBackedSkill, osLabels, versions]);

  useEffect(() => {
    setActiveTab((prev) => {
      const hashTab = typeof window === "undefined" ? "readme" : tabFromHash(window.location.hash);
      if (hashTab !== "readme" && validTabIds.has(hashTab)) return hashTab;
      return validTabIds.has(prev) ? prev : "readme";
    });
  }, [validTabIds]);

  useEffect(() => {
    let cancelled = false;
    if (!skill) {
      return () => {
        cancelled = true;
      };
    }
    if (!latestVersionId) {
      setReadme(null);
      setReadmeError(isGitHubBackedSkill ? null : "暂无 SKILL.md");
      setLoadedReadmeVersionId(null);
      return () => {
        cancelled = true;
      };
    }
    if (
      latestVersionId &&
      !(loadedReadmeVersionId === latestVersionId && (readme !== null || readmeError !== null))
    ) {
      setReadme(null);
      setReadmeError(null);
      setLoadedReadmeVersionId(latestVersionId);

      void getReadme({ versionId: latestVersionId })
        .then((data) => {
          if (cancelled) return;
          setReadme(data.text);
          setLoadedReadmeVersionId(latestVersionId);
        })
        .catch((error) => {
          if (cancelled) return;
          setReadmeError(error instanceof Error ? error.message : "加载 README 失败");
          setReadme(null);
          setLoadedReadmeVersionId(latestVersionId);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    getReadme,
    isGitHubBackedSkill,
    latestVersionId,
    loadedReadmeVersionId,
    readme,
    readmeError,
    skill,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!latestVersionId || !hasArchiveSkillCard || !currentSkillCardKey) {
      setSkillCard(null);
      setSkillCardError(null);
      setLoadedSkillCardKey(currentSkillCardKey);
      return () => {
        cancelled = true;
      };
    }
    if (
      loadedSkillCardKey === currentSkillCardKey &&
      (skillCard !== null || skillCardError !== null)
    ) {
      return () => {
        cancelled = true;
      };
    }

    setSkillCard(null);
    setSkillCardError(null);
    setLoadedSkillCardKey(currentSkillCardKey);
    void getSkillCard({ versionId: latestVersionId })
      .then((data) => {
        if (cancelled) return;
        setSkillCard(data.text);
        setLoadedSkillCardKey(currentSkillCardKey);
      })
      .catch((error) => {
        if (cancelled) return;
        setSkillCardError(error instanceof Error ? error.message : "加载 Skill Card 失败");
        setSkillCard(null);
        setLoadedSkillCardKey(currentSkillCardKey);
      });

    return () => {
      cancelled = true;
    };
  }, [
    getSkillCard,
    currentSkillCardKey,
    hasArchiveSkillCard,
    latestVersionId,
    loadedSkillCardKey,
    skillCard,
    skillCardError,
  ]);

  const submitSummary = async (value: string) => {
    if (!skill) return;
    const nextSummary = value.trim();
    if (nextSummary === (skill.summary ?? "").trim()) {
      return;
    }
    try {
      await updateSummary({
        skillId: skill._id,
        summary: nextSummary,
      });
      toast.success("简介已更新。");
    } catch (error) {
      console.error("Failed to update summary", error);
      toast.error(getUserFacingConvexError(error, "更新简介失败。"));
    }
  };


  if (isLoadingSkill || wantsCanonicalRedirect) {
    return (
      <main className="section detail-page-section" aria-busy="true">
        <div role="status" aria-label="正在加载 Skill 详情">
          <SkillDetailSkeleton />
        </div>
      </main>
    );
  }

  if (result === null || !skill || !displayedSkill) {
    return <GenericNotFoundPage />;
  }

  const githubScanStatus =
    !latestVersion && (displayedSkill as GitHubBackedSkillFields).installKind === "github"
      ? (displayedSkill as GitHubBackedSkillFields).githubScanStatus
      : null;
  const securitySummary =
    latestVersion || githubScanStatus ? (
      <DetailSecuritySummary
        auditHref={`/${encodeURIComponent(ownerParam ?? ownerHandle ?? "unknown")}/${encodeURIComponent(
          skill.slug,
        )}/security-audit`}
        vtAnalysis={latestVersion?.vtAnalysis ?? null}
        llmAnalysis={latestVersion?.llmAnalysis ?? null}
        githubScanStatus={githubScanStatus}
        suppressScanResults={suppressVersionScanResults}
      />
    ) : null;
  const staffVisibilityAlert = staffModerationNote ? (
    <Alert variant="warn" className="skill-visibility-alert" role="status">
      <TriangleAlert size={18} aria-hidden="true" />
      <AlertDescription>{staffModerationNote}</AlertDescription>
    </Alert>
  ) : null;
  const settingsPanel =
    canAccessSettings && skill ? (
      <SkillOwnershipPanel
        skillId={skill._id}
        slug={skill.slug}
        ownerHandle={ownerHandle}
        ownerId={owner?._id ?? null}
        ownedSkills={(ownedSkills ?? []).filter((entry) => entry._id !== skill._id)}
        summary={skill.summary ?? ""}
        onSaveSummary={canAccessSettings ? submitSummary : null}
      />
    ) : null;

  if (mode === "settings") {
    const detailHref = buildSkillHref(ownerHandle, owner?._id ?? null, skill.slug);

    return (
      <main className="section detail-page-section">
        <DetailPageShell className="skill-settings-page">
          <div className="skill-settings-page-header">
            <a href={detailHref} className="skill-settings-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              返回 {skill.displayName}
            </a>
            <div className="skill-settings-page-title-row">
              <h1 className="skill-settings-page-title">Skill 设置</h1>
              {newVersionHref ? (
                <Button asChild variant="outline" className="skill-settings-new-version-button">
                  <a href={newVersionHref}>
                    <Upload size={14} aria-hidden="true" />
                    更新 Skill 文件
                  </a>
                </Button>
              ) : null}
            </div>
            <hr className="skill-settings-page-divider" />
          </div>
          <DetailBody>
            {settingsPanel ? (
              settingsPanel
            ) : (
              <Card>
                <h2 className="section-title text-[1.2rem] m-0">设置不可用</h2>
                <p className="section-subtitle mt-3 mb-0">
                  只有该 Skill 的所有者、所属组织管理员或平台工作人员可以管理这些设置。
                </p>
              </Card>
            )}
          </DetailBody>
        </DetailPageShell>
      </main>
    );
  }

  return (
    <main className="section detail-page-section">
      <DetailPageShell>
        <SkillHeader
          skill={displayedSkill}
          owner={owner}
          ownerHandle={ownerHandle}
          latestVersion={latestVersion}
          modInfo={modInfo}
          isStaff={isStaff}
          forkOf={forkOf}
          forkOfLabel={forkOfLabel}
          forkOfHref={forkOfHref}
          forkOfOwnerHandle={forkOfOwnerHandle}
          canonical={canonical}
          canonicalHref={canonicalHref}
          canonicalOwnerHandle={canonicalOwnerHandle}
          staffVisibilityTag={staffVisibilityTag}
          isAutoHidden={isAutoHidden}
          isRemoved={isRemoved}
          nixPlugin={nixPlugin}
          hasPluginBundle={hasPluginBundle}
          configRequirements={configRequirements}
          cliHelp={cliHelp}
          clawdis={clawdis}
          category={relatedCategory}
          priorityContent={staffVisibilityAlert}
          securityAuditSummary={securitySummary}
          newVersionHref={newVersionHref}
          settingsHref={settingsHref}
          showArchiveMetadata={!isGitHubBackedSkill}
        >
          {nixSnippet ? (
            <Card>
              <h3 className="m-0 text-[length:var(--text-base)] font-semibold">通过 Nix 安装</h3>
              <pre className="hero-install-code mt-2">{nixSnippet}</pre>
            </Card>
          ) : null}

          {configExample ? (
            <Card>
              <h3 className="m-0 text-[length:var(--text-base)] font-semibold">配置示例</h3>
              <pre className="hero-install-code mt-2">{configExample}</pre>
            </Card>
          ) : null}

          <SkillDetailTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onCompareIntent={() => setShouldPrefetchCompare(true)}
            readmeContent={readmeContent}
            readmeError={displayedReadmeError}
            skillCardContent={displayedSkillCard}
            skillCardError={displayedSkillCardError}
            hasSkillCard={hasSkillCard}
            latestFiles={latestFiles}
            latestVersionId={latestVersion?._id ?? null}
            skill={skill as Doc<"skills">}
            diffVersions={diffVersions}
            versions={versions}
            nixPlugin={Boolean(nixPlugin)}
            showArchiveTabs={!isGitHubBackedSkill}
            suppressVersionScanResults={suppressVersionScanResults}
            scanResultsSuppressedMessage={scanResultsSuppressedMessage}
            clawdis={clawdis}
            osLabels={osLabels}
            readmeHrefResolver={readmeHrefResolver}
          />

          <SkillRelatedSection
            category={relatedCategory}
            relatedSkills={relatedSkillsResult?.items ?? []}
            isLoading={shouldLoadRelatedSkills && relatedSkillsResult === undefined}
          />
        </SkillHeader>
      </DetailPageShell>
    </main>
  );
}
