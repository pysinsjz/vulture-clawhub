import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CategoriesView, type CategoryRow } from "./CategoriesPage";

export function SkillCategoriesPage({ admin }: { admin: boolean }) {
  const rows = useQuery(api.marketplaceCategories.listAllSkillCategoriesForManagement, {}) as
    | CategoryRow[]
    | undefined;
  const create = useMutation(api.marketplaceCategories.createSkillCategory);
  const update = useMutation(api.marketplaceCategories.updateSkillCategory);
  const archive = useMutation(api.marketplaceCategories.archiveSkillCategory);
  const unarchive = useMutation(api.marketplaceCategories.unarchiveSkillCategory);

  return (
    <CategoriesView
      admin={admin}
      title="Skill 分类"
      description="桌面端 Skill Hub 的权威分类清单。Slug 不可变；Label/排序/Icon 可改；可下架但不删。"
      rows={rows}
      onCreate={(input) => create(input)}
      onUpdate={(input) =>
        update({
          id: input.id as ReturnType<typeof asSkillId>,
          label: input.label,
          icon: input.icon,
          order: input.order,
        })
      }
      onArchive={(id) => archive({ id: id as ReturnType<typeof asSkillId> })}
      onUnarchive={(id) => unarchive({ id: id as ReturnType<typeof asSkillId> })}
    />
  );
}

function asSkillId(
  id: unknown,
): import("../../../convex/_generated/dataModel").Id<"skillCategories"> {
  return id as import("../../../convex/_generated/dataModel").Id<"skillCategories">;
}
