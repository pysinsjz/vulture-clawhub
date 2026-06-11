import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { getRuntimeEnv } from "../lib/runtimeEnv";
import { getSiteName } from "../lib/site";

type ApiSpecKind = "rest" | "functions";

export const Route = createFileRoute("/api-docs")({
  head: () => ({
    meta: [{ title: `API 文档 · ${getSiteName()}` }],
  }),
  component: ApiDocsPage,
});

/** REST 端点由 Convex site（HTTP Actions）提供；函数 API 自带 servers，无需注入。 */
function resolveRestServerUrl() {
  for (const candidate of [
    getRuntimeEnv("VITE_CONVEX_SITE_URL"),
    getRuntimeEnv("VITE_CONVEX_URL"),
  ]) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      return new URL(value).toString();
    } catch {
      continue;
    }
  }
  return typeof window === "undefined" ? "/" : window.location.origin;
}

function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [specKind, setSpecKind] = useState<ApiSpecKind>("rest");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    let cancelled = false;
    setError(null);

    const render = async () => {
      const [bundleModule] = await Promise.all([
        import("swagger-ui-dist/swagger-ui-bundle.js"),
        import("swagger-ui-dist/swagger-ui.css"),
      ]);
      const SwaggerUIBundle = bundleModule.default;
      if (specKind === "rest") {
        const response = await fetch("/openapi.json");
        if (!response.ok) throw new Error(`加载 openapi.json 失败（HTTP ${response.status}）`);
        const spec = (await response.json()) as Record<string, unknown>;
        if (cancelled) return;
        SwaggerUIBundle({
          domNode: node,
          spec: { ...spec, servers: [{ url: resolveRestServerUrl(), description: "当前部署" }] },
          docExpansion: "list",
          deepLinking: false,
          tryItOutEnabled: true,
        });
      } else {
        if (cancelled) return;
        SwaggerUIBundle({
          domNode: node,
          url: "/openapi-functions.yaml",
          docExpansion: "none",
          deepLinking: false,
          tryItOutEnabled: true,
        });
      }
    };

    render().catch((loadError) => {
      if (cancelled) return;
      setError(loadError instanceof Error ? loadError.message : "加载 API 文档失败。");
    });

    return () => {
      cancelled = true;
      node.innerHTML = "";
    };
  }, [specKind]);

  return (
    <main className="browse-page">
      <div className="browse-page-header">
        <h1 className="browse-title">API 文档</h1>
      </div>
      <p className="section-subtitle m-0">
        REST API 面向集成方（核心端点，手工维护）；Convex 函数 API 由部署的函数定义自动生成（
        <span className="mono">/api/run/*</span>）。
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant={specKind === "rest" ? "primary" : "outline"}
          onClick={() => setSpecKind("rest")}
        >
          REST API
        </Button>
        <Button
          type="button"
          variant={specKind === "functions" ? "primary" : "outline"}
          onClick={() => setSpecKind("functions")}
        >
          Convex 函数 API
        </Button>
      </div>
      {error ? <p className="section-subtitle mt-4">{error}</p> : null}
      <div ref={containerRef} className="mt-4 rounded-lg bg-white" data-testid="swagger-container" />
    </main>
  );
}
