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

### 2.3 默认 system 登录（可选，Web UI 无登录流程）

网关已上移鉴权，且 Phase 1 摘除了 OAuth 登录路由，内网部署的 Web UI 没有可用的登录入口。开启下列**两个**开关后，前端 reactive 查询会像 v1 HTTP API 那样回退到固定的 `system`（admin）用户，打开即登录、无需也无法手动登录：

```sh
VULTURE_DEFAULT_SYSTEM_USER=1   # Convex backend env（npx convex env set …）
VITE_DEFAULT_SYSTEM_USER=1      # 前端构建期注入
```

> ⚠️ 这等于 **Web UI 全功能 admin 无认证可达**（含管理后台的封禁/硬删/改角色），与 v1 HTTP API 的内网信任级别一致——仅在隔离内网暴露。两个开关须同开：只开后端则前端不发起 `users.me` 查询；只开前端则后端不回退身份。`system` 用户由前端挂载时的 `users.ensureSystemUser` 自动 bootstrap（幂等，flag 关闭时为 no-op）。

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

## 3. 部署落地

**实战部署包**已经在 [`/deploy/`](../../deploy/) 目录里就位（落地于阿里云 ECS `8.136.147.138`），含 docker-compose.yml + `.env.example` + 操作手册。本节只列设计层关键决策；具体首次部署 / 升级 / 排错 / 13 条已踩坑约束见 [`deploy/README.md`](../../deploy/README.md)。

### 3.1 关键决策（区别于上面草案）

| 决策 | 原因 |
|------|------|
| **storage 用同机 MinIO 而非 OSS/R2** | R2 国内 ECS 跨境约 90KB/s 不实用；OSS multipart crc32 校验 convex 不通过；同机 MinIO 零延迟。MinIO 需启 KES（`MINIO_KMS_SECRET_KEY`）因为 convex 写 S3 强制带 SSE-KMS header。 |
| **backend → MinIO 走 docker DNS `http://minio:9000`** | 阿里云 NAT 不支持 hairpin，host 自己 curl 自己公网 IP 都 timeout。所有同机互访都走 docker network。MinIO 9000 不暴露公网（外部 client 拿到的下载 URL 是 backend `:3211` proxy 而非 S3 直连）。 |
| **convex backend 不用 Postgres**（去掉草案里的 `postgres` 服务） | self-host convex-backend 自带嵌入式存储就够内网注册中心规模；省一个容器 + 一份运维成本。需要时未来再切外置 PG。 |
| **前端用 Nitro SSR 容器而非 nginx 静态托管** | 项目是 TanStack Start，构建产物在 `.output/`（带 server bundle），需要 Node runtime 跑。 |
| **镜像走南大镜像 `ghcr.nju.edu.cn`** | 国内 ECS 直连 `ghcr.io` TLS 握手必失败；daocloud 对小众镜像不缓存。 |
| **`VULTURE_*` 运行时 env 双写** | docker env（给 Rust backend 守卫）+ `bunx convex env set`（给 JS isolate 运行时）两层都要写，缺一不生效。 |

### 3.2 部署速记（详见 deploy/README.md §2）

```sh
# 本地构建（env 不能漏，详见 deploy/README.md §4 第 ⑧/⑪/⑬ 条）
NITRO_V1_PROXY_TARGET=http://backend:3211 \
VITE_CONVEX_URL=http://8.136.147.138:3210 \
VITE_CONVEX_SITE_URL=http://8.136.147.138:3211 \
SITE_URL=http://8.136.147.138 VITE_DEFAULT_SYSTEM_USER=1 \
bun run build && tar czf deploy/output.tar.gz -C . .output

# 推到服务器
scp deploy/docker-compose.yml deploy/.env deploy/output.tar.gz root@<ip>:/opt/vulture-clawhub/
ssh root@<ip> 'cd /opt/vulture-clawhub && tar xzf output.tar.gz -C output --strip 1 && docker compose up -d'

# 推 convex 函数（必经 SSH 隧道，外网偶发 TLS reset）
ssh -fN -L 13210:127.0.0.1:3210 root@<ip>
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:13210 \
CONVEX_SELF_HOSTED_ADMIN_KEY=$(...generate_admin_key.sh) \
bunx convex deploy --yes
```

完整 5 步流程、安全组配置、首次 build env、`VULTURE_SKIP_PLUGIN_PUBLISH_VALIDATION` 等运行时 env 设置：见 [`deploy/README.md`](../../deploy/README.md)。

### 3.3 物理删除（将来）

拿到可用的 Convex 部署后，按 [PHYSICAL-DELETE.md](./PHYSICAL-DELETE.md) 一次性删除 dormant 模块/表并重跑 `bunx convex codegen`，可进一步缩小镜像与 schema。停用状态下系统已完整可用，物理删除为可选清理。
