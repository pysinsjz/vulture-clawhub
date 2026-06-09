# Vulture 自托管部署指南

把裁剪后的 ClawHub fork 作为 **vulture-gateway 的内网私有 Skill/Plugin 注册中心**部署。鉴权与身份已上移到外部网关（见 [TRIM-SPEC.md](./TRIM-SPEC.md) Phase 1），公开市场已停用（Phase 2），souls / 向量检索 / 外部扫描 worker 已移除（Phase 3–5）。本文给出自托管所需的组件、精简后的环境变量清单与部署步骤草案。

> 状态说明：本仓库离线无法 `convex codegen`，dormant 模块/表暂保留（见 [PHYSICAL-DELETE.md](./PHYSICAL-DELETE.md)）。下表 env 清单按**裁剪后内网部署实际所需**列，已删除项即使代码里仍有 dormant 引用，运行时也不可达、无需配置。

---

## 1. 自托管组件

| 组件 | 作用 | 必需 | 说明 |
|------|------|------|------|
| **convex-backend（自托管）** | 后端运行时：查询/变更/HTTP Action/cron | ✅ | `get-convex/convex-backend`。承载全部 `convex/` 函数与 v1 HTTP API。 |
| **Postgres** | convex-backend 的持久化存储 | ✅ | convex-backend 的 backing store（也可用其内置存储，生产建议 Postgres）。 |
| **S3 兼容对象存储（OSS）** | 制品文件存储（skill ZIP / package clawpack） | ✅ | 阿里云 OSS / Cloudflare R2 / MinIO 均可。配置见 [STORAGE-SPIKE.md](./STORAGE-SPIKE.md)，**应用层零改动**。 |
| **Node 运行时** | Plugin Inspector 兼容性扫描 | ✅ | `convex/packageInspectorNode.ts`（`"use node"`）在发布前内联跑 breakage 门禁。convex-backend 自带 Node action 运行时即可。 |
| **前端静态站（Vite 产物）** | 注册中心 Web UI（浏览/详情/管理） | 可选 | `bun run build` 产物，可托管在任意静态服务 / 网关后。纯内网也可只用 v1 HTTP API + CLI，不部署前端。 |
| **convex Dashboard** | 运维查看数据/日志 | 可选 | 自托管 backend 可选配套 dashboard 容器。 |

**裁剪掉、不再需要的外部依赖**：GitHub OAuth/App、OpenAI（embeddings/llmEval/changelog/skill-card）、Resend 邮件、VirusTotal、外部 Codex 扫描 worker 进程。内网无这些进程与凭证时相关代码路径天然不可达。

---

## 2. 精简后的环境变量清单

### 2.1 后端运行时（convex-backend）

```sh
# --- convex 自托管核心 ---
CONVEX_DEPLOYMENT=...                 # 自托管 deployment 标识
CONVEX_URL=https://convex.vulture.local        # backend cloud origin（函数/HTTP）
CONVEX_SITE_URL=https://convex.vulture.local   # HTTP Action 站点 origin（v1 API 暴露处）

# --- 制品存储：S3 兼容 OSS（详见 STORAGE-SPIKE.md）---
AWS_REGION=oss-cn-hangzhou
AWS_ACCESS_KEY_ID=<access-key-id>
AWS_SECRET_ACCESS_KEY=<secret-access-key>
S3_ENDPOINT_URL=https://oss-cn-hangzhou.aliyuncs.com   # 非 AWS 必填
AWS_S3_FORCE_PATH_STYLE=true                           # MinIO / 部分 OSS 需要
S3_STORAGE_FILES_BUCKET=vulture-user-files             # ← 制品落点（ctx.storage）
S3_STORAGE_EXPORTS_BUCKET=vulture-snapshot-exports
S3_STORAGE_SNAPSHOT_IMPORTS_BUCKET=vulture-snapshot-imports
S3_STORAGE_MODULES_BUCKET=vulture-modules
S3_STORAGE_SEARCH_BUCKET=vulture-search-indexes
```

可选（运维/可观测，按需开启，缺省即关闭）：

```sh
APP_BUILD_SHA=...                    # 构建标记（健康检查/版本端点展示）
APP_DEPLOYED_AT=...                  # 部署时间戳
TRUST_FORWARDED_IPS=true             # 网关在前置反代时，信任 X-Forwarded-For
DISCORD_WEBHOOK_URL=...              # 可选告警通道（不配则静默）
```

### 2.2 前端构建（Vite，仅在部署 Web UI 时）

```sh
VITE_CONVEX_URL=https://convex.vulture.local       # 指向自托管 backend
VITE_CONVEX_SITE_URL=https://convex.vulture.local  # HTTP Action 站点
VITE_SITE_URL=https://registry.vulture.local       # 站点自身 URL（OG/绝对链接）
```

> 内网部署天然为 **skills 模式**（不设 `VITE_SITE_MODE=souls`、不用 onlycrabs host），SoulHub 配置失活、无需任何 soul 相关变量。

### 2.3 CLI 客户端（`packages/clawhub`，Phase 7b 品牌化）

```sh
VULTURE_REGISTRY=https://registry.vulture.local    # 默认 registry（占位见 cli/registry.ts）
VULTURE_SITE=https://registry.vulture.local        # 站点 URL（缺省回退 registry）
VULTURE_DISABLE_TELEMETRY=1                         # 关闭安装遥测上报
```

旧 `CLAWHUB_*`（`CLAWHUB_REGISTRY` / `CLAWHUB_SITE` / `CLAWHUB_DISABLE_TELEMETRY`）保留为 **legacy 回退**，新部署用 `VULTURE_*`。客户端本地目录已从 `.clawhub` → `.vulture`（双 legacy 回退）。

### 2.4 已删除、**无需再配置**的变量

下列变量服务于已裁剪的功能，内网部署一律不设：

| 变量 | 所属（已裁剪） |
|------|----------------|
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth 登录（Phase 1 去身份认证） |
| `GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_TOKEN` | GitHub App/Token、账龄门控、仓库备份 |
| `OPENAI_API_KEY` 及全部 `OPENAI_*` / `OPENAI_EVAL_*` | embeddings（Phase 4 向量检索）、llmEval、changelog、skill-card 生成 |
| `BRIA_API_KEY` | 图像生成（外部 AI） |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `CLAWHUB_EMAIL_*` / `CLAWHUB_SECURITY_EMAIL*` | Resend 邮件（Phase 5） |
| `VT_API_KEY` / `SECURITY_SCAN_DEFAULT_VT_WAIT_MS` | VirusTotal（Phase 5） |
| `SECURITY_SCAN_WORKER_TOKEN` / 全部 `CODEX_SECURITY_SCAN_*` | 外部 Codex 扫描 worker 协议（Phase 5） |
| `CLAWHUB_PLUGIN_INSPECTOR_WORKER_TOKEN` | Plugin Inspector **外部 worker** 协议（Phase 5，发布内联不受影响） |
| 全部 `SKILL_CARD_*` | skill-card 生成 worker（Phase 5） |
| `HF_TOKEN` / `HUGGING_FACE_HUB_TOKEN` / `HUGGINGFACE_TOKEN` / `CLAWHUB_SECURITY_EVAL_HF_DATASET` | 安全评测数据集（评测/扫描相关） |
| `CLAWHUB_BAN_APPEALS_TOKEN` | 公开市场封禁申诉（Phase 2） |
| `GITHUB_SOULS_REPO` / `GITHUB_SOULS_ROOT` | souls 备份（Phase 3） |

> 留存的 `CLAW_HUB_*` 开发态变量（`CLAW_HUB_ENABLE_DEV_IMPERSONATION` 等）仅用于本地开发/测试，生产内网不设。

---

## 3. 部署步骤草案

### 3.1 docker-compose 骨架

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: convex
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: convex_self_hosted
    volumes:
      - pgdata:/var/lib/postgresql/data

  convex-backend:
    image: ghcr.io/get-convex/convex-backend:latest
    depends_on: [postgres]
    environment:
      # backing store
      DATABASE_URL: postgres://convex:${PG_PASSWORD}@postgres:5432/convex_self_hosted
      # S3 兼容 OSS 制品存储（见 STORAGE-SPIKE.md）
      AWS_REGION: ${AWS_REGION}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
      S3_ENDPOINT_URL: ${S3_ENDPOINT_URL}
      AWS_S3_FORCE_PATH_STYLE: "true"
      S3_STORAGE_FILES_BUCKET: ${S3_STORAGE_FILES_BUCKET}
      S3_STORAGE_EXPORTS_BUCKET: ${S3_STORAGE_EXPORTS_BUCKET}
      S3_STORAGE_SNAPSHOT_IMPORTS_BUCKET: ${S3_STORAGE_SNAPSHOT_IMPORTS_BUCKET}
      S3_STORAGE_MODULES_BUCKET: ${S3_STORAGE_MODULES_BUCKET}
      S3_STORAGE_SEARCH_BUCKET: ${S3_STORAGE_SEARCH_BUCKET}
    ports:
      - "3210:3210"   # convex API / HTTP Action 站点

  # 可选：dashboard
  convex-dashboard:
    image: ghcr.io/get-convex/convex-dashboard:latest
    depends_on: [convex-backend]
    ports:
      - "6791:6791"

volumes:
  pgdata:
```

> OSS bucket 需预先创建并对该 access key 授读写权限。本地/默认不设 `S3_*` 时 backend 用内置本地文件存储；本地 ↔ S3 切换需 `npx convex export` 后 `npx convex import --replace-all` 迁移既有文件。

### 3.2 部署流程

1. **起依赖**：`docker compose up -d postgres convex-backend`（按需加 dashboard）。
2. **推函数**：配置好 `CONVEX_DEPLOYMENT` 指向自托管 backend，运行
   ```sh
   bunx convex deploy        # 切勿加 --typecheck=disable（见 CLAUDE.md）
   ```
   将 `convex/` 全量函数 + schema 部署到 backend。
3. **（可选）建前端**：
   ```sh
   VITE_CONVEX_URL=$CONVEX_URL VITE_CONVEX_SITE_URL=$CONVEX_SITE_URL bun run build
   ```
   把 `dist/` 托管在网关后的静态服务。
4. **配 CLI**：客户端机器 `export VULTURE_REGISTRY=https://registry.vulture.local`，即可 `clawhub` CLI 走内网注册中心发布/解析/安装。
5. **网关前置**：vulture-gateway 在 v1 HTTP API 前做鉴权/身份注入；注册中心信任内网调用（Phase 1 `apiTokenAuth` 内网回退 system 身份）。

### 3.3 物理删除（将来）

拿到可用的 Convex 部署后，按 [PHYSICAL-DELETE.md](./PHYSICAL-DELETE.md) 一次性删除 dormant 模块/表并重跑 `bunx convex codegen`，可进一步缩小镜像与 schema。停用状态下系统已完整可用，物理删除为可选清理。
