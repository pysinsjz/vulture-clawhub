import { Link } from "@tanstack/react-router";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  getSkillBadges,
  isSkillDeprecated,
  isSkillHighlighted,
  isSkillOfficial,
} from "../../lib/badges";
import {
  formatAuditActionLabel,
  formatAuditMetadataSummary,
  formatManagementUserLabel,
  formatManualOverrideState,
  formatTimestamp,
  resolveOwnerParam,
  SKILL_AUDIT_LOG_LIMIT,
  type ManagementOwnerOption,
  type ManagementUserListResult,
  type SkillBySlugResult,
} from "./managementShared";

export function SkillsPage({
  admin,
  currentUserId,
  ownerOptions,
  ownerSearch,
  ownerSummary,
  ownerUsers,
  selectedDuplicate,
  selectedOwner,
  selectedSkill,
  selectedSlug,
  skillOverrideNote,
  skillSearch,
  staff,
  onApplySkillOverride,
  onBanUser,
  onChangeOwner,
  onChangeOwnerSearch,
  onChangeSelectedDuplicate,
  onChangeSelectedOwner,
  onChangeSkillOverrideNote,
  onChangeSkillSearch,
  onClearSkillOverride,
  onHardDeleteSkill,
  onManageSkill,
  onSetBatch,
  onSetDeprecatedBadge,
  onSetDuplicate,
  onSetOfficialBadge,
  onToggleSkillHidden,
}: {
  admin: boolean;
  currentUserId: Id<"users"> | null;
  ownerOptions: ManagementOwnerOption[];
  ownerSearch: string;
  ownerSummary: string;
  ownerUsers: ManagementUserListResult["items"];
  selectedDuplicate: string;
  selectedOwner: Id<"users"> | "";
  selectedSkill: SkillBySlugResult | undefined;
  selectedSlug: string | undefined;
  skillOverrideNote: string;
  skillSearch: string;
  staff: boolean;
  onApplySkillOverride: () => void;
  onBanUser: (userId: Id<"users">, label: string) => void;
  onChangeOwner: (skillId: Id<"skills">, ownerUserId: Id<"users">) => void;
  onChangeOwnerSearch: (value: string) => void;
  onChangeSelectedDuplicate: (value: string) => void;
  onChangeSelectedOwner: (value: Id<"users"> | "") => void;
  onChangeSkillOverrideNote: (value: string) => void;
  onChangeSkillSearch: (value: string) => void;
  onClearSkillOverride: () => void;
  onHardDeleteSkill: (skill: Doc<"skills">) => void;
  onManageSkill: () => void;
  onSetBatch: (skillId: Id<"skills">, batch: "highlighted" | undefined) => void;
  onSetDeprecatedBadge: (skillId: Id<"skills">, deprecated: boolean) => void;
  onSetDuplicate: (skillId: Id<"skills">, canonicalSlug: string | undefined) => void;
  onSetOfficialBadge: (skillId: Id<"skills">, official: boolean) => void;
  onToggleSkillHidden: (skill: Doc<"skills">) => void;
}) {
  return (
    <div className="management-view">
      <h2 className="section-title text-[1.2rem] m-0">Skill 工具</h2>
      <p className="section-subtitle m-0 mt-1">
        按 slug 查找 Skill，管理审核覆盖并查看其审计历史。
      </p>
      <div className="management-controls">
        <div className="management-control management-search">
          <span className="mono">Skill</span>
          <input
            type="search"
            placeholder="skill-slug"
            value={skillSearch}
            onChange={(event) => onChangeSkillSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onManageSkill();
              }
            }}
          />
        </div>
        <Button type="button" onClick={onManageSkill} disabled={!skillSearch.trim()}>
          管理
        </Button>
      </div>
      {selectedSlug ? (
        <div className="section-subtitle mt-2">
          正在管理 “{selectedSlug}” ·{" "}
          <Link
            to="/management"
            search={{
              view: "skills",
              skill: undefined,
              plugin: undefined,
            }}
          >
            清除选择
          </Link>
        </div>
      ) : null}
      <div className="management-list">
        {!selectedSlug ? (
          <div className="management-empty">
            在上方输入 Skill slug，或在其他视图中对某个 Skill 点击「管理」。
          </div>
        ) : selectedSkill === undefined ? (
          <div className="management-empty">正在加载 Skill…</div>
        ) : !selectedSkill?.skill ? (
          <div className="management-empty">未找到 Skill “{selectedSlug}”。</div>
        ) : (
          (() => {
            const { skill, latestVersion, owner, canonical, overrideReviewer, auditLogs } =
              selectedSkill;
            const ownerParam = resolveOwnerParam(
              owner?.handle ?? null,
              owner?._id ?? skill.ownerUserId,
            );
            const moderationStatus =
              skill.moderationStatus ?? (skill.softDeletedAt ? "hidden" : "active");
            const isHighlighted = isSkillHighlighted(skill);
            const isOfficial = isSkillOfficial(skill);
            const isDeprecated = isSkillDeprecated(skill);
            const badges = getSkillBadges(skill);
            const ownerUserId = skill.ownerUserId ?? null;
            const ownerHandle = owner?.handle ?? owner?.displayName ?? "user";
            const ownerRecord = ownerUsers.find((user) => user._id === ownerUserId);
            const isOwnerAdmin = ownerRecord?.role === "admin";
            const canBanOwner =
              staff && ownerUserId && ownerUserId !== currentUserId && (admin || !isOwnerAdmin);

            return (
              <div key={skill._id} className="management-item management-item-detail">
                <div className="management-item-main">
                  <Link to="/$owner/$slug" params={{ owner: ownerParam, slug: skill.slug }}>
                    {skill.displayName}
                  </Link>
                  <div className="section-subtitle m-0">
                    @{owner?.handle ?? owner?.displayName ?? "user"} · v
                    {latestVersion?.version ?? "—"} · 更新于 {formatTimestamp(skill.updatedAt)} ·{" "}
                    {moderationStatus}
                    {badges.length ? ` · ${badges.join(", ").toLowerCase()}` : ""}
                  </div>
                  {skill.moderationFlags?.length ? (
                    <div className="management-tags">
                      {skill.moderationFlags.map((flag: string) => (
                        <Badge key={flag}>{flag}</Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="management-sublist">
                    <div className="section-subtitle m-0">人工覆盖</div>
                    <section className="management-override-panel">
                      <div className="management-report-item">
                        <span className="management-report-meta">当前覆盖</span>
                        <span>
                          {formatManualOverrideState(skill.manualOverride, overrideReviewer)}
                        </span>
                      </div>
                      <div className="management-report-item">
                        <span className="management-report-meta">最新版本</span>
                        <span>
                          {latestVersion ? `v${latestVersion.version}` : "尚无已发布版本。"}
                        </span>
                      </div>
                      <div className="management-report-item">
                        <span className="management-report-meta">行为</span>
                        <span>在审核员清除前，对整个 Skill 生效。</span>
                      </div>
                      <textarea
                        className="form-input management-textarea"
                        rows={4}
                        placeholder={
                          skill.manualOverride
                            ? "更新或清除正常覆盖需填写审计备注"
                            : "标记此 Skill 正常需填写审计备注"
                        }
                        value={skillOverrideNote}
                        onChange={(event) => onChangeSkillOverrideNote(event.target.value)}
                      />
                      <div className="management-actions management-actions-start">
                        <Button
                          className="management-action-btn"
                          type="button"
                          disabled={!skillOverrideNote.trim()}
                          onClick={onApplySkillOverride}
                        >
                          {skill.manualOverride ? "更新正常覆盖" : "标记 Skill 正常"}
                        </Button>
                        {skill.manualOverride ? (
                          <Button
                            className="management-action-btn"
                            type="button"
                            disabled={!skillOverrideNote.trim()}
                            onClick={onClearSkillOverride}
                          >
                            清除 Skill 覆盖
                          </Button>
                        ) : null}
                      </div>
                    </section>
                  </div>
                  <div className="management-sublist">
                    <div className="section-subtitle m-0">最近审计活动</div>
                    <section className="management-override-panel management-audit-panel">
                      <div className="management-report-item">
                        <span className="management-report-meta">范围</span>
                        <span>此 Skill 最近 {SKILL_AUDIT_LOG_LIMIT} 条记录。</span>
                      </div>
                      {auditLogs.length === 0 ? (
                        <div className="section-subtitle m-0">暂无审计活动。</div>
                      ) : (
                        <div className="management-audit-list">
                          {auditLogs.map((entry) => {
                            const auditSummary = formatAuditMetadataSummary(
                              entry.action,
                              entry.metadata,
                            );
                            return (
                              <div key={entry._id} className="management-audit-item">
                                <div className="management-report-item">
                                  <span className="management-report-meta">
                                    {formatTimestamp(entry.createdAt)} ·{" "}
                                    {formatManagementUserLabel(entry.actor)}
                                  </span>
                                  <span>
                                    {formatAuditActionLabel(entry.action, entry.metadata)}
                                  </span>
                                </div>
                                {auditSummary ? (
                                  <div className="section-subtitle management-audit-summary">
                                    {auditSummary}
                                  </div>
                                ) : null}
                                {entry.metadata ? (
                                  <details className="management-audit-details">
                                    <summary>metadata</summary>
                                    <pre className="management-audit-json">
                                      {JSON.stringify(entry.metadata, null, 2)}
                                    </pre>
                                  </details>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>
                  <div className="management-tool-grid">
                    <label className="management-control management-control-stack">
                      <span className="mono">重复于</span>
                      <input
                        className="management-field"
                        value={selectedDuplicate}
                        onChange={(event) => onChangeSelectedDuplicate(event.target.value)}
                        placeholder={canonical?.skill?.slug ?? "规范 slug"}
                      />
                    </label>
                    <div className="management-control management-control-stack">
                      <span className="mono">重复操作</span>
                      <Button
                        className="management-action-btn"
                        type="button"
                        onClick={() =>
                          onSetDuplicate(skill._id, selectedDuplicate.trim() || undefined)
                        }
                      >
                        设为重复
                      </Button>
                    </div>
                    {admin ? (
                      <>
                        <label className="management-control management-control-stack">
                          <span className="mono">所有者搜索</span>
                          <input
                            className="management-field"
                            type="search"
                            placeholder="按 handle 搜索用户"
                            value={ownerSearch}
                            onChange={(event) => onChangeOwnerSearch(event.target.value)}
                          />
                          <span className="management-count">{ownerSummary}</span>
                        </label>
                        <label className="management-control management-control-stack">
                          <span className="mono">所有者</span>
                          <Select
                            value={selectedOwner}
                            onValueChange={(value) => {
                              const option = ownerOptions.find(
                                (ownerOption) => ownerOption.userId === value,
                              );
                              if (option) onChangeSelectedOwner(option.userId);
                            }}
                          >
                            <SelectTrigger className="management-field">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ownerOptions.map((user) => (
                                <SelectItem key={user.userId} value={user.userId}>
                                  {user.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                        <div className="management-control management-control-stack">
                          <span className="mono">所有者操作</span>
                          <Button
                            className="management-action-btn"
                            type="button"
                            onClick={() => {
                              if (!selectedOwner) return;
                              onChangeOwner(skill._id, selectedOwner);
                            }}
                          >
                            变更所有者
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="management-actions management-action-grid">
                  <Button asChild className="management-action-btn">
                    <Link to="/$owner/$slug" params={{ owner: ownerParam, slug: skill.slug }}>
                      查看
                    </Link>
                  </Button>
                  <Button
                    className="management-action-btn"
                    type="button"
                    onClick={() => onToggleSkillHidden(skill)}
                  >
                    {skill.softDeletedAt ? "恢复" : "隐藏"}
                  </Button>
                  <Button
                    className="management-action-btn"
                    type="button"
                    onClick={() => onSetBatch(skill._id, isHighlighted ? undefined : "highlighted")}
                  >
                    {isHighlighted ? "取消精选" : "精选"}
                  </Button>
                  {admin ? (
                    <Button
                      className="management-action-btn"
                      type="button"
                      variant="destructive"
                      onClick={() => onHardDeleteSkill(skill)}
                    >
                      硬删除
                    </Button>
                  ) : null}
                  {staff ? (
                    <Button
                      className="management-action-btn"
                      type="button"
                      variant="destructive"
                      disabled={!canBanOwner}
                      onClick={() => {
                        if (!ownerUserId || ownerUserId === currentUserId) return;
                        onBanUser(ownerUserId, `@${ownerHandle}`);
                      }}
                    >
                      封禁用户
                    </Button>
                  ) : null}
                  {admin ? (
                    <>
                      <Button
                        className="management-action-btn"
                        type="button"
                        onClick={() => onSetOfficialBadge(skill._id, !isOfficial)}
                      >
                        {isOfficial ? "移除官方" : "标记官方"}
                      </Button>
                      <Button
                        className="management-action-btn"
                        type="button"
                        onClick={() => onSetDeprecatedBadge(skill._id, !isDeprecated)}
                      >
                        {isDeprecated ? "移除弃用" : "标记弃用"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
