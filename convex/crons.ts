import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "github-backup-sync",
  { minutes: 30 },
  internal.githubBackupsNode.syncGitHubBackupsInternal,
  { batchSize: 50, maxBatches: 5 },
);

crons.interval(
  "github-skill-source-sync",
  { minutes: 15 },
  internal.githubSkillSync.syncGitHubSkillSourcesInternal,
  {},
);

crons.interval(
  "skill-stats-backfill",
  { hours: 6 },
  internal.statsMaintenance.runSkillStatBackfillInternal,
  { batchSize: 200, maxBatches: 5 },
);

// Runs frequently to keep dailyStats/trending accurate,
// but does NOT patch skill documents (only writes to skillDailyStats).
crons.interval(
  "skill-stat-events",
  { minutes: 15 },
  internal.skillStatEvents.processSkillStatEventsAction,
  {},
);

crons.interval(
  "package-stat-events",
  { minutes: 15 },
  internal.packages.processPackageStatEventsInternal,
  { batchSize: 500 },
);

// Syncs accumulated stat deltas to skill documents every 6 hours.
// Runs infrequently to avoid thundering-herd reactive query invalidation.
// Uses processedAt field to track progress (independent of the action cursor).
crons.interval(
  "skill-doc-stat-sync",
  { hours: 6 },
  internal.skillStatEvents.processSkillStatEventsInternal,
  { batchSize: 100 },
);

crons.interval(
  "global-stats-update",
  { hours: 24 },
  internal.statsMaintenance.updateGlobalStatsAction,
  {},
);

// vulture-trim: 内网注册中心已跳过安全审计（发布即标记 clean），不再周期性
// 回填 ClawScan/VirusTotal/静态扫描，否则会对内网包重新入队审计并可能降级。
// 手动入口 backfillPackageReleaseScans / admin 重扫仍保留，按需触发。

crons.interval(
  "skill-scan-request-prune",
  { hours: 6 },
  internal.securityScan.pruneExpiredSkillScanRequestsInternal,
  { batchSize: 250 },
);

crons.interval(
  "download-dedupe-prune",
  { hours: 24 },
  internal.downloads.pruneDownloadDedupesInternal,
  {},
);

crons.interval(
  "download-metric-dedupe-prune",
  { hours: 24 },
  internal.downloadMetrics.pruneDownloadMetricDedupesInternal,
  {},
);

export default crons;
