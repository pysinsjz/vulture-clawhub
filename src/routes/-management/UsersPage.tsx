import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { formatTimestamp, type ManagementUserListResult } from "./managementShared";

type ManagementRole = "admin" | "moderator" | "user";

export function UsersPage({
  currentUserId,
  filteredUsers,
  search,
  summary,
  userEmptyLabel,
  onBanUser,
  onChangeSearch,
  onSetRole,
  onUnbanUser,
}: {
  currentUserId: Id<"users"> | null;
  filteredUsers: ManagementUserListResult["items"];
  search: string;
  summary: string;
  userEmptyLabel: string;
  onBanUser: (userId: Id<"users">, label: string) => void;
  onChangeSearch: (value: string) => void;
  onSetRole: (userId: Id<"users">, role: ManagementRole, label: string) => void;
  onUnbanUser: (userId: Id<"users">, label: string) => void;
}) {
  return (
    <div className="management-view">
      <h2 className="section-title text-[1.2rem] m-0">用户</h2>
      <p className="section-subtitle m-0 mt-1">
        员工与成员账户。可按 handle 搜索、变更角色或封禁账户。
      </p>
      <div className="management-controls">
        <div className="management-control management-search">
          <span className="mono">筛选</span>
          <input
            type="search"
            placeholder="搜索用户"
            value={search}
            onChange={(event) => onChangeSearch(event.target.value)}
          />
        </div>
        <div className="management-count">{summary}</div>
      </div>
      <div className="management-list">
        {filteredUsers.length === 0 ? (
          <div className="management-empty">{userEmptyLabel}</div>
        ) : (
          filteredUsers.map((user) => {
            const removed = Boolean(user.deletedAt || user.deactivatedAt);
            const removedAt = user.deactivatedAt ?? user.deletedAt ?? user._creationTime;
            const label = `@${user.handle ?? user.name ?? "user"}`;
            return (
              <div
                key={user._id}
                className={removed ? "management-item is-removed" : "management-item"}
              >
                <div className="management-item-main">
                  <span className="mono">@{user.handle ?? user.name ?? "user"}</span>
                  <div className="management-item-meta">
                    {removed
                      ? user.banReason && user.deletedAt
                        ? `已封禁 ${formatTimestamp(user.deletedAt)} · ${user.banReason}`
                        : `已删除 ${formatTimestamp(removedAt)}`
                      : `${user.role ?? "user"} · 加入于 ${formatTimestamp(user._creationTime)}`}
                  </div>
                </div>
                <div className="management-actions">
                  <Select
                    value={user.role ?? "user"}
                    onValueChange={(value) => {
                      if (value === "admin" || value === "moderator" || value === "user") {
                        onSetRole(user._id, value, label);
                      }
                    }}
                  >
                    <SelectTrigger size="sm" className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">用户</SelectItem>
                      <SelectItem value="moderator">审核员</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={user._id === currentUserId}
                    onClick={() => {
                      if (user._id === currentUserId) return;
                      onBanUser(user._id, label);
                    }}
                  >
                    封禁用户
                  </Button>
                  {user.deletedAt && !user.deactivatedAt ? (
                    <Button type="button" onClick={() => onUnbanUser(user._id, label)}>
                      解封用户
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
