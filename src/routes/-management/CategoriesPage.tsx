// Presentation shell for the marketplace category dictionary.
// Family-specific data wiring (plugin vs skill) lives in the two thin wrappers
// PluginCategoriesPage / SkillCategoriesPage — this file stays presentation-only
// so the two families can evolve independently if needed.

import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { formatMutationError, formatTimestamp } from "./managementShared";

export type CategoryRowId = Id<"pluginCategories"> | Id<"skillCategories">;

export type CategoryRow = {
  id: CategoryRowId;
  slug: string;
  label: string;
  order: number;
  icon: string | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CategoriesViewProps = {
  admin: boolean;
  title: string;
  description: string;
  rows: CategoryRow[] | undefined;
  onCreate: (input: {
    slug: string;
    label: string;
    order: number;
    icon?: string;
  }) => Promise<unknown>;
  onUpdate: (input: {
    id: CategoryRowId;
    label?: string;
    icon?: string | null;
    order?: number;
  }) => Promise<unknown>;
  onArchive: (id: CategoryRowId) => Promise<unknown>;
  onUnarchive: (id: CategoryRowId) => Promise<unknown>;
};

type DraftMode = { kind: "create" } | { kind: "edit"; row: CategoryRow };

export function CategoriesView({
  admin,
  title,
  description,
  rows,
  onCreate,
  onUpdate,
  onArchive,
  onUnarchive,
}: CategoriesViewProps) {
  const [draft, setDraft] = useState<DraftMode | null>(null);

  return (
    <div className="management-view">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="section-title text-[1.2rem] m-0">{title}</h2>
          <p className="section-subtitle m-0 mt-1">{description}</p>
        </div>
        {admin ? (
          <Button type="button" onClick={() => setDraft({ kind: "create" })}>
            新建分类
          </Button>
        ) : null}
      </div>

      <div className="management-list">
        {rows === undefined ? (
          <div className="management-empty">正在加载分类…</div>
        ) : rows.length === 0 ? (
          <div className="management-empty">暂无分类。请先运行 seed 或新建。</div>
        ) : (
          rows.map((row) => (
            <CategoryRowItem
              key={row.id}
              admin={admin}
              row={row}
              onEdit={() => setDraft({ kind: "edit", row })}
              onArchive={() =>
                onArchive(row.id)
                  .then(() => toast.success(`已下架「${row.label}」。`))
                  .catch((err) => toast.error(formatMutationError(err)))
              }
              onUnarchive={() =>
                onUnarchive(row.id)
                  .then(() => toast.success(`已恢复「${row.label}」。`))
                  .catch((err) => toast.error(formatMutationError(err)))
              }
            />
          ))
        )}
      </div>

      <CategoryDraftDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onSubmitCreate={async (input) => {
          try {
            await onCreate(input);
            toast.success(`已创建「${input.label}」。`);
            setDraft(null);
          } catch (err) {
            toast.error(formatMutationError(err));
          }
        }}
        onSubmitEdit={async (id, patch) => {
          try {
            await onUpdate({ id, ...patch });
            toast.success("已保存修改。");
            setDraft(null);
          } catch (err) {
            toast.error(formatMutationError(err));
          }
        }}
      />
    </div>
  );
}

function CategoryRowItem({
  admin,
  row,
  onArchive,
  onEdit,
  onUnarchive,
}: {
  admin: boolean;
  row: CategoryRow;
  onArchive: () => void;
  onEdit: () => void;
  onUnarchive: () => void;
}) {
  return (
    <div className="management-item">
      <div className="management-item-main">
        <div className="flex items-center gap-2">
          <strong>{row.label}</strong>
          <Badge>{row.slug}</Badge>
          {row.archived ? <Badge>已下架</Badge> : null}
          {row.icon ? <Badge>{row.icon}</Badge> : null}
        </div>
        <div className="section-subtitle m-0">
          排序 {row.order} · 更新于 {formatTimestamp(row.updatedAt)}
        </div>
      </div>
      <div className="management-actions">
        <Button type="button" onClick={onEdit}>
          编辑
        </Button>
        {admin ? (
          row.archived ? (
            <Button type="button" onClick={onUnarchive}>
              恢复
            </Button>
          ) : (
            <Button type="button" variant="destructive" onClick={onArchive}>
              下架
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

function CategoryDraftDialog({
  draft,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: {
  draft: DraftMode | null;
  onClose: () => void;
  onSubmitCreate: (input: {
    slug: string;
    label: string;
    order: number;
    icon?: string;
  }) => void | Promise<void>;
  onSubmitEdit: (
    id: CategoryRowId,
    patch: { label?: string; icon?: string | null; order?: number },
  ) => void | Promise<void>;
}) {
  if (!draft) {
    return (
      <Dialog open={false} onOpenChange={() => onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <CategoryDraftForm
        draft={draft}
        onClose={onClose}
        onSubmitCreate={onSubmitCreate}
        onSubmitEdit={onSubmitEdit}
      />
    </Dialog>
  );
}

function CategoryDraftForm({
  draft,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: {
  draft: DraftMode;
  onClose: () => void;
  onSubmitCreate: (input: {
    slug: string;
    label: string;
    order: number;
    icon?: string;
  }) => void | Promise<void>;
  onSubmitEdit: (
    id: CategoryRowId,
    patch: { label?: string; icon?: string | null; order?: number },
  ) => void | Promise<void>;
}) {
  const isCreate = draft.kind === "create";
  const initial = isCreate
    ? { slug: "", label: "", order: "10", icon: "" }
    : {
        slug: draft.row.slug,
        label: draft.row.label,
        order: String(draft.row.order),
        icon: draft.row.icon ?? "",
      };

  const [slug, setSlug] = useState(initial.slug);
  const [label, setLabel] = useState(initial.label);
  const [order, setOrder] = useState(initial.order);
  const [icon, setIcon] = useState(initial.icon);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const parsedOrder = Number(order);
    if (!Number.isFinite(parsedOrder)) {
      toast.error("排序必须是数字。");
      return;
    }
    setSubmitting(true);
    try {
      if (draft.kind === "create") {
        const slugTrim = slug.trim();
        const labelTrim = label.trim();
        if (!slugTrim || !labelTrim) {
          toast.error("slug 与 label 均必填。");
          return;
        }
        await onSubmitCreate({
          slug: slugTrim,
          label: labelTrim,
          order: parsedOrder,
          icon: icon.trim() || undefined,
        });
      } else {
        const patch: { label?: string; icon?: string | null; order?: number } = {};
        const trimmedLabel = label.trim();
        if (trimmedLabel !== draft.row.label) patch.label = trimmedLabel;
        if (parsedOrder !== draft.row.order) patch.order = parsedOrder;
        const trimmedIcon = icon.trim();
        const initialIcon = draft.row.icon ?? "";
        if (trimmedIcon !== initialIcon) {
          patch.icon = trimmedIcon === "" ? null : trimmedIcon;
        }
        await onSubmitEdit(draft.row.id, patch);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isCreate ? "新建分类" : `编辑「${draft.row.label}」`}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="category-slug">Slug</Label>
          <Input
            id="category-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="例如 ecommerce"
            readOnly={!isCreate}
            disabled={!isCreate}
          />
          <small className="section-subtitle m-0">
            {isCreate
              ? "提交后不可更改。请使用英文 kebab-case，例如 social-media。"
              : "slug 永久不可变。"}
          </small>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="category-label">Label</Label>
          <Input
            id="category-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例如 电商与市场"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="category-order">排序（数字）</Label>
          <Input
            id="category-order"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="category-icon">Icon（可选）</Label>
          <Input
            id="category-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="例如 shopping-cart"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {isCreate ? "创建" : "保存"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
