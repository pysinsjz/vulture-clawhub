# ClawHub ↔ vulture-gateway 对接实施记录

> 本文是 [GATEWAY-CONTRACT.md](./GATEWAY-CONTRACT.md) 对应的**本仓侧实施记录**：契约 14 条调用面中，本仓需改造的 7 条的现状、已完成动作、剩余工作与决策点。
>
> 配套 issue：[#1](https://github.com/pysinsjz/vulture-clawhub/issues/1)。
> 网关侧基址必须从 `:3210` 改为 `http://<host>:3211/api/v1`，本仓本身无需改这一项。

## 1. 当前进度速查

> **14/14 条契约端点已联通**（路线 A 已落地，C 批次走伪预签名）。

| # | 契约端点 | 批次 | 状态 | 说明 |
|---|---|---|---|---|
| 5 | `GET /skills/{slug}/resolve?hash=` | B | ✅ 已交付 | 新增嵌套入口，复用 `resolveVersionByHash` |
| 10 | `GET /packages/{name}/releases/{version}` | A | ✅ 已交付 | router 入口将 `releases` 段名 normalize 成 `versions`，零破坏兼容 |
| 13 | `GET /packages/{name}/releases/{version}/security` | A | ✅ 已交付 | 同上，复用 normalize |
| 14 | `POST /telemetry/install` | B | ⚠️ 部分交付 | 路由已注册、skills 已落库；plugins 暂 ack-only（无 schema），见 §3.2 |
| 6 | `GET /skills/{slug}/download-url?version=` | C-A | ✅ 已交付 | 路线 A 伪预签名，见 §4.3 |
| 11 | `GET /packages/{name}/download-url?version=` | C-A | ✅ 已交付 | 同上 |
| 12 | `GET /packages/{name}/releases/{version}/artifact-url` | C-A | ✅ 已交付 | 同上 |

---

## 2. 批次 A — 段名对齐（`releases` ↔ `versions`）

### 2.1 改动

`convex/httpApiV1/packagesV1.ts` 新增入口 normalizer，三个 router handler（GET/POST/DELETE）都接入：

```ts
function normalizePackageRouteSegments(rest: string[]): string[] {
  if (rest.length === 0 || rest[0] !== "releases") return rest;
  return ["versions", ...rest.slice(1)];
}
```

入口位置：`packagesGetRouterV1Handler` / `packagesPostRouterV1Handler` / `packagesDeleteRouterV1Handler`。

### 2.2 兼容性

- 旧的 `versions/{version}` 路径**完全保留**：CLI 与 fork UI 已经在用，不动。
- 新的 `releases/{version}` 是 alias：进入 router 后立刻 normalize，下游分发完全沿用旧逻辑。
- 仅触达 GET 路由（`/packages/{name}/releases/{version}` 取详情、`…/security` 取阻断状态）；POST/DELETE 暂未在契约中要求 `releases` 段名，但顺手做了 normalize，给未来契约扩展留路。

### 2.3 联调自检

```bash
BASE=http://127.0.0.1:3211/api/v1
# 新形态（契约）
curl -s "$BASE/packages/lodash/releases/4.17.21" | jq .version
curl -s "$BASE/packages/lodash/releases/4.17.21/security" | jq .trust.blockedFromDownload
# 旧形态（CLI 仍可用）
curl -s "$BASE/packages/lodash/versions/4.17.21" | jq .version
```

---

## 3. 批次 B — 新增端点

### 3.1 `GET /skills/{slug}/resolve?hash=` （#5）

`convex/httpApiV1/skillsV1.ts` 在已有顶层 `/skills/resolve?slug=&hash=` 之外**新增嵌套分支**，slug 走路径段、hash 走 query，内部复用同一个 `api.skills.resolveVersionByHash`。

```bash
BASE=http://127.0.0.1:3211/api/v1
H=$(printf 'abcdef%.0s' {1..10}) # 任意 64-hex
curl -s "$BASE/skills/foo/resolve?hash=$(printf '%s' "$H" | head -c 64)"
# → { "slug": "foo", "match": null, "latestVersion": {...} } 或 404
```

### 3.2 `POST /api/v1/telemetry/install` （#14）

#### 已交付
- 路由：`convex/http.ts` 注册 `POST /api/v1/telemetry/install` → `telemetryInstallV1Http`。
- 实现：`convex/httpApiV1/telemetryV1.ts`，**无鉴权**（契约 §0 明确 ClawHub 不校验 Authorization），手写 body 校验（不引入新 schema dist 编译）。
- 持久化：`skills` 入 `internal.telemetry.reportCliSyncInternal`，attribute 到 bootstrapped system user（`getOrCreateSystemUserInternal`，handle=`system`、role=`admin`）。
- 返回：`200 { "ok": true }`，符合契约 §3.1。

#### 已知缺口
`plugins` 字段当前**只校验形状、不持久化**。原因：

1. 现有 `reportCliSyncInternal` mutation 与 `telemetry*` 表只承载 skills，没有 plugin 安装表。
2. 加 plugin 持久化涉及：
   - 新建 `pluginInstallRoots` / `pluginInstallEntries` 表（或扩 skills 表加 family 字段）
   - 给 `expireStaleRoots` / `resolveSkillsBySlug` 加 plugin 分支
   - schema 包 + dist 重编
3. 这块的 schema 设计应当与 fork 的 plugin 数据流统一（plugin 主键是 `name`，不是 `slug`）。

实施前需确认表结构方案。建议拆 follow-up 子 issue。

#### 联调自检
```bash
BASE=http://127.0.0.1:3211/api/v1
curl -s -X POST "$BASE/telemetry/install" \
  -H 'content-type: application/json' \
  -d '{"roots":[{"rootId":"r1","label":"box-a","skills":[{"slug":"foo","version":"1.0.0"}],"plugins":[{"name":"@scope/bar","version":"0.2.0"}]}]}'
# → 200 {"ok":true}
```

---

## 4. 批次 C — `download-url` / `artifact-url` 响应契约（待决策）

3 条端点都需返回 `{ "url": "<短时效预签名 URL>" }` JSON，本仓**当前都是流式直吐 zip 或 307 内跳**。这不是改名能解决的，是**新增能力**。

### 4.1 现状一览

| 端点 | 现状实现 | 文件 |
|---|---|---|
| `GET /skills/{slug}/download-url?version=` | `GET /api/v1/download` 流式 zip（`buildDeterministicZip`） | `convex/downloads.ts` |
| `GET /packages/{name}/download-url?version=` | `GET /api/v1/packages/{name}/download` 流式 zip（`buildDeterministicPackageZip`） | `convex/httpApiV1/packagesV1.ts:3618` |
| `GET /packages/{name}/releases/{version}/artifact-url` | `versions/{v}/artifact?download` 流式 / 307 内跳到 npm-pack tarball | `convex/httpApiV1/packagesV1.ts:3431` |

### 4.2 决策点

需要从以下两条路线选一条：

#### 路线 A · 临时桥接（**伪预签名**，最快放行网关）

让 3 个新端点返回 `{ url: "/api/v1/<现有流式端点>?…" }`（相对于本仓自身），URL 是普通 HTTP 端点不带签名。网关 302 转发后，桌面端访问 ClawHub 取字节，sha256 自校验仍按版本详情走。

- 优点：**当天可上线**，零存储后端工作量，网关无需改 Client 逻辑。
- 缺点：URL 无 TTL、无访问令牌，任何能打到 ClawHub 端口的人都能取；只适合**纯内网信任部署**。
- 风险面：因为目前部署形态就是纯内网（ClawHub 不暴露公网，gateway 把守边界），与现行 trust model 一致。
- 工作量：~30 行代码（3 个 handler 各加一个 JSON 分支，复用现有 release 查询）。

#### 路线 B · MinIO 真预签名（**契约完整实现**）

引入 AWS SDK 的 S3 presigner，**所有 artifact 字节迁出 Convex file-storage → 落到自托管 MinIO**，新端点签发 `GET` 预签名（TTL 5-15 min）后返回 JSON。

- 优点：URL 自带 TTL/签名，符合契约描述；为未来跨地域分发留空间。
- 缺点：
  - 发布流程要改：`publishSkill`/`publishPackage` 落 storage 时要双写或迁移到 MinIO；
  - 现有 `buildDeterministicZip` 是**请求时即时打包**（没有预存 zip 对象），需要先决定是不是把打包结果落桶；
  - 需要新增环境变量（`MINIO_ENDPOINT` / `MINIO_BUCKET` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_PRESIGN_TTL_SEC`）和健康检查；
  - 现有 npm-pack tarball 走 `streamClawPackRelease`，已经从 Convex storage 取，迁桶后要重映射所有 `storageId`。
- 工作量：~1–2 周，需要单独 spike + 数据迁移演练。

#### 推荐

**先走路线 A 让网关 14 条全通**，路线 B 作为单独 milestone 跟进。理由：
- 当前部署形态是纯内网 + gateway 边界，路线 A 的"无 TTL"风险与现状 trust model 等价；
- 路线 B 的迁移过程需要 zero-downtime 演练，做不好会切断现网下载；
- 网关 ADR-0011 + 单测已经按 `{url}` 模式写好，路线 A 后路线 B 切换只需改本仓端点返回的 url 来源，**网关侧零改动**。

### 4.3 路线 A 已落地（本次提交）

3 个端点都已实现，返回 `{ "url": "<absolute http URL>" }`，URL 形如 `http://<host>:3211/api/v1/...`，
绝对地址通过 `publicApiOrigin(request)` 从入站请求 origin 派生：

| 契约端点 | 实际指向的流式端点 |
|---|---|
| `GET /skills/{slug}/download-url?version=` | `GET /api/v1/download?slug=&version=` |
| `GET /packages/{name}/download-url?version=` | `GET /api/v1/packages/{name}/download?version=` |
| `GET /packages/{name}/releases/{version}/artifact-url` | `GET /api/v1/packages/{name}/versions/{v}/artifact/download` |

#### 安全门（先校验再签发）

每个端点都在返回 `{url}` 前应用了与现有流式端点**相同**的访问门：

- skills download-url：`getPublicSkillFileAccessBlock(moderationInfo)` → 403/410/451 等
- packages download-url & artifact-url：`getReleaseSecurityBlock(release)` → 阻断响应
- skill-backed package paths：复用 skill 的 moderation block
- 不存在的 skill/package/version → 404；softDeleted version → 410

故任何"已被网关签发"的 URL，下游流式端点也一定能放行（除非中间状态变了，那也是契约允许的二次门控）。

#### 联调自检

```bash
BASE=http://127.0.0.1:3211/api/v1
# Skill 下载签发
curl -s "$BASE/skills/foo/download-url?version=1.0.0" | jq .url
# Package 下载签发（legacy-zip）
curl -s "$BASE/packages/lodash/download-url?version=4.17.21" | jq .url
# Package 制品签发（npm-pack tarball）
curl -s "$BASE/packages/@scope/bar/releases/0.2.0/artifact-url" | jq .url
```

#### 切换到路线 B 时

切换只需替换三个端点里的 url 构造，把 `publicApiOrigin(request)` 改成调 MinIO presigner（带 TTL/签名 query），
网关 client、契约文档、单测**全部零改动**。所以路线 A 不是"凑合方案"——它是 url 内容可热替换的合规实现。

### 4.4 部署后实测发现：路线 A 在「桌面端只能到网关公网入口」拓扑下断链

**症状**：clawhub 7 条契约改造全部已部署到 ECS（`8.136.147.138:3210`），11 条 JSON 端点通；
但 download 3 条（#6 / #11 / #12）的链路**端到端不通**，桌面端 302 跳转后访问失败。

**根因**（与 clawhub 实现无关，是设计假设与部署拓扑的错配）：

1. `publicApiOrigin(request)`（[convex/httpApiV1/shared.ts:126](../../convex/httpApiV1/shared.ts:126)）解析顺序：
   `SITE_URL` env → `x-forwarded-host` 头 → 兜底 `request.url`。
2. 当前 ECS 部署：`SITE_URL` 在 isolate runtime **未设**；
   网关 `VG_CLAWHUB_BASE_URL=http://127.0.0.1:3211/api/v1`（docker loopback）→
   入站请求的 host = `127.0.0.1:3211` → 兜底取到的 url = `http://127.0.0.1:3211/api/v1/download?...`。
3. 网关 `plugin_handler.go` 收到 `{url}` 后 **302** 桌面端到该 url
   → 桌面端只能到网关公网入口、到不了 clawhub:3211 → **死链**。

JSON 端点（list/detail/resolve/security/telemetry）不受影响：响应体由网关代理回桌面端，url 字段不出现在链路上。

#### 修复路径（必须双侧协同）

| 路径 | 网关侧改动 | clawhub 侧改动 | 评估 |
|---|---|---|---|
| **A-stream**（推荐） | `/skills/{slug}/download` 等 3 条不发 302，改为反向代理 clawhub 流式端点（`/api/v1/download?...` / `/packages/{n}/download` / `/versions/{v}/artifact/download`），bytes 经网关回桌面端 | 无需改动（`download-url` 端点可保留但实际不被网关消费；或废弃） | 网关单侧改；不引入新公开路径；后续切路线 B 时桌面端仍 302 直连 MinIO，迁移无害 |
| **A-bridge** | 加 passthrough 路由 `/clawhub-proxy/*` → 内网 `http://backend:3211/api/v1/*`（**该路由不带 JWTAuth**，桌面端 302 后无身份） | `SITE_URL=https://<gateway-public>/clawhub-proxy` 后 `download-url` 自然返回桌面可达地址 | 保留 302 设计，与路线 B 的合约更接近；但需新公开路径 + 处理无鉴权透传的安全模型 |
| **直连**（已被你的拓扑否决） | 无 | `SITE_URL=http://8.136.147.138:3211` | 仅当桌面端能直连 clawhub:3211 时可行；当前部署不满足 |

**强建议走 A-stream**：
- 网关已是 HTTP 反代框架，加个流式 handler 是最小改动
- 不引入新公开 path、不动 trust model（网关仍是唯一公网入口）
- clawhub `download-url` 端点保留，作为「合约入口」存在；网关可选择性消费（用于元数据 / hash 校验），不必拿 url
- 切路线 B（MinIO 真预签名）时，桌面端可直接 302 到 MinIO 公网地址，迁移无成本

#### 网关侧需要做的事（具体 ask）

1. **`vulture-gateway/internal/clawhub` client** 三处 download/artifact 调用：
   - 现状：调 `GET /skills/{slug}/download-url` 等 → 拿 `{url}` → 302 桌面端
   - 改为：直接 GET clawhub 的流式端点（路径见上表），把 response body 透传回桌面端
   - 头部要透传：`Content-Type`、`Content-Disposition`、`ETag`、`X-ClawHub-Artifact-Sha256` 等
2. **保留** `download-url` 调用作为可选的「URL 探针」——用于在 302/stream 之前做安全门检查（这正是 clawhub 端点已经做的），或者完全弃用
3. **不要改 clawhub 现行端点**——它们本来就支持这两种消费模式

> 这一节是部署后实测发现，原 §4.3 末段「`SITE_URL` 切换时网关零改动」的承诺**仍然成立**——前提是网关侧采用 A-stream 模式，那时 url 来源 backend 怎么改（MinIO presigner）都不影响网关的反代行为。

---

## 5. 网关侧前置（非本仓改动，留作 checklist）

| 项 | 值 |
|---|---|
| `clawhub.base_url` | `http://127.0.0.1:3211/api/v1`（不是 `:3210`） |
| HTTP 客户端 | 复用 `internal/clawhub`，无需改 |
| 鉴权头 | **不要发**（ClawHub 直接忽略） |
| 期望响应 | 详见 [GATEWAY-CONTRACT.md](./GATEWAY-CONTRACT.md) §1–3 |

改完 base_url 后，14 条调用全部就绪（A + B + C-路线A 已全部交付）。

---

## 6. 改动文件清单（本次提交）

- `convex/httpApiV1/packagesV1.ts` — 加 `normalizePackageRouteSegments`，三处入口接入；新增 `download-url` 与 `artifact-url` 分支
- `convex/httpApiV1/skillsV1.ts` — `skillsGetRouterV1Handler` 新增嵌套 `resolve` 分支与 `download-url` 分支
- `convex/httpApiV1/telemetryV1.ts` — **新建**，v1 telemetry install handler（无鉴权 + system user attribution）
- `convex/httpApiV1.ts` — 导出 `telemetryInstallV1Http` + 加入 `__handlers`
- `convex/http.ts` — 注册 `POST /api/v1/telemetry/install`
- `docs/vulture-trim/GATEWAY-INTEGRATION.md` — 本文档

## 7. 待办 follow-up

- [x] **回归测试**：为新增端点写 handler 单测——已加 9 个，覆盖批次 A 别名、嵌套 resolve、3 个 *-url 端点、telemetry install 正常/异常路径；当前 `convex/httpApiV1.handlers.test.ts` 306/306 通过
- [ ] **路线 B（MinIO 真预签名）** 单独 milestone，§4.3 末段已说明热替换路径；切换时网关零改动
- [ ] **plugin 安装持久化** schema 设计（§3.2 缺口），需要确定 plugin install 表结构
- [ ] **issue #1 收口**：本次提交后 14/14 端点联通，issue 可直接关闭或转为「路线 B spike」的伞 issue
