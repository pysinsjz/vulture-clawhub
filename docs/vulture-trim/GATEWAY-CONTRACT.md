# ClawHub 需向网关暴露的功能契约（出站接口规格）

> 本文由 **vulture-gateway** 仓同步而来（源：`docs/flows/clawhub-gateway-contract.md`），是 **vulture-gateway → 内网 ClawHub** 出站调用契约的权威清单，供本仓（ClawHub fork）据此产出对接/实现文档。
> 契约源头 = 网关 `internal/clawhub` client 的实际调用面（网关仓 `client.go` / `skills.go` / `packages.go` / `security.go`）。
> 整合背景、桌面端生命周期见网关仓 `docs/flows/clawhub-integration.md`、`docs/flows/skill-plugin-lifecycle.md`。
> 现状对账与待改造项见本仓 [#1](https://github.com/pysinsjz/vulture-clawhub/issues/1)。

## 0. 通用约定

- **基址**：网关以 `base_url = http://<host>:3211/api/v1` 调用（3211 = Convex HTTP Actions 站点口；`/api/v1` = httpRouter 前缀）。本文所有路径**相对于该基址**，即「`/skills`」实际打到「`http://<host>:3211/api/v1/skills`」。
- **鉴权**：ClawHub 纯内网、**无鉴权**。桌面端鉴权全部由网关 JWTAuth 承担；ClawHub 只接受来自网关的内网调用，不带也不校验 Authorization 头。
- **时间戳**：所有时间字段为 `int64` Unix 秒/毫秒（与上游一致即可，网关原样透传）。
- **错误体**：非 2xx 统一返回 `{ "error": "<code>", "message": "<msg>" }`（或纯文本，网关兜底解析）。网关按 ADR-0011 重映射状态码，**业务状态码原样上抛、由网关透传给桌面端**：
  - `404` 资源不存在
  - `410` 软删除（版本/skill 已下架）
  - `423` 制品未就绪（安全门未放行、签发未完成）
  - `409` pending（扫描/审核进行中）
  - `403` 被阻断（`decision=fail` / `blockedFromDownload=true`）
- **下载语义**：`download-url` / `artifact-url` 端点**返回 JSON `{ "url": "<短时效预签名 URL>" }`**，网关据此 `302` 转桌面端，桌面端直连存储取字节、用版本详情里的 `artifact.sha256` 自校验。**不是**流式吐 zip、**不是** 307 内跳。存储后端 = 自托管 MinIO（S3 兼容），见 [convex-selfhost-minio]。

---

## 1. Skill 族（skills / skillVersions）

### 1.1 `GET /skills` — skill 列表

**Query**：`limit`(int, 可选) · `cursor`(string, 游标) · `sort`(`updated|downloads|stars|installsCurrent|trending`) · `category`(string, 浏览分类 id)

**Response 200**：
```jsonc
{
  "items": [
    {
      "slug": "string",
      "displayName": "string",
      "summary": "string?",
      "category": { "id": "string", "label": "string" } | null,   // fork 原生字段（§5）
      "tags": { "<tag>": "<versionId>" },                          // 例：{"latest":"...","stable":"..."}
      "createdAt": 0,
      "updatedAt": 0,
      "latestVersion": {
        "version": "string", "createdAt": 0, "changelog": "string", "license": "string?"
      } | null,
      "metadata": { "os": ["string"]?, "systems": ["string"]? } | null   // 网关按此做 X-Platform 过滤
    }
  ],
  "nextCursor": "string" | null
}
```

### 1.2 `GET /skills/{slug}` — skill 详情

**Response 200**：
```jsonc
{
  "skill": {
    "slug": "string", "displayName": "string", "summary": "string?",
    "category": { "id": "string", "label": "string" } | null,
    "tags": { "<tag>": "<versionId>" }, "createdAt": 0, "updatedAt": 0
  },
  "latestVersion": { "version": "string", "createdAt": 0, "changelog": "string", "license": "string?" } | null,
  "metadata": { "os": ["string"]?, "systems": ["string"]? } | null
}
```

### 1.3 `GET /skills/{slug}/versions` — 版本历史（分页）

**Query**：`limit`(int) · `cursor`(string)

**Response 200**：
```jsonc
{
  "items": [
    { "version": "string", "createdAt": 0, "changelog": "string", "changelogSource": "string?" }
  ],
  "nextCursor": "string" | null
}
```

### 1.4 `GET /skills/{slug}/versions/{version}` — 单版本详情

**Response 200**：
```jsonc
{
  "skill": { "slug": "string", "displayName": "string" },
  "version": {
    "version": "string", "createdAt": 0, "changelog": "string", "changelogSource": "string?",
    "files": [ { "path": "string", "size": 0, "sha256": "string", "contentType": "string?" } ],
    "artifact": { "sha256": "string", "size": 0 }     // 客户端下载后据此校验完整性
  }
}
```

### 1.5 `GET /skills/{slug}/resolve?hash=<sha256>` — 指纹解析

把本地指纹映射到已发布版本。**Query**：`hash`（64 位 hex sha256，必填）。

**契约形态**：嵌套于 `{slug}` 下、slug 走路径段。

**Response 200**：
```jsonc
{
  "slug": "string",
  "match": { "version": "string" } | null,        // null = 本地指纹不匹配任何已发布版本
  "latestVersion": { "version": "string" } | null
}
```

### 1.6 `GET /skills/{slug}/download-url?version=<v>` — skill 下载签发

**Query**：`version`(可选；空 = latest)。ClawHub 内部强制安全门（`decision=fail → 403`）后再签发。

**Response 200**：`{ "url": "<短时效预签名 URL>" }`
**被阻断/未就绪**：`403` / `423` / `409`（不返 url 体）。

### 1.7 `POST /skills/-/security-verdicts` — 批量安全裁决

**Body**：`{ "items": [ { "slug": "string", "version": "string" } ] }`（1–100 条）

**Response 200**：
```jsonc
{
  "schema": "clawhub.skill.security-verdicts.v1",
  "items": [
    {
      "ok": true,
      "decision": "pass" | "fail",                 // 放行权威信号
      "reasons": ["string"],
      "requestedSlug": "string", "slug": "string?", "displayName": "string?",
      "requestedVersion": "string", "version": "string?",
      "security": {
        "status": "clean" | "suspicious" | "malicious" | "pending",
        "passed": true,
        "signals": { "staticScan": { "status": "string", "reasonCodes": ["string"]? } }?
      } | null,
      "error": { "code": "string", "message": "string" }?
    }
  ]
}
```

---

## 2. Plugin 族（packages / packageReleases）

> 网关用 `/packages*` 承载 plugin（含 code-plugin / bundle-plugin）。`{name}` 可为 scoped 名（`@scope/name`）。

### 2.1 `GET /packages` — plugin 列表

**Query**：`limit` · `cursor` · `sort` · `family`(`code-plugin|bundle-plugin`) · `channel`(`official|community|private`) · `category`

**Response 200**：
```jsonc
{
  "items": [
    {
      "name": "string", "displayName": "string", "summary": "string?",
      "pluginCategory": { "id": "string", "label": "string" } | null,   // 网关翻译为对外 category
      "family": "string", "channel": "string", "isOfficial": false,
      "latestVersion": "string?",
      "capabilityTags": ["string"]?,
      "executesCode": true | false | null,
      "verificationTier": "string?", "scanStatus": "string?",
      "hostTargets": ["string"]?, "minAppVersion": "string?"            // 网关 fetch-then-filter 用，不外露
    }
  ],
  "nextCursor": "string" | null
}
```

### 2.2 `GET /packages/{name}` — plugin 详情

**Response 200**：
```jsonc
{
  "package": { "name": "string", "displayName": "string", "family": "string", "channel": "string", "isOfficial": false },
  "latestVersion": { "version": "string", "createdAt": 0, "changelog": "string" } | null,
  "compatibility": {
    "pluginApiRange": "string?", "builtWithOpenClawVersion": "string?", "pluginSdkVersion": "string?",
    "minGatewayVersion": "string?", "minAppVersion": "string?", "hostTargets": ["string"]?
  }?,
  "pluginCategory": { "id": "string", "label": "string" } | null
}
```

### 2.3 `GET /packages/{name}/releases/{version}` — plugin 单版本详情

> 段名为 **`releases`**（契约要求）。fork 现状是 `versions`，需加别名或对齐。

**Response 200**：
```jsonc
{
  "package": { "name": "string", "displayName": "string", "family": "string" },
  "version": {
    "version": "string", "createdAt": 0, "changelog": "string",
    "distTags": ["string"]?,
    "files": [ { "path": "string", "size": 0, "sha256": "string", "contentType": "string?" } ]?,
    "compatibility": { /* 同 2.2 Compatibility */ }?,
    "capabilities": { }?,
    "artifact": { "kind": "legacy-zip" | "npm-pack", "sha256": "string", "size": 0 }?,
    "sha256hash": "string?"
  }
}
```

### 2.4 `GET /packages/{name}/download-url?version=<v>` — plugin（legacy-zip）下载签发

**Response 200**：`{ "url": "<短时效预签名 URL>" }`（被阻断/未就绪 → `403`/`423`/`409`）

### 2.5 `GET /packages/{name}/releases/{version}/artifact-url` — plugin（npm-pack .tgz）下载签发

**Response 200**：`{ "url": "<短时效预签名 URL>" }`

### 2.6 `GET /packages/{name}/releases/{version}/security` — plugin 单查安装阻断

**Response 200**：
```jsonc
{
  "package": { "name": "string" },
  "release": { "version": "string", "artifactSha256": "string" },
  "trust": {
    "scanStatus": "clean" | "suspicious" | "malicious" | "pending" | "not-run",
    "moderationState": "string?",
    "blockedFromDownload": false,        // 权威阻断信号
    "reasons": ["string"],
    "pending": false?, "stale": false?
  }
}
```

---

## 3. 安装遥测

### 3.1 `POST /telemetry/install` — 安装状态快照对账

> 按 root 做**状态快照对账**（非自增计数），幂等。

**Body**：
```jsonc
{
  "roots": [
    {
      "rootId": "string", "label": "string",
      "skills": [ { "slug": "string", "version": "string" } ],
      "plugins": [ { "name": "string", "version": "string" } ]
    }
  ]
}
```

**Response**：`2xx`（无响应体亦可）。

---

## 4. 端点清单与现状对账（速查）

| # | 契约端点 | 现状 | 批次 |
|---|---|---|---|
| 1 | `GET /skills` | ✅ 一致 | — |
| 2 | `GET /skills/{slug}` | ✅ 一致 | — |
| 3 | `GET /skills/{slug}/versions` | ✅ 一致 | — |
| 4 | `GET /skills/{slug}/versions/{version}` | ✅ 一致 | — |
| 5 | `GET /skills/{slug}/resolve?hash=` | ❌ 仅顶层 `/resolve` | B |
| 6 | `GET /skills/{slug}/download-url?version=` | ❌ 流式 `/download` | C |
| 7 | `POST /skills/-/security-verdicts` | ✅ 一致（真机 200） | — |
| 8 | `GET /packages` | ✅ 一致 | — |
| 9 | `GET /packages/{name}` | ✅ 一致 | — |
| 10 | `GET /packages/{name}/releases/{version}` | ❌ 现为 `versions` | A |
| 11 | `GET /packages/{name}/download-url?version=` | ❌ 流式 `/download` | C |
| 12 | `GET /packages/{name}/releases/{version}/artifact-url` | ❌ 流式 `artifact` | C |
| 13 | `GET /packages/{name}/releases/{version}/security` | ❌ 现为 `versions/.../security` | A |
| 14 | `POST /telemetry/install` | ❌ 仅 legacy `/api/cli/telemetry/install` | B |

> 方向：fork 向本契约对齐（网关契约已固化在 ADR-0011 + 单测）。A=改段名、B=改路径形态、C=改响应契约（封装 MinIO 预签名端点）。
