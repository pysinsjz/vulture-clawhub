import { createFileRoute, useSearch } from "@tanstack/react-router";
import { DocsLinks, getPackageScopeOwnerMismatch } from "clawhub-schema";
import { useAction, useMutation, useQuery } from "convex/react";
import { ExternalLink, Lock } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import semver from "semver";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { MAX_PUBLISH_FILE_BYTES, MAX_PUBLISH_TOTAL_BYTES } from "../../../convex/lib/publishLimits";
import { EmptyState } from "../../components/EmptyState";
import { Container } from "../../components/layout/Container";
import {
  PackageSourceChooser,
  type PackagePickSource,
} from "../../components/PackageSourceChooser";
import {
  PublisherOwnerSelect,
  type PublisherOwnerMembership,
} from "../../components/PublisherOwnerSelect";
import { PublishFormSkeleton } from "../../components/PublishFormSkeleton";
import { SignInButton } from "../../components/SignInButton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { VersionInput } from "../../components/VersionInput";
import {
  buildPackageUploadEntries,
  filterIgnoredPackageFiles,
  normalizePackageUploadFiles,
} from "../../lib/packageUpload";
import { derivePluginPrefill, listPrefilledFields } from "../../lib/pluginPublishPrefill";
import { expandFilesWithReport } from "../../lib/uploadFiles";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { formatPublishError, hashFile, uploadFile } from "../upload/-utils";

export const Route = createFileRoute("/plugins/publish")({
  validateSearch: (search) => ({
    ownerHandle: typeof search.ownerHandle === "string" ? search.ownerHandle : undefined,
    name: typeof search.name === "string" ? search.name : undefined,
    displayName: typeof search.displayName === "string" ? search.displayName : undefined,
    family:
      search.family === "code-plugin" || search.family === "bundle-plugin"
        ? search.family
        : undefined,
    nextVersion: typeof search.nextVersion === "string" ? search.nextVersion : undefined,
  }),
  component: PublishPluginRoute,
});

const apiRefs = api as unknown as {
  packages: {
    publishRelease: unknown;
  };
};

const SHOW_CLAWPACK_ONBOARDING_BANNER = false;
const PLUGIN_PUBLISHING_GUIDE_URL = "https://docs.openclaw.ai/clawhub/publishing#plugins";

type ParsedInspectorPublishError = {
  summary: string;
  findings: Array<{ code: string; message: string }>;
};

const PLUGIN_INSPECTOR_BLOCKED_PREFIX = "Plugin Inspector blocked publish:";

function parsePluginInspectorPublishError(message: string): ParsedInspectorPublishError | null {
  if (!message.startsWith(PLUGIN_INSPECTOR_BLOCKED_PREFIX)) return null;
  const body = message.slice(PLUGIN_INSPECTOR_BLOCKED_PREFIX.length).trim();
  if (!body) return { summary: "硬性发现项阻止了本次发布。", findings: [] };
  const [summaryPart, ...detailParts] = body.split(". ");
  const summary = summaryPart?.trim() || "硬性发现项阻止了本次发布。";
  const details = detailParts.join(". ").trim();
  if (!details) return { summary, findings: [] };
  const findings = details
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([a-z0-9._-]+):\s+(.+)$/i);
      return match
        ? { code: match[1]!, message: match[2]! }
        : { code: "plugin-inspector", message: part };
    });
  return { summary, findings };
}

function isPluginInspectorPublishError(message: string) {
  return Boolean(parsePluginInspectorPublishError(message));
}

function PluginPublishError({ message }: { message: string }) {
  const inspectorError = parsePluginInspectorPublishError(message);
  if (!inspectorError) {
    return (
      <div className="plugin-publish-error-text" role="alert">
        {message}
      </div>
    );
  }

  return (
    <div className="plugin-publish-error-panel" role="alert">
      <div className="plugin-publish-error-heading">
        <strong>Plugin Inspector 阻止了发布</strong>
        <span>{inspectorError.summary}</span>
      </div>
      {inspectorError.findings.length > 0 ? (
        <div className="plugin-publish-error-table-wrap">
          <table className="plugin-publish-error-table">
            <thead>
              <tr>
                <th scope="col">编码</th>
                <th scope="col">消息</th>
              </tr>
            </thead>
            <tbody>
              {inspectorError.findings.map((finding) => (
                <tr key={`${finding.code}:${finding.message}`}>
                  <td>
                    <code>{finding.code}</code>
                  </td>
                  <td>{finding.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function PublishPluginRoute() {
  const search = useSearch({ from: "/plugins/publish" });
  const { isAuthenticated, isLoading: isAuthLoading, me } = useAuthStatus();
  const publishers = useQuery(api.publishers.listMine, me ? {} : "skip") as
    | Array<PublisherOwnerMembership>
    | undefined;
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const publishRelease = useAction(apiRefs.packages.publishRelease as never) as unknown as (args: {
    payload: unknown;
  }) => Promise<unknown>;
  const [family, setFamily] = useState<"code-plugin" | "bundle-plugin">("code-plugin");
  const [name, setName] = useState(search.name ?? "");
  const [displayName, setDisplayName] = useState(search.displayName ?? "");
  const [ownerHandle, setOwnerHandle] = useState(search.ownerHandle ?? "");
  const [version, setVersion] = useState(search.nextVersion ?? "0.1.0");
  const [changelog, setChangelog] = useState("");
  const [bundleFormat, setBundleFormat] = useState("");
  const [hostTargets, setHostTargets] = useState("");
  // Marketplace category — operator-curated dictionary (active rows only) loaded
  // from the public query. Required at the form layer so publishers cannot
  // silently slip into the "other" bucket; the server still accepts payloads
  // without a slug during the 60-day compat window and warns on the response.
  const [pluginCategorySlug, setPluginCategorySlug] = useState("");
  const pluginCategories = useQuery(
    api.marketplaceCategories.listPluginCategoriesDictionary,
    {},
  ) as Array<{ slug: string; label: string; order: number; icon: string | null }> | undefined;
  const [files, setFiles] = useState<File[]>([]);
  const [packageSourceKind, setPackageSourceKind] = useState<PackagePickSource | null>(null);
  const [ignoredPaths, setIgnoredPaths] = useState<string[]>([]);
  const [detectedPrefillFields, setDetectedPrefillFields] = useState<string[]>([]);
  const [codePluginFieldIssues, setCodePluginFieldIssues] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showChangelogField = Boolean(search.name);

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const normalizedPaths = useMemo(
    () => normalizePackageUploadFiles(files).map((entry) => entry.path),
    [files],
  );
  const normalizedPathSet = useMemo(
    () => new Set(normalizedPaths.map((path) => path.toLowerCase())),
    [normalizedPaths],
  );
  const oversizedFiles = useMemo(
    () => files.filter((file) => file.size > MAX_PUBLISH_FILE_BYTES),
    [files],
  );
  const oversizedFileNames = useMemo(
    () => oversizedFiles.slice(0, 3).map((file) => file.name),
    [oversizedFiles],
  );
  const validationError =
    oversizedFiles.length > 0
      ? `每个文件不得超过 10MB：${oversizedFileNames.join(", ")}`
      : totalBytes > MAX_PUBLISH_TOTAL_BYTES
        ? "文件总大小超过 50MB。"
        : null;
  const isMetadataLocked = files.length === 0;
  const metadataDisabled = isMetadataLocked || isSubmitting;
  const ownerScopeError = useMemo(() => {
    return getPackageScopeOwnerMismatch(name, ownerHandle)?.message ?? null;
  }, [name, ownerHandle]);
  const submitBlockers = useMemo(() => {
    if (isMetadataLocked) return [];
    const blockers: string[] = [];
    if (!name.trim()) blockers.push("Plugin 名称不能为空。");
    if (!version.trim()) blockers.push("版本号不能为空。");
    if (!pluginCategorySlug.trim()) blockers.push("请选择 Plugin 归类。");
    return blockers;
  }, [isMetadataLocked, name, version, pluginCategorySlug]);
  const hasPackageBlocker =
    Boolean(validationError) ||
    Boolean(ownerScopeError) ||
    (family === "code-plugin" && codePluginFieldIssues.length > 0);
  const hasPublished = status?.startsWith("已发布。") ?? false;
  const isPublishDisabled =
    !isAuthenticated ||
    isMetadataLocked ||
    hasPackageBlocker ||
    submitBlockers.length > 0 ||
    isSubmitting ||
    hasPublished;
  const publishBlockerSummary = useMemo(() => {
    if (isSubmitting) return null;
    if (!isAuthenticated) return "请登录后发布。";
    if (isMetadataLocked) return "请补全 Plugin 文件后发布。";
    if (validationError) return `请修复：${validationError}`;
    if (ownerScopeError) return `请修复：${ownerScopeError}`;
    if (family === "code-plugin" && codePluginFieldIssues.length > 0) {
      return `请修复包元数据：${formatInlineList(codePluginFieldIssues)}。`;
    }
    const missing = submitBlockers.flatMap(missingPluginPublishLabel);
    const uniqueMissing = [...new Set(missing)];
    if (uniqueMissing.length > 0) {
      return `补全 ${formatInlineList(uniqueMissing)} 后再发布。`;
    }
    return null;
  }, [
    codePluginFieldIssues,
    family,
    isAuthenticated,
    isMetadataLocked,
    isSubmitting,
    ownerScopeError,
    submitBlockers,
    validationError,
  ]);

  const onPickFiles = async (selected: File[], sourceKind: PackagePickSource) => {
    const expanded = await expandFilesWithReport(selected, {
      includeBinaryArchiveFiles: true,
    });
    const filtered = await filterIgnoredPackageFiles(expanded.files);
    const normalized = normalizePackageUploadFiles(filtered.files);
    const nextIgnoredPaths = [
      ...new Set([...expanded.ignoredLocalMetadataPaths, ...filtered.ignoredPaths]),
    ];
    setFiles(filtered.files);
    setPackageSourceKind(sourceKind);
    setIgnoredPaths(nextIgnoredPaths);
    setError(null);
    setStatus(null);
    const prefill = await derivePluginPrefill(normalized);
    setDetectedPrefillFields(listPrefilledFields(prefill));
    setCodePluginFieldIssues(prefill.missingRequiredFields ?? []);
    if (prefill.family) setFamily(prefill.family);
    if (prefill.name) setName(prefill.name);
    if (prefill.displayName) setDisplayName(prefill.displayName);
    if (prefill.version) setVersion(prefill.version);
    if (prefill.bundleFormat) setBundleFormat(prefill.bundleFormat);
    if (prefill.hostTargets) setHostTargets(prefill.hostTargets);
  };

  const clearSelectedFiles = () => {
    setFiles([]);
    setPackageSourceKind(null);
    setIgnoredPaths([]);
    setDetectedPrefillFields([]);
    setCodePluginFieldIssues([]);
    setError(null);
    setStatus(null);
  };

  useEffect(() => {
    if (ownerHandle) return;
    const personal =
      publishers?.find((entry) => entry.publisher.kind === "user") ?? publishers?.[0];
    if (personal?.publisher.handle) {
      setOwnerHandle(personal.publisher.handle);
    }
  }, [ownerHandle, publishers]);

  if (isAuthLoading) {
    return <PublishFormSkeleton />;
  }

  if (!isAuthenticated || !me) {
    return (
      <main className="py-10">
        <Container size="narrow">
          <EmptyState
            title="登录后发布 Plugin"
            description="你需要登录后才能在 ClawHub 上发布 Plugin。"
          >
            <SignInButton />
          </EmptyState>
        </Container>
      </main>
    );
  }

  return (
    <main className="py-10">
      <Container size="narrow">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="mb-2 font-display text-2xl font-bold text-[color:var(--ink)]">
              {search.name ? "发布 Plugin 版本" : "发布 Plugin"}
            </h1>
            <p className="text-sm text-[color:var(--ink-soft)]">
              拖入或选择 Plugin 文件夹、.zip 或 .tgz
            </p>
            {search.name ? (
              <p className="text-sm text-[color:var(--ink-soft)]">
                已为 {search.displayName ?? search.name} 预填
                {search.nextVersion && semver.valid(search.nextVersion)
                  ? ` \u00b7 建议 ${search.nextVersion}`
                  : ""}
              </p>
            ) : null}
          </div>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <a href={PLUGIN_PUBLISHING_GUIDE_URL} target="_blank" rel="noreferrer">
              Plugin 发布指南
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        </header>

        {SHOW_CLAWPACK_ONBOARDING_BANNER ? (
          <Card className="mb-5 border-[rgba(255,107,74,0.3)] bg-[rgba(255,107,74,0.06)]">
            <p className="text-sm font-medium text-[color:var(--ink)]">
              ClawPack 发布正在迁移到 npm-pack .tgz 上传。
            </p>
            <p className="mt-1 text-sm text-[color:var(--ink-soft)]">
              在 Web 上传器仍走旧兼容路径期间，请使用 CLI 获取精确的 ClawPack 字节。
            </p>
          </Card>
        ) : null}

        <PackageSourceChooser
          files={files}
          totalBytes={totalBytes}
          normalizedPaths={normalizedPaths}
          normalizedPathSet={normalizedPathSet}
          selectedSourceKind={packageSourceKind}
          ignoredPaths={ignoredPaths}
          detectedPrefillFields={detectedPrefillFields}
          family={family}
          validationError={validationError}
          codePluginFieldIssues={codePluginFieldIssues}
          onPickFiles={onPickFiles}
          onClearFiles={clearSelectedFiles}
        />

        <div
          className={
            isMetadataLocked
              ? "relative max-h-[540px] overflow-hidden md:max-h-[600px]"
              : "contents"
          }
        >
          <Card
            className={isMetadataLocked ? "pointer-events-none opacity-60" : ""}
            aria-disabled={isMetadataLocked}
          >
            <div className="flex flex-col gap-5">
              <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pluginName">Plugin 名称</Label>
                  <Input
                    id="pluginName"
                    placeholder="Plugin 名称"
                    value={name}
                    disabled={metadataDisabled}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                {ownerScopeError ? (
                  <Badge variant="warning" className="md:col-span-2">
                    <span>{ownerScopeError}</span>
                    <a
                      href={DocsLinks.clawhub.packageScopeFaq}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      了解发布机制
                    </a>
                  </Badge>
                ) : null}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pluginDisplayName">显示名称</Label>
                  <Input
                    id="pluginDisplayName"
                    placeholder="显示名称"
                    value={displayName}
                    disabled={metadataDisabled}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pluginFamily">包类型</Label>
                  <Select
                    value={family}
                    disabled={metadataDisabled}
                    onValueChange={(value) => {
                      if (value === "code-plugin" || value === "bundle-plugin") {
                        setFamily(value);
                      }
                    }}
                  >
                    <SelectTrigger id="pluginFamily" className="min-h-[44px] w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="code-plugin">代码插件</SelectItem>
                      <SelectItem value="bundle-plugin">捆绑插件</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pluginOwner">所有者</Label>
                  <PublisherOwnerSelect
                    id="pluginOwner"
                    value={ownerHandle}
                    memberships={publishers}
                    disabled={metadataDisabled}
                    onValueChange={setOwnerHandle}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pluginVersion">版本</Label>
                  <VersionInput
                    id="pluginVersion"
                    placeholder="版本"
                    value={version}
                    disabled={metadataDisabled}
                    onValueChange={setVersion}
                  />
                </div>
                <div className="flex flex-col gap-2 md:col-span-2">
                  <Label htmlFor="pluginCategorySlug">归类</Label>
                  <Select
                    value={pluginCategorySlug}
                    disabled={metadataDisabled || pluginCategories === undefined}
                    onValueChange={setPluginCategorySlug}
                  >
                    <SelectTrigger id="pluginCategorySlug" className="min-h-[44px] w-full">
                      <SelectValue
                        placeholder={
                          pluginCategories === undefined ? "正在加载分类…" : "选择 Plugin 归类"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(pluginCategories ?? [])
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((entry) => (
                          <SelectItem key={entry.slug} value={entry.slug}>
                            {entry.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {family === "bundle-plugin" ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="pluginBundleFormat">捆绑格式</Label>
                      <Input
                        id="pluginBundleFormat"
                        placeholder="捆绑格式"
                        value={bundleFormat}
                        disabled={metadataDisabled}
                        onChange={(event) => setBundleFormat(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="pluginHostTargets">宿主目标</Label>
                      <Input
                        id="pluginHostTargets"
                        placeholder="宿主目标（逗号分隔）"
                        value={hostTargets}
                        disabled={metadataDisabled}
                        onChange={(event) => setHostTargets(event.target.value)}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </Card>

          {showChangelogField ? (
            <Card
              className={`mt-5 ${isMetadataLocked ? "pointer-events-none opacity-60" : ""}`}
              aria-disabled={isMetadataLocked}
            >
              <div>
                <h2 className="font-display text-lg font-bold leading-tight text-[color:var(--ink)]">
                  更新日志
                </h2>
                <p className="mt-1 text-sm text-[color:var(--ink-soft)]">概述此版本的变更。</p>
              </div>
              <Label htmlFor="pluginChangelog" className="sr-only">
                更新日志
              </Label>
              <Textarea
                id="pluginChangelog"
                placeholder="描述此版本的变更…"
                rows={4}
                value={changelog}
                disabled={metadataDisabled}
                onChange={(event) => setChangelog(event.target.value)}
              />
            </Card>
          ) : null}

          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              {error ? <PluginPublishError message={error} /> : null}
              {status ? <div className="text-sm text-[color:var(--ink-soft)]">{status}</div> : null}
              {!status ? (
                <div className="text-sm text-[color:var(--ink-soft)]">
                  新版本在自动安全检查与验证完成前保持私有。
                </div>
              ) : null}
              {publishBlockerSummary ? (
                <div className="text-sm font-medium text-status-error-fg">
                  {publishBlockerSummary}
                </div>
              ) : null}
            </div>
            <Button
              variant="primary"
              size="lg"
              type="button"
              disabled={isPublishDisabled}
              loading={isSubmitting}
              onClick={() => {
                startTransition(() => {
                  void (async () => {
                    try {
                      if (validationError) {
                        toast.error(validationError);
                        return;
                      }
                      if (ownerScopeError) {
                        toast.error(ownerScopeError);
                        return;
                      }
                      if (family === "code-plugin" && codePluginFieldIssues.length > 0) {
                        toast.error(
                          `缺少必需的 OpenClaw 包元数据：${codePluginFieldIssues.join(", ")}`,
                        );
                        return;
                      }
                      setIsSubmitting(true);
                      setStatus("正在上传文件…");
                      setError(null);
                      const uploaded = await buildPackageUploadEntries(files, {
                        generateUploadUrl,
                        hashFile,
                        uploadFile,
                      });
                      setStatus("正在发布版本…");
                      await publishRelease({
                        payload: {
                          name: name.trim(),
                          displayName: displayName.trim() || undefined,
                          ownerHandle: ownerHandle || undefined,
                          family,
                          version: version.trim(),
                          changelog: changelog.trim(),
                          pluginCategorySlug: pluginCategorySlug.trim() || undefined,
                          ...(family === "bundle-plugin"
                            ? {
                                bundle: {
                                  format: bundleFormat.trim() || undefined,
                                  hostTargets: hostTargets
                                    .split(",")
                                    .map((entry) => entry.trim())
                                    .filter(Boolean),
                                },
                              }
                            : {}),
                          files: uploaded,
                        },
                      });
                      setStatus("已发布。等待安全检查与验证后才会公开列出。");
                    } catch (publishError) {
                      const message = formatPublishError(publishError);
                      setError(message);
                      if (!isPluginInspectorPublishError(message)) {
                        toast.error(message);
                      }
                      setStatus(null);
                    } finally {
                      setIsSubmitting(false);
                    }
                  })();
                });
              }}
            >
              {isPublishDisabled && !isSubmitting ? (
                <Lock className="h-4 w-4" aria-hidden="true" />
              ) : null}
              发布 Plugin
            </Button>
          </div>

          {isMetadataLocked ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-44"
              style={{
                background: "linear-gradient(to bottom, transparent, var(--bg) 88%)",
              }}
            />
          ) : null}
        </div>
      </Container>
    </main>
  );
}

function formatInlineList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]}和${items[1]}`;
  return `${items.slice(0, -1).join("、")}和${items.at(-1)}`;
}

function missingPluginPublishLabel(issue: string) {
  if (issue === "Plugin 名称不能为空。") return ["Plugin 名称"];
  if (issue === "版本号不能为空。") return ["版本"];
  if (issue === "GitHub 仓库不能为空。") return ["GitHub 仓库"];
  if (issue === "Commit SHA 不能为空。") return ["commit SHA"];
  if (issue === "请选择 Plugin 归类。") return ["归类"];
  return [];
}
