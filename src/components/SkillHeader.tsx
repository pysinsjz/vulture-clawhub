import { Link } from "@tanstack/react-router";
import type { ClawdisSkillMetadata } from "clawhub-schema";
import { PLATFORM_SKILL_LICENSE } from "clawhub-schema/licenseConstants";
import { Download, Settings, ShieldCheck, Upload } from "lucide-react";
import type { ReactNode } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { getSkillBadges } from "../lib/badges";
import { buildSkillCategoryBrowseHref, type CategoryRef } from "../lib/categories";
import { formatSkillStatsTriplet } from "../lib/numberFormat";
import type { PublicPublisher, PublicSkill } from "../lib/publicUser";
import { getRuntimeEnv } from "../lib/runtimeEnv";
import { timeAgo } from "../lib/timeAgo";
import { ApiKeyRequiredBadge } from "./ApiKeyRequiredBadge";
import { DetailHero } from "./DetailPageShell";
import { DetailSecuritySummaryLabel } from "./DetailSecuritySummary";
import { OfficialTag } from "./OfficialBadge";
import { SidebarMetadata } from "./SidebarMetadata";
import { buildSkillHref } from "./skillDetailUtils";
import { SkillCommandLineCard } from "./SkillInstallSurface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { UserBadge } from "./UserBadge";

type SkillModerationInfo = {
  isPendingScan: boolean;
  isMalwareBlocked: boolean;
  isSuspicious: boolean;
  isHiddenByMod: boolean;
  isRemoved: boolean;
  overrideActive?: boolean;
  verdict?: "clean" | "suspicious" | "malicious";
  reason?: string;
};

type SkillFork = {
  kind: "fork" | "duplicate";
  version: string | null;
  skill: { slug: string; displayName: string };
  owner: { handle: string | null; userId: Id<"users"> | null };
};

type SkillCanonical = {
  skill: { slug: string; displayName: string };
  owner: { handle: string | null; userId: Id<"users"> | null };
};

type SkillHeaderLatestVersion =
  | (Omit<Doc<"skillVersions">, "parsed"> & {
      parsed?: (Partial<Doc<"skillVersions">["parsed"]> & { description?: string }) | null;
    })
  | null;

function getLatestVersionDescription(latestVersion: SkillHeaderLatestVersion) {
  const parsed = latestVersion?.parsed;
  const description =
    typeof parsed?.description === "string"
      ? parsed.description
      : typeof parsed?.frontmatter?.description === "string"
        ? parsed.frontmatter.description
        : null;
  return description?.trim() || null;
}

function getGitHubRepositoryLink(skill: Doc<"skills"> | PublicSkill) {
  const repo = "githubSourceRepo" in skill ? skill.githubSourceRepo : undefined;
  if (skill.installKind !== "github" || !repo) return null;

  return (
    <a
      href={`https://github.com/${repo}`}
      target="_blank"
      rel="noopener noreferrer"
      className="plugin-external-link"
    >
      {repo}
    </a>
  );
}

type SkillHeaderProps = {
  skill: Doc<"skills"> | PublicSkill;
  owner: PublicPublisher | null;
  ownerHandle: string | null;
  latestVersion: SkillHeaderLatestVersion;
  modInfo: SkillModerationInfo | null;
  isStaff: boolean;
  forkOf: SkillFork | null;
  forkOfLabel: string;
  forkOfHref: string | null;
  forkOfOwnerHandle: string | null;
  canonical: SkillCanonical | null;
  canonicalHref: string | null;
  canonicalOwnerHandle: string | null;
  staffVisibilityTag: string | null;
  isAutoHidden: boolean;
  isRemoved: boolean;
  nixPlugin: string | undefined;
  hasPluginBundle: boolean;
  configRequirements: ClawdisSkillMetadata["config"] | undefined;
  cliHelp: string | undefined;
  clawdis: ClawdisSkillMetadata | undefined;
  category?: CategoryRef | null;
  priorityContent?: ReactNode;
  postInstallContent?: ReactNode;
  securityAuditSummary?: ReactNode;
  newVersionHref?: string | null;
  settingsHref?: string | null;
  showArchiveMetadata?: boolean;
  children?: ReactNode;
};

export function SkillHeader({
  skill,
  owner,
  ownerHandle,
  latestVersion,
  modInfo,
  isStaff,
  forkOf,
  forkOfLabel,
  forkOfHref,
  forkOfOwnerHandle,
  canonical,
  canonicalHref,
  canonicalOwnerHandle,
  nixPlugin,
  hasPluginBundle,
  configRequirements,
  cliHelp,
  clawdis,
  category,
  priorityContent,
  postInstallContent,
  securityAuditSummary,
  newVersionHref,
  settingsHref,
  showArchiveMetadata = true,
  children,
}: SkillHeaderProps) {
  const formattedStats = formatSkillStatsTriplet(skill.stats);
  const installOwnerId = owner?._id ?? skill.ownerPublisherId ?? skill.ownerUserId ?? null;
  const convexSiteUrl = getRuntimeEnv("VITE_CONVEX_SITE_URL") ?? "https://clawhub.ai";
  const downloadHref =
    latestVersion && !nixPlugin
      ? `${convexSiteUrl}/api/v1/download?slug=${encodeURIComponent(skill.slug)}`
      : null;
  const hasTitleActions = isStaff;
  const hasSidebarActions =
    Boolean(downloadHref) || Boolean(newVersionHref) || Boolean(settingsHref) || hasTitleActions;
  const badges = getSkillBadges(skill);
  const isOfficial = badges.includes("Official") || owner?.official === true;
  const titleBadges = badges.filter((badge) => badge !== "Official");
  const showHeroMeta = Boolean((forkOf && forkOfHref) || canonicalHref);
  const showTitleBadges = titleBadges.length > 0;
  const headerDescription =
    getLatestVersionDescription(latestVersion) ?? skill.summary ?? "暂无摘要";

  return (
    <>
      {modInfo?.isPendingScan ? (
        <div className="pending-banner">
          <div className="pending-banner-content">
            <strong>安全扫描进行中</strong>
            <p>
              你的 Skill 正在由 VirusTotal 扫描，扫描完成后才会对他人可见，通常最多需要 5 分钟。
            </p>
          </div>
        </div>
      ) : modInfo?.isRemoved ? (
        <div className="pending-banner pending-banner-blocked">
          <div className="pending-banner-content">
            <strong>Skill 已被管理员移除</strong>
            <p>该 Skill 已被移除，对他人不可见。</p>
          </div>
        </div>
      ) : modInfo?.isHiddenByMod ? (
        <div className="pending-banner pending-banner-blocked">
          <div className="pending-banner-content">
            <strong>Skill 已隐藏</strong>
            <p>该 Skill 当前已隐藏，对他人不可见。</p>
          </div>
        </div>
      ) : null}

      <DetailHero
        topClassName={hasPluginBundle ? "has-plugin" : undefined}
        sidebar={
          <div className="skill-hero-sidebar-stack">
            <SkillSidebarStats
              skill={skill}
              owner={owner}
              ownerHandle={ownerHandle}
              formattedStats={formattedStats}
              latestVersion={latestVersion}
              showArchiveMetadata={showArchiveMetadata}
              securityAuditSummary={securityAuditSummary}
            />
            {hasSidebarActions ? (
              <div className="skill-sidebar-actions">
                {downloadHref ? (
                  <Button asChild variant="outline" className="skill-sidebar-action-button">
                    <a href={downloadHref}>
                      <Download size={14} aria-hidden="true" />
                      下载
                    </a>
                  </Button>
                ) : null}
                {newVersionHref ? (
                  <Button asChild variant="outline" className="skill-sidebar-action-button">
                    <a href={newVersionHref}>
                      <Upload size={14} aria-hidden="true" />
                      新版本
                    </a>
                  </Button>
                ) : null}
                {settingsHref ? (
                  <Button asChild variant="outline" className="skill-sidebar-action-button">
                    <a href={settingsHref}>
                      <Settings size={14} aria-hidden="true" />
                      设置
                    </a>
                  </Button>
                ) : null}
                {hasTitleActions ? (
                  <>
                    {isStaff ? (
                      <Button asChild variant="outline" className="skill-sidebar-action-button">
                        <Link to="/management" search={{ skill: skill.slug, plugin: undefined }}>
                          <ShieldCheck size={14} aria-hidden="true" />
                          管理
                        </Link>
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        }
        main={
          <>
            <div className="skill-hero-title">
              <nav className="skill-hero-breadcrumbs" aria-label="Skill 面包屑">
                <a href="/skills">skills</a>
                <span aria-hidden="true">/</span>
                <a href={ownerHandle ? `/user/${encodeURIComponent(ownerHandle)}` : "#"}>
                  {ownerHandle ?? owner?.displayName ?? owner?._id ?? "未知"}
                </a>
                <span aria-hidden="true">/</span>
                <a href={buildSkillHref(ownerHandle, owner?._id ?? null, skill.slug)}>
                  {skill.slug}
                </a>
              </nav>
              <div className="skill-hero-heading-stack">
                <div className="skill-hero-title-row">
                  <h1 className="skill-page-title">{skill.displayName}</h1>
                  {isOfficial ? <OfficialTag /> : null}
                  {showTitleBadges ? (
                    <div className="skill-title-badges">
                      {titleBadges.map((badge) => (
                        <Badge key={badge} variant="compact">
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {nixPlugin ? <Badge variant="accent">Plugin 包 (nix)</Badge> : null}
                  <ApiKeyRequiredBadge apiKeyRequired={latestVersion?.apiKeyRequired} />
                </div>
                {category ? (
                  <a
                    className="skill-category-chip"
                    href={buildSkillCategoryBrowseHref(category)}
                    aria-label={`查看 ${category.label} 分类的 Skill`}
                  >
                    {category.label}
                  </a>
                ) : null}
              </div>
              <div className="skill-summary-block">
                <p className="section-subtitle skill-summary-line">{headerDescription}</p>
              </div>

              {nixPlugin ? (
                <div className="skill-hero-note">
                  用一次 Nix 安装打包 Skill 包、CLI 二进制与配置要求。
                </div>
              ) : null}

              {showHeroMeta ? (
                <div className="skill-hero-meta-row">
                  {forkOf && forkOfHref ? (
                    <span className="stat">
                      {forkOfLabel}{" "}
                      <a href={forkOfHref}>
                        {forkOfOwnerHandle ? `@${forkOfOwnerHandle}/` : ""}
                        {forkOf.skill.slug}
                      </a>
                      {forkOf.version ? ` (${forkOf.version})` : null}
                    </span>
                  ) : null}
                  {canonicalHref ? (
                    <>
                      {forkOf && forkOfHref ? (
                        <span className="text-ink-soft opacity-40">·</span>
                      ) : null}
                      <span className="stat">
                        规范版本：{" "}
                        <a href={canonicalHref}>
                          {canonicalOwnerHandle ? `@${canonicalOwnerHandle}/` : ""}
                          {canonical?.skill?.slug}
                        </a>
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        }
      >
        {priorityContent}

        <SkillCommandLineCard
          slug={skill.slug}
          displayName={skill.displayName}
          ownerHandle={ownerHandle}
          ownerId={installOwnerId}
          clawdis={clawdis}
        />

        {postInstallContent}

        {children}

        {hasPluginBundle ? (
          <div className="skill-panel bundle-card">
            <div className="bundle-header">
              <div className="bundle-title">Plugin 包 (nix)</div>
              <div className="bundle-subtitle">Skill 包 · CLI 二进制 · 配置</div>
            </div>
            <div className="bundle-includes">
              <span>SKILL.md</span>
              <span>CLI</span>
              <span>配置</span>
            </div>
            {configRequirements ? (
              <div className="bundle-section">
                <div className="bundle-section-title">配置要求</div>
                <div className="bundle-meta">
                  {configRequirements.requiredEnv?.length ? (
                    <div className="stat">
                      <strong>必需环境变量</strong>
                      <span>{configRequirements.requiredEnv.join(", ")}</span>
                    </div>
                  ) : null}
                  {configRequirements.stateDirs?.length ? (
                    <div className="stat">
                      <strong>状态目录</strong>
                      <span>{configRequirements.stateDirs.join(", ")}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {cliHelp ? (
              <details className="bundle-section bundle-details">
                <summary>CLI 帮助（来自 plugin）</summary>
                <pre className="hero-install-code mono">{cliHelp}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </DetailHero>
    </>
  );
}

function SkillSidebarStats({
  skill,
  owner,
  ownerHandle,
  formattedStats,
  latestVersion,
  showArchiveMetadata,
  securityAuditSummary,
}: {
  skill: Doc<"skills"> | PublicSkill;
  owner: PublicPublisher | null;
  ownerHandle: string | null;
  formattedStats: ReturnType<typeof formatSkillStatsTriplet>;
  latestVersion: SkillHeaderLatestVersion;
  showArchiveMetadata: boolean;
  securityAuditSummary?: ReactNode;
}) {
  const githubRepositoryLink = getGitHubRepositoryLink(skill);

  return (
    <SidebarMetadata
      ariaLabel="Skill 元数据"
      density="compact"
      blocks={[
        { label: "下载量", value: formattedStats.downloads, large: true },
        { label: "仓库", value: githubRepositoryLink },
        {
          label: "发布者",
          value: (
            <UserBadge
              user={owner}
              fallbackHandle={ownerHandle}
              prefix=""
              size="md"
              showName
              showHandle={false}
              disableTooltip
            />
          ),
        },
        securityAuditSummary
          ? {
              key: "security-audit",
              label: <DetailSecuritySummaryLabel />,
              value: securityAuditSummary,
            }
          : { label: "", value: null },
        { label: "最近更新", value: timeAgo(skill.updatedAt) },
        ...(showArchiveMetadata
          ? [
              {
                grid: [
                  {
                    label: "当前版本",
                    value: latestVersion?.version ? `v${latestVersion.version}` : "无",
                  },
                  { label: "许可证", value: PLATFORM_SKILL_LICENSE },
                ],
              },
            ]
          : []),
      ]}
    />
  );
}
