import { Link } from "@tanstack/react-router";
import { Button } from "../../components/ui/button";
import { resolveOwnerParam, type DuplicateCandidateEntry } from "./managementShared";

type DuplicateSkillId = DuplicateCandidateEntry["skill"]["_id"];

export function DuplicatesPage({
  duplicateCandidates,
  onSetDuplicate,
}: {
  duplicateCandidates: DuplicateCandidateEntry[] | undefined;
  onSetDuplicate: (skillId: DuplicateSkillId, canonicalSlug: string) => void;
}) {
  return (
    <div className="management-view">
      <h2 className="section-title text-[1.2rem] m-0">疑似重复</h2>
      <p className="section-subtitle m-0 mt-1">
        代码指纹与其他发布者匹配的 Skill —— 可能是抄袭。请选择规范原版。
      </p>
      <div className="management-list">
        {!duplicateCandidates ? (
          <div className="management-empty">正在加载疑似重复…</div>
        ) : duplicateCandidates.length === 0 ? (
          <div className="management-empty">暂无疑似重复。</div>
        ) : (
          duplicateCandidates.map((entry) => (
            <div key={entry.skill._id} className="management-item management-dupe">
              <div className="management-dupe-head">
                <div className="management-item-main">
                  <Link
                    to="/$owner/$slug"
                    params={{
                      owner: resolveOwnerParam(
                        entry.owner?.handle ?? null,
                        entry.owner?._id ?? entry.skill.ownerUserId,
                      ),
                      slug: entry.skill.slug,
                    }}
                  >
                    {entry.skill.displayName}
                  </Link>
                  <div className="section-subtitle m-0">
                    @{entry.owner?.handle ?? entry.owner?.name ?? "user"} · v
                    {entry.latestVersion?.version ?? "—"} ·{" "}
                    <span className="management-fingerprint">
                      {entry.fingerprint ? entry.fingerprint.slice(0, 8) : "—"}
                    </span>
                  </div>
                </div>
                <div className="management-actions">
                  <Button asChild>
                    <Link
                      to="/$owner/$slug"
                      params={{
                        owner: resolveOwnerParam(
                          entry.owner?.handle ?? null,
                          entry.owner?._id ?? entry.skill.ownerUserId,
                        ),
                        slug: entry.skill.slug,
                      }}
                    >
                      查看
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="management-dupe-matches">
                <div className="management-dupe-label">
                  {entry.matches.length === 1 ? "可能重复于" : "可能重复于"}
                </div>
                {entry.matches.map((match) => (
                  <div key={match.skill._id} className="management-dupe-match">
                    <div className="management-item-main">
                      <strong>{match.skill.displayName}</strong>
                      <div className="section-subtitle m-0">
                        @{match.owner?.handle ?? match.owner?.name ?? "user"} · {match.skill.slug}
                      </div>
                    </div>
                    <div className="management-actions">
                      <Button asChild>
                        <Link
                          to="/$owner/$slug"
                          params={{
                            owner: resolveOwnerParam(
                              match.owner?.handle ?? null,
                              match.owner?._id ?? match.skill.ownerUserId,
                            ),
                            slug: match.skill.slug,
                          }}
                        >
                          查看
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        onClick={() => onSetDuplicate(entry.skill._id, match.skill.slug)}
                      >
                        标记为重复
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
