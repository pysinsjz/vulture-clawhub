import { Link } from "@tanstack/react-router";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { familyLabel } from "../../lib/packageLabels";
import { formatTimestamp, type PluginByNameResult } from "./managementShared";

type PluginPackageId = NonNullable<NonNullable<PluginByNameResult>["package"]>["_id"];

export function PluginsPage({
  pluginSearch,
  selectedPlugin,
  selectedPluginName,
  onChangePluginSearch,
  onManagePlugin,
  onSetPackageBatch,
}: {
  pluginSearch: string;
  selectedPlugin: PluginByNameResult | undefined;
  selectedPluginName: string | undefined;
  onChangePluginSearch: (value: string) => void;
  onManagePlugin: () => void;
  onSetPackageBatch: (packageId: PluginPackageId, batch: "highlighted" | undefined) => void;
}) {
  return (
    <div className="management-view">
      <h2 className="section-title text-[1.2rem] m-0">Plugin 工具</h2>
      <p className="section-subtitle m-0 mt-1">
        查找 Plugin Package 以打开其审核工具。
      </p>
      <div className="management-controls">
        <div className="management-control management-search">
          <span className="mono">Package</span>
          <input
            type="search"
            placeholder="@scope/plugin-name or package-name"
            value={pluginSearch}
            onChange={(event) => onChangePluginSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onManagePlugin();
              }
            }}
          />
        </div>
        <Button type="button" onClick={onManagePlugin} disabled={!pluginSearch.trim()}>
          管理
        </Button>
      </div>
      {selectedPluginName ? (
        <div className="section-subtitle mt-2">
          正在管理 “{selectedPluginName}” ·{" "}
          <Link
            to="/management"
            search={{
              view: "plugins",
              skill: undefined,
              plugin: undefined,
            }}
          >
            清除选择
          </Link>
        </div>
      ) : null}
      <div className="management-list">
        {!selectedPluginName ? (
          <div className="management-empty">输入 Plugin Package 名以在此打开工具。</div>
        ) : selectedPlugin === undefined ? (
          <div className="management-empty">正在加载 Plugin…</div>
        ) : !selectedPlugin?.package ? (
          <div className="management-empty">未找到 Plugin “{selectedPluginName}”。</div>
        ) : (
          (() => {
            const plugin = selectedPlugin.package;
            const owner = selectedPlugin.owner;
            const latestRelease = selectedPlugin.latestRelease;
            const isHighlighted = Boolean(selectedPlugin.highlighted);

            return (
              <div key={plugin._id} className="management-item management-item-detail">
                <div className="management-item-main">
                  <Link to="/plugins/$name" params={{ name: plugin.name }}>
                    {plugin.displayName}
                  </Link>
                  <div className="section-subtitle m-0">
                    {owner?.handle ? `@${owner.handle}` : "未知所有者"} ·{" "}
                    {familyLabel(plugin.family)} · v{latestRelease?.version ?? "—"} · 更新于{" "}
                    {formatTimestamp(plugin.updatedAt)}
                    {plugin.softDeletedAt ? " · 已隐藏" : ""}
                    {isHighlighted ? " · 已精选" : ""}
                  </div>
                  <div className="management-tags">
                    <Badge>{plugin.channel}</Badge>
                    {plugin.isOfficial ? <Badge variant="official">官方</Badge> : null}
                    {plugin.executesCode ? <Badge>执行代码</Badge> : null}
                    {plugin.runtimeId ? <Badge>{plugin.runtimeId}</Badge> : null}
                  </div>
                  <div className="management-sublist">
                    <div className="management-report-item">
                      <span className="management-report-meta">Package 名称</span>
                      <span className="mono">{plugin.name}</span>
                    </div>
                    <div className="management-report-item">
                      <span className="management-report-meta">简介</span>
                      <span>{plugin.summary ?? "未提供简介。"}</span>
                    </div>
                    <div className="management-report-item">
                      <span className="management-report-meta">精选状态</span>
                      <span>
                        {isHighlighted
                          ? `精选于 ${formatTimestamp(selectedPlugin.highlighted?.at ?? 0)}`
                          : "未精选"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="management-actions management-action-grid">
                  <Button asChild className="management-action-btn">
                    <Link to="/plugins/$name" params={{ name: plugin.name }}>
                      查看
                    </Link>
                  </Button>
                  <Button
                    className="management-action-btn"
                    type="button"
                    onClick={() =>
                      onSetPackageBatch(plugin._id, isHighlighted ? undefined : "highlighted")
                    }
                  >
                    {isHighlighted ? "取消精选" : "精选"}
                  </Button>
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
