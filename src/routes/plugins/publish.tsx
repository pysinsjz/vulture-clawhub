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
    family: search.family === "code-plugin" ? search.family : undefined,
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
  if (!body) return { summary: "Hard findings blocked this publish.", findings: [] };
  const [summaryPart, ...detailParts] = body.split(". ");
  const summary = summaryPart?.trim() || "Hard findings blocked this publish.";
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
        <strong>Plugin Inspector blocked publish</strong>
        <span>{inspectorError.summary}</span>
      </div>
      {inspectorError.findings.length > 0 ? (
        <div className="plugin-publish-error-table-wrap">
          <table className="plugin-publish-error-table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Message</th>
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
      ? `Each file must be 10MB or smaller: ${oversizedFileNames.join(", ")}`
      : totalBytes > MAX_PUBLISH_TOTAL_BYTES
        ? "Total file size exceeds 50MB."
        : null;
  const isMetadataLocked = files.length === 0;
  const metadataDisabled = isMetadataLocked || isSubmitting;
  const ownerScopeError = useMemo(() => {
    return getPackageScopeOwnerMismatch(name, ownerHandle)?.message ?? null;
  }, [name, ownerHandle]);
  const submitBlockers = useMemo(() => {
    if (isMetadataLocked) return [];
    const blockers: string[] = [];
    if (!name.trim()) blockers.push("Plugin name is required.");
    if (!version.trim()) blockers.push("Version is required.");
    return blockers;
  }, [isMetadataLocked, name, version]);
  const hasPackageBlocker =
    Boolean(validationError) || Boolean(ownerScopeError) || codePluginFieldIssues.length > 0;
  const hasPublished = status?.startsWith("Published.") ?? false;
  const isPublishDisabled =
    !isAuthenticated ||
    isMetadataLocked ||
    hasPackageBlocker ||
    submitBlockers.length > 0 ||
    isSubmitting ||
    hasPublished;
  const publishBlockerSummary = useMemo(() => {
    if (isSubmitting) return null;
    if (!isAuthenticated) return "Sign in to publish.";
    if (isMetadataLocked) return "Complete plugin files to publish.";
    if (validationError) return `Fix: ${validationError}`;
    if (ownerScopeError) return `Fix: ${ownerScopeError}`;
    if (codePluginFieldIssues.length > 0) {
      return `Fix package metadata: ${formatInlineList(codePluginFieldIssues)}.`;
    }
    const missing = submitBlockers.flatMap(missingPluginPublishLabel);
    const uniqueMissing = [...new Set(missing)];
    if (uniqueMissing.length > 0) {
      return `Complete ${formatInlineList(uniqueMissing)} to publish.`;
    }
    return null;
  }, [
    codePluginFieldIssues,
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
    if (prefill.family === "code-plugin") setFamily(prefill.family);
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
            title="Sign in to publish a plugin"
            description="You need to be signed in to publish plugins on ClawHub."
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
              {search.name ? "Publish Plugin Release" : "Publish Plugin"}
            </h1>
            <p className="text-sm text-[color:var(--ink-soft)]">
              Drop or select a plugin folder, .zip, or .tgz
            </p>
            {search.name ? (
              <p className="text-sm text-[color:var(--ink-soft)]">
                Prefilled for {search.displayName ?? search.name}
                {search.nextVersion && semver.valid(search.nextVersion)
                  ? ` \u00b7 suggested ${search.nextVersion}`
                  : ""}
              </p>
            ) : null}
          </div>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <a href={PLUGIN_PUBLISHING_GUIDE_URL} target="_blank" rel="noreferrer">
              Plugin publishing guide
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        </header>

        {SHOW_CLAWPACK_ONBOARDING_BANNER ? (
          <Card className="mb-5 border-[rgba(255,107,74,0.3)] bg-[rgba(255,107,74,0.06)]">
            <p className="text-sm font-medium text-[color:var(--ink)]">
              ClawPack publishing is moving to npm-pack .tgz uploads.
            </p>
            <p className="mt-1 text-sm text-[color:var(--ink-soft)]">
              Use the CLI for exact ClawPack bytes while the web uploader remains on the legacy
              compatibility path.
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
                  <Label htmlFor="pluginName">Plugin name</Label>
                  <Input
                    id="pluginName"
                    placeholder="Plugin name"
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
                      Learn how publishing works
                    </a>
                  </Badge>
                ) : null}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pluginDisplayName">Display name</Label>
                  <Input
                    id="pluginDisplayName"
                    placeholder="Display name"
                    value={displayName}
                    disabled={metadataDisabled}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pluginFamily">Package type</Label>
                  <div
                    id="pluginFamily"
                    className="min-h-[44px] w-full rounded-[var(--radius-sm)] border border-[rgba(29,59,78,0.22)] bg-[rgba(255,255,255,0.94)] px-3.5 py-[13px] text-sm text-[color:var(--ink)] dark:border-[rgba(255,255,255,0.12)] dark:bg-[rgba(14,28,37,0.84)]"
                  >
                    {family === "code-plugin" ? "Code plugin" : "Bundle plugin"}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pluginOwner">Owner</Label>
                  <PublisherOwnerSelect
                    id="pluginOwner"
                    value={ownerHandle}
                    memberships={publishers}
                    disabled={metadataDisabled}
                    onValueChange={setOwnerHandle}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pluginVersion">Version</Label>
                  <VersionInput
                    id="pluginVersion"
                    placeholder="Version"
                    value={version}
                    disabled={metadataDisabled}
                    onValueChange={setVersion}
                  />
                </div>
                {family === "bundle-plugin" ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="pluginBundleFormat">Bundle format</Label>
                      <Input
                        id="pluginBundleFormat"
                        placeholder="Bundle format"
                        value={bundleFormat}
                        disabled={metadataDisabled}
                        onChange={(event) => setBundleFormat(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="pluginHostTargets">Host targets</Label>
                      <Input
                        id="pluginHostTargets"
                        placeholder="Host targets (comma separated)"
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
                  Changelog
                </h2>
                <p className="mt-1 text-sm text-[color:var(--ink-soft)]">
                  Summarize what changed in this release.
                </p>
              </div>
              <Label htmlFor="pluginChangelog" className="sr-only">
                Changelog
              </Label>
              <Textarea
                id="pluginChangelog"
                placeholder="Describe what changed in this release..."
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
                  New releases stay private until automated security checks and verification finish.
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
                          `Missing required OpenClaw package metadata: ${codePluginFieldIssues.join(", ")}`,
                        );
                        return;
                      }
                      setIsSubmitting(true);
                      setStatus("Uploading files...");
                      setError(null);
                      const uploaded = await buildPackageUploadEntries(files, {
                        generateUploadUrl,
                        hashFile,
                        uploadFile,
                      });
                      setStatus("Publishing release...");
                      await publishRelease({
                        payload: {
                          name: name.trim(),
                          displayName: displayName.trim() || undefined,
                          ownerHandle: ownerHandle || undefined,
                          family,
                          version: version.trim(),
                          changelog: changelog.trim(),
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
                      setStatus(
                        "Published. Pending security checks and verification before public listing.",
                      );
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
              Publish plugin
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
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function missingPluginPublishLabel(issue: string) {
  if (issue === "Plugin name is required.") return ["plugin name"];
  if (issue === "Version is required.") return ["version"];
  if (issue === "GitHub repository is required.") return ["GitHub repository"];
  if (issue === "Commit SHA is required.") return ["commit SHA"];
  return [];
}
