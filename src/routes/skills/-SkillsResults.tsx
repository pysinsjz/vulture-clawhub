import type { RefObject } from "react";
import { BrowseResultsSkeleton } from "../../components/skeletons/BrowseResultsSkeleton";
import { SkillCard } from "../../components/SkillCard";
import { getPlatformLabels } from "../../components/skillDetailUtils";
import { SkillListItem } from "../../components/SkillListItem";
import { SkillStatsTripletLine } from "../../components/SkillStats";
import { Button } from "../../components/ui/button";
import { UserBadge } from "../../components/UserBadge";
import { getSkillBadges } from "../../lib/badges";
import { timeAgo } from "../../lib/timeAgo";
import { buildSkillHref, type SkillListEntry } from "./-types";
import type { SkillsView } from "./-useSkillsBrowseModel";

type SkillsResultsProps = {
  isLoadingSkills: boolean;
  sorted: SkillListEntry[];
  view: SkillsView;
  listDoneLoading: boolean;
  hasQuery: boolean;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  canAutoLoad: boolean;
  loadMoreRef: RefObject<HTMLDivElement | null>;
  loadMore: () => void;
};

export function SkillsResults({
  isLoadingSkills,
  sorted,
  view,
  listDoneLoading: _listDoneLoading,
  hasQuery,
  canLoadMore,
  isLoadingMore,
  canAutoLoad,
  loadMoreRef,
  loadMore,
}: SkillsResultsProps) {
  return (
    <>
      {isLoadingSkills ? (
        <BrowseResultsSkeleton variant={view} />
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">没有找到 Skill</p>
          <p className="empty-state-body">
            {hasQuery
              ? "换个搜索词或清除筛选"
              : "还没有发布任何 Skill"}
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid">
          {sorted.map((entry) => {
            const skill = entry.skill;
            const clawdis = entry.latestVersion?.parsed?.clawdis;
            const isPlugin = Boolean(clawdis?.nix?.plugin);
            const platforms = getPlatformLabels(clawdis?.os, clawdis?.nix?.systems);
            const ownerHandle = entry.owner?.handle ?? entry.ownerHandle ?? null;
            const skillHref = buildSkillHref(skill, ownerHandle);
            return (
              <SkillCard
                key={skill._id}
                skill={skill}
                href={skillHref}
                className="skill-card-spaced-footer"
                badge={getSkillBadges(skill)}
                chip={isPlugin ? "Plugin 包 (nix)" : undefined}
                platformLabels={platforms.length ? platforms : undefined}
                summaryFallback="开箱即用的 Skill 包"
                apiKeyRequired={entry.latestVersion?.apiKeyRequired}
                meta={
                  <div className="skill-card-footer-rows">
                    <UserBadge
                      user={entry.owner}
                      fallbackHandle={ownerHandle}
                      prefix="by"
                      link={false}
                    />
                    <div className="stat">
                      <div className="skill-card-statline">
                        <span className="skill-card-updated">
                          更新于 {timeAgo(skill.updatedAt)}
                        </span>
                        <SkillStatsTripletLine stats={skill.stats} />
                      </div>
                    </div>
                  </div>
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="results-list">
          {sorted.map((entry) => {
            const skill = entry.skill;
            const ownerHandle = entry.owner?.handle ?? entry.ownerHandle ?? null;
            return (
              <SkillListItem
                key={skill._id}
                skill={skill}
                ownerHandle={ownerHandle}
                owner={entry.owner}
                apiKeyRequired={entry.latestVersion?.apiKeyRequired}
              />
            );
          })}
        </div>
      )}

      {isLoadingMore ? (
        <div ref={canAutoLoad ? loadMoreRef : null} className="mt-4">
          <BrowseResultsSkeleton count={2} variant={view} />
        </div>
      ) : canLoadMore ? (
        <div ref={canAutoLoad ? loadMoreRef : null} className="card mt-4 flex justify-center">
          {canAutoLoad ? (
            "滚动以加载更多"
          ) : (
            <Button type="button" onClick={loadMore} disabled={isLoadingMore}>
              加载更多
            </Button>
          )}
        </div>
      ) : null}
    </>
  );
}
