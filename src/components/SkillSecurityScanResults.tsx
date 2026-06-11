import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge, type BadgeProps } from "./ui/badge";

type LlmAnalysisDimension = {
  name: string;
  label: string;
  rating: string;
  detail: string;
};

type AgenticRiskStatus = "none" | "note" | "concern";
type ClawScanRiskBucket =
  | "abnormal_behavior_control"
  | "permission_boundary"
  | "sensitive_data_protection";

type LlmAgenticRiskEvidence = {
  path: string;
  snippet: string;
  explanation: string;
};

type LlmAgenticRiskFinding = {
  categoryId: string;
  categoryLabel: string;
  riskBucket: ClawScanRiskBucket;
  status: AgenticRiskStatus;
  severity: string;
  confidence: string;
  evidence?: LlmAgenticRiskEvidence;
  userImpact: string;
  recommendation: string;
};

type LlmRiskSummaryBucket = {
  status: AgenticRiskStatus;
  summary: string;
  highestSeverity?: string;
};

type LlmRiskSummary = Record<ClawScanRiskBucket, LlmRiskSummaryBucket>;

const SKILL_CAPABILITY_LABELS: Record<string, string> = {
  crypto: "加密货币",
  "financial-authority": "财务权限",
  "requires-wallet": "需要钱包",
  "can-make-purchases": "可进行购买",
  "can-sign-transactions": "可签署交易",
  "requires-paid-service": "需要付费服务",
  "requires-oauth-token": "需要 OAuth 令牌",
  "requires-sensitive-credentials": "需要敏感凭证",
  "posts-externally": "对外发布",
};

export type VtAnalysis = {
  status: string;
  verdict?: string;
  analysis?: string;
  source?: string;
  scanner?: string;
  engineStats?: {
    malicious?: number;
    suspicious?: number;
    harmless?: number;
    undetected?: number;
  };
  metadata?: {
    stats?: {
      malicious?: number;
      suspicious?: number;
      harmless?: number;
      undetected?: number;
    };
  };
  checkedAt: number;
};

export type LlmAnalysis = {
  status: string;
  verdict?: string;
  confidence?: string;
  summary?: string;
  dimensions?: LlmAnalysisDimension[];
  guidance?: string;
  findings?: string;
  agenticRiskFindings?: LlmAgenticRiskFinding[];
  riskSummary?: LlmRiskSummary;
  model?: string;
  checkedAt: number;
};

export type SkillSpectorIssue = {
  issueId: string;
  category?: string;
  pattern?: string;
  severity: string;
  confidence?: number;
  file?: string;
  startLine?: number;
  endLine?: number;
  explanation: string;
  remediation?: string;
  finding?: string;
  codeSnippet?: string;
};

export type SkillSpectorAnalysis = {
  status: string;
  score?: number;
  severity?: string;
  recommendation?: string;
  issueCount: number;
  issues: SkillSpectorIssue[];
  scannerVersion?: string;
  summary?: string;
  error?: string;
  checkedAt: number;
};

type StaticFinding = {
  code: string;
  severity: string;
  file: string;
  line: number;
  message: string;
  evidence: string;
};

type SecurityScanResultsProps = {
  sha256hash?: string;
  vtAnalysis?: VtAnalysis | null;
  llmAnalysis?: LlmAnalysis | null;
  staticFindings?: StaticFinding[];
  capabilityTags?: string[] | null;
  variant?: "panel" | "badge";
};

function VirusTotalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 89"
      aria-label="VirusTotal"
    >
      <title>VirusTotal</title>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M45.292 44.5 0 89h100V0H0l45.292 44.5zM90 80H22l35.987-35.2L22 9h68v71z"
      />
    </svg>
  );
}

function ClawScanIcon({ className }: { className?: string }) {
  return <ShieldCheck className={className} aria-label="ClawScan" />;
}

export function getScanStatusInfo(status: string) {
  switch (status.toLowerCase()) {
    case "benign":
    case "clean":
    case "undetected-only-fallback":
      return { label: "通过", className: "scan-status-clean", badgeVariant: "success" };
    case "cleared":
      return { label: "已放行", className: "scan-status-clean", badgeVariant: "success" };
    case "malicious":
      return {
        label: "恶意",
        className: "scan-status-malicious",
        badgeVariant: "destructive",
      };
    case "review":
      return { label: "待复核", className: "scan-status-review", badgeVariant: "review" };
    case "warn":
    case "warning":
    case "suspicious":
      return { label: "警告", className: "scan-status-warn", badgeVariant: "warning" };
    case "advisory":
      return { label: "提示", className: "scan-status-unknown", badgeVariant: "compact" };
    case "loading":
      return { label: "加载中…", className: "scan-status-pending", badgeVariant: "pending" };
    case "pending":
    case "not_found":
      return { label: "待检测", className: "scan-status-pending", badgeVariant: "pending" };
    case "error":
    case "failed":
      return { label: "错误", className: "scan-status-error", badgeVariant: "destructive" };
    default:
      return { label: status, className: "scan-status-unknown", badgeVariant: "default" };
  }
}

function severityRank(severity?: string) {
  switch (severity?.trim().toLowerCase()) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

function isLowConfidence(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase() === "low";
}

function isVisibleAgenticRiskFinding(finding: LlmAgenticRiskFinding) {
  return (
    (finding.status === "note" || finding.status === "concern") &&
    Boolean(finding.evidence) &&
    !isLowConfidence(finding.confidence)
  );
}

function highestVisibleFindingSeverityRank(analysis?: LlmAnalysis | null) {
  let highest = 0;
  for (const finding of getVisibleAgenticRiskFindings(analysis)) {
    highest = Math.max(highest, severityRank(finding.severity));
  }
  return highest;
}

export function getClawScanDisplayStatus(analysis?: LlmAnalysis | null) {
  const status = (analysis?.verdict ?? analysis?.status)?.trim().toLowerCase();
  if (!status) return "pending";
  const highestSeverity = highestVisibleFindingSeverityRank(analysis);
  if (status === "suspicious") {
    return highestSeverity >= severityRank("high") ? "warn" : "review";
  }
  if ((status === "clean" || status === "benign") && highestSeverity >= severityRank("medium")) {
    return "review";
  }
  return status;
}

function getVtEngineStats(analysis?: VtAnalysis | null) {
  return analysis?.engineStats ?? analysis?.metadata?.stats;
}

function hasNonEngineVirusTotalSource(analysis?: VtAnalysis | null) {
  if (!analysis) return false;
  const source = analysis.source?.trim().toLowerCase();
  const scanner = analysis.scanner?.trim().toLowerCase();
  return Boolean(
    (source && !source.startsWith("engines")) || (scanner && !scanner.startsWith("engines")),
  );
}

export function getVirusTotalDisplayStatus(analysis?: VtAnalysis | null) {
  const stats = getVtEngineStats(analysis);
  if (stats) {
    if ((stats.malicious ?? 0) > 0) return "malicious";
    if ((stats.suspicious ?? 0) > 0) return "suspicious";
    return "benign";
  }

  if (hasNonEngineVirusTotalSource(analysis)) return "benign";
  if (analysis?.verdict === "undetected-only-fallback") return "benign";

  return analysis?.verdict ?? analysis?.status ?? "pending";
}

export function ScanResultBadge({
  status,
  label,
  className,
  tone,
}: {
  status: string;
  label?: string;
  className?: string;
  tone?: "review";
}) {
  const statusInfo = getScanStatusInfo(status);
  const variant =
    tone === "review" && statusInfo.label === "待复核" ? "review" : statusInfo.badgeVariant;
  return (
    <Badge
      variant={variant as BadgeProps["variant"]}
      className={`min-h-0 rounded-[4px] px-2.5 py-0.5 text-[0.78rem] leading-[1.3]${className ? ` ${className}` : ""}`}
    >
      {label ?? statusInfo.label}
    </Badge>
  );
}

function getDimensionIcon(rating: string) {
  switch (rating) {
    case "ok":
      return { className: "dimension-icon-ok", symbol: "\u2713" };
    case "note":
      return { className: "dimension-icon-note", symbol: "\u2139" };
    case "concern":
      return { className: "dimension-icon-concern", symbol: "!" };
    default:
      return { className: "dimension-icon-danger", symbol: "\u2717" };
  }
}

function getVisibleAgenticRiskFindings(analysis?: LlmAnalysis | null) {
  return (analysis?.agenticRiskFindings ?? []).filter(isVisibleAgenticRiskFinding);
}

function getVisibleClawScanFindingCount(analysis?: LlmAnalysis | null) {
  return getVisibleAgenticRiskFindings(analysis).length;
}

export function hasClawScanRiskReview(analysis?: LlmAnalysis | null) {
  if (!analysis) return false;
  return getVisibleClawScanFindingCount(analysis) > 0;
}

function getFindingSeverityBadgeMeta(severity: string): {
  label: string;
  variant: BadgeProps["variant"];
} {
  switch (severity.trim().toLowerCase()) {
    case "critical":
      return { label: "严重", variant: "destructive" };
    case "high":
      return { label: "高危", variant: "destructive" };
    case "warn":
    case "warning":
      return { label: "警告", variant: "warning" };
    case "medium":
      return { label: "中危", variant: "warning" };
    case "low":
      return { label: "低危", variant: "review" };
    case "info":
      return { label: "信息", variant: "compact" };
    default:
      return { label: severity || "发现项", variant: "compact" };
  }
}

function FindingSeverityBadge({ severity }: { severity: string }) {
  const severityBadge = getFindingSeverityBadgeMeta(severity);
  return <Badge variant={severityBadge.variant}>{severityBadge.label}</Badge>;
}

function formatSkillSpectorConfidence(confidence?: number) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  const percent = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(percent)}% 置信度`;
}

export function getSkillSpectorIssueCount(analysis?: SkillSpectorAnalysis | null) {
  if (!analysis) return 0;
  const reportedCount = Number.isFinite(analysis.issueCount) ? analysis.issueCount : 0;
  return Math.max(reportedCount, analysis.issues.length);
}

export function hasSkillSpectorFindings(analysis?: SkillSpectorAnalysis | null) {
  return getSkillSpectorIssueCount(analysis) > 0;
}

export function getSkillSpectorOverviewCopy(analysis?: SkillSpectorAnalysis | null) {
  const count = getSkillSpectorIssueCount(analysis);
  if (count > 0) return `SkillSpector 发现 ${count} 个问题。`;
  const status = analysis?.status?.trim().toLowerCase();
  if (status === "clean" || status === "benign") return "未发现 SkillSpector 问题。";
  if (status === "error" || status === "failed") return "SkillSpector 未能完成。";
  return "该版本的 SkillSpector 检查待完成。";
}

const SKILLSPECTOR_RULE_LABELS: Record<string, string> = {
  P1: "Instruction Override",
  P2: "Hidden Instructions",
  P3: "Exfiltration Commands",
  P4: "Behavior Manipulation",
  P5: "Harmful Content",
  P6: "Direct Prompt Leakage",
  P7: "Indirect Prompt Extraction",
  P8: "Tool-Based Prompt Exfiltration",
  E1: "External Transmission",
  E2: "Environment Variable Harvesting",
  E3: "File System Enumeration",
  E4: "Context Leakage",
  PE1: "Excessive Permissions",
  PE2: "Sudo/Root Execution",
  PE3: "Credential Access",
  SDI1: "Description-Behavior Mismatch",
  SDI2: "Context-Inappropriate Capability",
  SDI3: "Scope Creep",
  SDI4: "Intent-Code Divergence",
  SQP1: "Vague Triggers",
  SQP2: "Missing User Warnings",
  SQP3: "Natural-Language Policy Violations",
};

function normalizeSkillSpectorRuleId(ruleId: string) {
  return ruleId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatFallbackSkillSpectorTitle(ruleId: string) {
  return ruleId
    .trim()
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getSkillSpectorIssueTitle(issue: SkillSpectorIssue) {
  const pattern = issue.pattern?.trim();
  if (pattern) return pattern;
  const normalized = normalizeSkillSpectorRuleId(issue.issueId);
  return SKILLSPECTOR_RULE_LABELS[normalized] ?? formatFallbackSkillSpectorTitle(issue.issueId);
}

function SkillSpectorFindingCard({
  contentSnippet,
  issue,
}: {
  contentSnippet?: string | null;
  issue: SkillSpectorIssue;
}) {
  const confidence = formatSkillSpectorConfidence(issue.confidence);
  const trimmedSnippet = contentSnippet?.trim() || issue.codeSnippet?.trim();

  return (
    <article className="static-analysis-finding">
      <div className="static-analysis-finding-header">
        <h3 className="agentic-risk-finding-title">{getSkillSpectorIssueTitle(issue)}</h3>
        <div className="agentic-risk-finding-badges">
          <FindingSeverityBadge severity={issue.severity} />
        </div>
      </div>
      <dl className="static-analysis-finding-details">
        {issue.category ? (
          <div>
            <dt>类别</dt>
            <dd>{issue.category}</dd>
          </div>
        ) : null}
        {trimmedSnippet ? (
          <div>
            <dt>内容</dt>
            <dd>
              <pre className="agentic-risk-evidence-snippet">{trimmedSnippet}</pre>
            </dd>
          </div>
        ) : null}
        {confidence ? (
          <div>
            <dt>置信度</dt>
            <dd>{confidence}</dd>
          </div>
        ) : null}
        <div>
          <dt>发现</dt>
          <dd>{issue.finding || issue.explanation}</dd>
        </div>
      </dl>
    </article>
  );
}

export function SkillSpectorFindings({
  analysis,
  contentSnippets,
}: {
  analysis: SkillSpectorAnalysis;
  contentSnippets?: Record<number, string>;
}) {
  return (
    <div className="static-analysis-findings">
      {analysis.issues.map((issue, index) => (
        <SkillSpectorFindingCard
          key={`${issue.issueId}-${index}`}
          contentSnippet={contentSnippets?.[index]}
          issue={issue}
        />
      ))}
    </div>
  );
}

function slugifyFindingAnchorPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getClawScanFindingAnchorId(finding: LlmAgenticRiskFinding, index: number) {
  const slug = slugifyFindingAnchorPart(`${finding.categoryId}-${finding.categoryLabel}`);
  return `clawscan-finding-${slug || "finding"}-${index + 1}`;
}

function AgenticRiskFindingCard({
  finding,
  index,
}: {
  finding: LlmAgenticRiskFinding;
  index: number;
}) {
  const evidence = finding.evidence;
  if (!evidence) return null;
  const title = `${finding.categoryId}: ${finding.categoryLabel}`;
  const anchorId = getClawScanFindingAnchorId(finding, index);

  return (
    <div
      key={`${finding.categoryId}-${finding.riskBucket}-${index}`}
      className="agentic-risk-finding"
      id={anchorId}
    >
      <div className="agentic-risk-finding-header">
        <div className="agentic-risk-finding-title-row">
          <a
            className="agentic-risk-finding-anchor"
            href={`#${anchorId}`}
            aria-label={`链接到 ${title}`}
          >
            #
          </a>
          <div className="agentic-risk-finding-title">{title}</div>
        </div>
        <div className="agentic-risk-finding-badges">
          <FindingSeverityBadge severity={finding.severity} />
        </div>
      </div>
      <div className="agentic-risk-report-rows">
        <div className="agentic-risk-report-row">
          <div className="agentic-risk-report-label">这意味着什么</div>
          <p>{finding.userImpact ?? finding.recommendation ?? evidence.explanation}</p>
        </div>
        <div className="agentic-risk-report-row">
          <div className="agentic-risk-report-label">为何被标记</div>
          <p>{evidence.explanation}</p>
        </div>
        <div className="agentic-risk-report-row">
          <div className="agentic-risk-report-label">Skill 内容</div>
          <div className="agentic-risk-report-content">
            <pre className="agentic-risk-evidence-snippet">{evidence.snippet}</pre>
          </div>
        </div>
      </div>
      {finding.recommendation ? (
        <div className="agentic-risk-report-row agentic-risk-report-row-secondary">
          <div className="agentic-risk-report-label">建议</div>
          <p>{finding.recommendation}</p>
        </div>
      ) : null}
    </div>
  );
}

export function ClawScanRiskReview({
  analysis,
  showTitle = true,
  findingsTitle = "发现项",
}: {
  analysis: LlmAnalysis;
  showTitle?: boolean;
  findingsTitle?: string;
}) {
  const visibleFindings = getVisibleAgenticRiskFindings(analysis);
  if (visibleFindings.length === 0) return null;

  return (
    <div className="clawscan-risk-review">
      {showTitle ? <div className="scan-findings-title">{findingsTitle}</div> : null}
      <p className="clawscan-scope-note">
        基于制品的 SKILL.md、元数据、安装规格、静态扫描信号与能力信号的信息性审查。ClawScan 不会执行该 Skill，也不会运行运行时探测。
      </p>
      <div className="agentic-risk-findings">
        {visibleFindings.map((finding, index) => (
          <AgenticRiskFindingCard
            key={`${finding.categoryId}-${finding.riskBucket}-${index}`}
            finding={finding}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

function LlmAnalysisDetail({ analysis }: { analysis: LlmAnalysis }) {
  const verdict = analysis.verdict ?? analysis.status;
  const [isOpen, setIsOpen] = useState(false);

  const guidanceClass =
    verdict === "malicious" ? "malicious" : verdict === "suspicious" ? "suspicious" : "benign";

  return (
    <div className={`analysis-detail${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="analysis-detail-header"
        onClick={() => {
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
      >
        <span className="analysis-summary-text">{analysis.summary}</span>
        <span className="analysis-detail-toggle">
          详情 <span className="chevron">{"\u25BE"}</span>
        </span>
      </button>
      <div className="analysis-body">
        <ClawScanRiskReview analysis={analysis} />
        {analysis.dimensions && analysis.dimensions.length > 0 ? (
          <div className="analysis-dimensions">
            {analysis.dimensions.map((dim) => {
              const icon = getDimensionIcon(dim.rating);
              return (
                <div key={dim.name} className="dimension-row">
                  <div className={`dimension-icon ${icon.className}`}>{icon.symbol}</div>
                  <div className="dimension-content">
                    <div className="dimension-label">{dim.label}</div>
                    <div className="dimension-detail">{dim.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        {analysis.findings ? (
          <div className="scan-findings-section">
            <div className="scan-findings-title">上下文中的扫描发现</div>
            {(() => {
              const counts = new Map<string, number>();
              return analysis.findings.split("\n").map((line) => {
                const count = (counts.get(line) ?? 0) + 1;
                counts.set(line, count);
                return (
                  <div key={`${line}-${count}`} className="scan-finding-row">
                    {line}
                  </div>
                );
              });
            })()}
          </div>
        ) : null}
        {analysis.guidance ? (
          <div className={`analysis-guidance ${guidanceClass}`}>
            <div className="analysis-guidance-label">
              {verdict === "malicious"
                ? "请勿安装此 Skill"
                : verdict === "suspicious"
                  ? "安装前请复核"
                  : "评估"}
            </div>
            {analysis.guidance}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SecurityScanResults({
  sha256hash,
  vtAnalysis,
  llmAnalysis,
  capabilityTags,
  variant = "panel",
}: SecurityScanResultsProps) {
  const visibleCapabilityTags = (capabilityTags ?? []).filter(Boolean);
  if (!sha256hash && !llmAnalysis && visibleCapabilityTags.length === 0) {
    return null;
  }

  const vtStatus = getVirusTotalDisplayStatus(vtAnalysis);
  const vtUrl = sha256hash ? `https://www.virustotal.com/gui/file/${sha256hash}` : null;
  const llmVerdict = llmAnalysis?.verdict ?? llmAnalysis?.status;
  const llmDisplayStatus = getClawScanDisplayStatus(llmAnalysis);
  const llmStatusInfo = llmVerdict ? getScanStatusInfo(llmDisplayStatus) : null;

  if (variant === "badge") {
    return (
      <>
        {sha256hash ? (
          <div className="version-scan-badge">
            <VirusTotalIcon className="version-scan-icon version-scan-icon-vt" />
            <ScanResultBadge status={vtStatus} />
            {vtUrl ? (
              <a
                href={vtUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="version-scan-link"
                onClick={(event) => event.stopPropagation()}
              >
                ↗
              </a>
            ) : null}
          </div>
        ) : null}
        {llmStatusInfo ? (
          <div className="version-scan-badge">
            <ClawScanIcon className="version-scan-icon version-scan-icon-oc" />
            <ScanResultBadge status={llmDisplayStatus} tone="review" />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="scan-results-panel">
      <div className="scan-results-title">安全扫描</div>
      <div className="scan-results-list">
        {visibleCapabilityTags.length > 0 ? (
          <div className="scan-capabilities-section">
            <div className="scan-findings-title">能力信号</div>
            <div className="scan-capability-tags">
              {visibleCapabilityTags.map((tag) => (
                <Badge key={tag} className="scan-capability-tag">
                  {SKILL_CAPABILITY_LABELS[tag] ?? tag}
                </Badge>
              ))}
            </div>
            <div className="scan-capability-note">
              这些标签描述该 Skill 可能行使的权限，与警告或恶意审核结论无关。
            </div>
          </div>
        ) : null}
        {sha256hash ? (
          <div className="scan-result-row">
            <div className="scan-result-scanner">
              <VirusTotalIcon className="scan-result-icon scan-result-icon-vt" />
              <span className="scan-result-scanner-name">VirusTotal</span>
            </div>
            <ScanResultBadge status={vtStatus} />
            {vtUrl ? (
              <a
                href={vtUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="scan-result-link"
              >
                查看报告 →
              </a>
            ) : null}
          </div>
        ) : null}
        {llmStatusInfo && llmAnalysis ? (
          <div className="scan-result-row">
            <div className="scan-result-scanner">
              <ClawScanIcon className="scan-result-icon scan-result-icon-oc" />
              <span className="scan-result-scanner-name">ClawScan</span>
            </div>
            <ScanResultBadge status={llmDisplayStatus} tone="review" />
          </div>
        ) : null}
        {llmAnalysis &&
        llmAnalysis.status !== "error" &&
        llmAnalysis.status !== "pending" &&
        llmAnalysis.summary ? (
          <LlmAnalysisDetail analysis={llmAnalysis} />
        ) : null}
      </div>
    </div>
  );
}
