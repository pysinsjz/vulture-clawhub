import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getUserFacingConvexError } from "../lib/convexError";
import { SettingsActionRow } from "./settings/SettingsActionRow";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";

type OwnedSkillOption = {
  _id: Id<"skills">;
  slug: string;
  displayName: string;
};

type SkillOwnershipPanelProps = {
  skillId: Id<"skills">;
  slug: string;
  ownerHandle: string | null;
  ownerId: Id<"users"> | Id<"publishers"> | null;
  ownedSkills: OwnedSkillOption[];
  summary?: string | null;
  onSaveSummary?: ((summary: string) => Promise<void>) | null;
};

function formatMutationError(error: unknown) {
  return getUserFacingConvexError(error, "请求失败。");
}

function SummarySettingsEditor({
  summary,
  onSaveSummary,
}: {
  summary?: string | null;
  onSaveSummary: (summary: string) => Promise<void>;
}) {
  const [value, setValue] = useState(summary ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSaving) setValue(summary ?? "");
  }, [isSaving, summary]);

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSaveSummary(value);
    } catch (saveError) {
      setError(getUserFacingConvexError(saveError, "无法保存简介。"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="summary-settings-editor">
      <Textarea
        aria-label="简介"
        rows={3}
        value={value}
        maxLength={500}
        onChange={(event) => setValue(event.target.value)}
        placeholder="输入简短的简介…"
      />
      <div className="summary-settings-footer">
        <span className="summary-settings-meta">{value.trim().length}/500</span>
        <Button
          type="button"
          variant="outline"
          loading={isSaving}
          onClick={() => void handleSave()}
        >
          {isSaving ? "保存中" : "保存"}
        </Button>
      </div>
      {error ? <p className="summary-settings-error">{error}</p> : null}
    </div>
  );
}

export function SkillOwnershipPanel({
  skillId,
  slug,
  ownerHandle,
  ownerId,
  ownedSkills,
  summary,
  onSaveSummary,
}: SkillOwnershipPanelProps) {
  const navigate = useNavigate();
  const renameOwnedSkill = useMutation(api.skills.renameOwnedSkill);
  const mergeOwnedSkillIntoCanonical = useMutation(api.skills.mergeOwnedSkillIntoCanonical);

  const [renameSlug, setRenameSlug] = useState(slug);
  const [mergeTargetSlug, setMergeTargetSlug] = useState(ownedSkills[0]?.slug ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRename, setConfirmRename] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);

  // When ownedSkills first arrives from the server, default the merge target to
  // the first available skill so the Select is never blank.
  useEffect(() => {
    setMergeTargetSlug((prev) =>
      prev === "" && ownedSkills.length > 0 ? ownedSkills[0].slug : prev,
    );
  }, [ownedSkills]);

  const handleRename = async () => {
    const nextSlug = renameSlug.trim().toLowerCase();
    if (!nextSlug || nextSlug === slug) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await renameOwnedSkill({ slug, newSlug: nextSlug });
      toast.success(`已重命名为 ${nextSlug}，旧 slug 将自动跳转。`);
      await navigate({
        to: "/$owner/$slug",
        params: {
          owner: ownerHandle ?? String(ownerId ?? ""),
          slug: nextSlug,
        },
        replace: true,
      });
    } catch (renameError) {
      setError(formatMutationError(renameError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMerge = async () => {
    const targetSlug = mergeTargetSlug.trim().toLowerCase();
    if (!targetSlug || targetSlug === slug) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await mergeOwnedSkillIntoCanonical({
        sourceSlug: slug,
        targetSlug,
      });
      toast.success(`已合并到 ${targetSlug}，此 slug 将自动跳转。`);
      await navigate({
        to: "/$owner/$slug",
        params: {
          owner: ownerHandle ?? String(ownerId ?? ""),
          slug: targetSlug,
        },
        replace: true,
      });
    } catch (mergeError) {
      setError(formatMutationError(mergeError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="skill-admin-panel" data-skill-id={skillId}>
        <SettingsActionRow
          title="简介"
          description="更新用于卡片、搜索和预览的简短简介。"
        >
          {onSaveSummary ? (
            <SummarySettingsEditor summary={summary} onSaveSummary={onSaveSummary} />
          ) : null}
        </SettingsActionRow>

        <SettingsActionRow
          title="重命名 slug"
          description="修改规范化的 URL slug，旧 slug 会保留为跳转。"
        >
          <div className="skill-admin-row-controls">
            <div className="skill-admin-control-line">
              <Input
                aria-label="新 slug"
                value={renameSlug}
                onChange={(event) => setRenameSlug(event.target.value)}
                placeholder="new-slug"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                variant="outline"
                onClick={() => setConfirmRename(true)}
                disabled={isSubmitting || renameSlug.trim().toLowerCase() === slug}
              >
                更新
              </Button>
            </div>
          </div>
        </SettingsActionRow>

        <SettingsActionRow
          title="合并条目"
          description={
            <p>
              将此条目合并到你拥有的另一个 Skill。目标 Skill 保持上线，此条目将从搜索和浏览中隐藏。
            </p>
          }
        >
          <div className="skill-admin-row-controls">
            <div className="skill-admin-control-line">
              <Select
                value={ownedSkills.length === 0 ? "__none__" : mergeTargetSlug}
                onValueChange={setMergeTargetSlug}
                disabled={ownedSkills.length === 0 || isSubmitting}
              >
                <SelectTrigger aria-label="合并到">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ownedSkills.length === 0 ? (
                    <SelectItem value="__none__">没有其他你拥有的 Skill</SelectItem>
                  ) : null}
                  {ownedSkills.map((entry) => (
                    <SelectItem key={entry._id} value={entry.slug}>
                      {entry.displayName} ({entry.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => setConfirmMerge(true)}
                disabled={isSubmitting || !mergeTargetSlug}
              >
                更新
              </Button>
            </div>
          </div>
        </SettingsActionRow>

        {error ? (
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </div>

      {/* Rename confirmation dialog */}
      <Dialog open={confirmRename} onOpenChange={setConfirmRename}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名 Skill slug？</DialogTitle>
            <DialogDescription>
              此操作会将 <strong>{slug}</strong> 永久重命名为{" "}
              <strong>{renameSlug.trim().toLowerCase()}</strong>。旧 slug 将变为跳转。除非再次重命名，否则无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRename(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={isSubmitting}
              onClick={() => {
                void handleRename().finally(() => setConfirmRename(false));
              }}
            >
              重命名
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge confirmation dialog */}
      <Dialog open={confirmMerge} onOpenChange={setConfirmMerge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>合并到另一个 Skill？</DialogTitle>
            <DialogDescription>
              此操作会隐藏 <strong>{slug}</strong>，并将其跳转到{" "}
              <strong>{mergeTargetSlug.trim().toLowerCase()}</strong>。该条目将从搜索和浏览视图中移除。此操作不易撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMerge(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              loading={isSubmitting}
              onClick={() => {
                void handleMerge().finally(() => setConfirmMerge(false));
              }}
            >
              合并并隐藏
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
