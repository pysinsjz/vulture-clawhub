import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CategoriesView, type CategoryRow } from "./CategoriesPage";

export function PluginCategoriesPage({ admin }: { admin: boolean }) {
  const rows = useQuery(api.marketplaceCategories.listAllPluginCategoriesForManagement, {}) as
    | CategoryRow[]
    | undefined;
  const create = useMutation(api.marketplaceCategories.createPluginCategory);
  const update = useMutation(api.marketplaceCategories.updatePluginCategory);
  const archive = useMutation(api.marketplaceCategories.archivePluginCategory);
  const unarchive = useMutation(api.marketplaceCategories.unarchivePluginCategory);

  return (
    <CategoriesView
      admin={admin}
      title="Plugin 分类"
      description="桌面端 Plugin Hub 的权威分类清单。Slug 不可变；Label/排序/Icon 可改；可下架但不删。"
      rows={rows}
      onCreate={(input) => create(input)}
      onUpdate={(input) =>
        update({
          id: input.id as ReturnType<typeof asPluginId>,
          label: input.label,
          icon: input.icon,
          order: input.order,
        })
      }
      onArchive={(id) => archive({ id: id as ReturnType<typeof asPluginId> })}
      onUnarchive={(id) => unarchive({ id: id as ReturnType<typeof asPluginId> })}
    />
  );
}

// Narrowing helper — CategoriesView speaks the union id type for reuse, but the
// plugin mutations only accept Id<"pluginCategories">. The runtime check happens
// server-side via ctx.db.get + v.id("pluginCategories") validator.
function asPluginId(
  id: unknown,
): import("../../../convex/_generated/dataModel").Id<"pluginCategories"> {
  return id as import("../../../convex/_generated/dataModel").Id<"pluginCategories">;
}
