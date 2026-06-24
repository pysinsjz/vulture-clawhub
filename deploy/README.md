# Vulture Self-Host Deploy — 实战 Playbook

把裁剪后的 ClawHub fork（vulture-clawhub）以 docker compose 形态部署到**国内阿里云 ECS**（已落地在 `8.136.147.138`，Ubuntu 24.04 / Docker 29）。本目录是落地后的最小可复用部署包；下文是「踩过的坑 + 现行配置」。设计文档见 [../docs/vulture-trim/SELF-HOST.md](../docs/vulture-trim/SELF-HOST.md)。

---

## 1. 架构（4 容器）

```
   80         3210/3211   6791
    │              │         │
    ▼              ▼         ▼
┌───────┐    ┌─────────┐  ┌─────────┐
│  web  │ →  │ backend │  │dashboard│
│ Nitro │    │ convex  │  │ convex  │
│  SSR  │    └────┬────┘  └─────────┘
└───────┘         │
                  ▼ docker network only
              ┌───────┐    ┌──────────┐
              │ minio │ ←  │minio-init│ (一次性建 5 buckets)
              └───────┘    └──────────┘
                 9000 (内网)  9001 (127.0.0.1 only)
```

| 容器 | 镜像 | 对外端口 | 说明 |
|------|------|---------|------|
| `vulture-web` | `node:22-alpine` 跑 `.output/server/index.mjs` | **80** | Nitro SSR，托管前端 + 反代 `/api/v1/**` 到 backend 3211 |
| `vulture-convex-backend` | `ghcr.nju.edu.cn/get-convex/convex-backend:latest` | **3210, 3211** | Convex 函数运行时 + HTTP API |
| `vulture-convex-dashboard` | `ghcr.nju.edu.cn/get-convex/convex-dashboard:latest` | **6791**（可选） | 运维数据/日志面板 |
| `vulture-minio` | `minio/minio:latest` + 内置 KES | 仅 `127.0.0.1:9001` | S3 兼容制品存储，9000 仅 docker 内网 |

**阿里云安全组必开**：80、3210、3211、6791（按需）。9000 **不要**开（aliyun NAT 不支持 hairpin，backend 走 docker 内网 `http://minio:9000`，外部 client 拿到的 storage 下载 URL 是 `:3211` proxy 而不是 S3 直连）。

---

## 2. 首次部署（5 步）

前提：服务器已装 Docker 29+ / Compose v5+；本机已能 `ssh root@8.136.147.138`。

### 2.1 准备凭证

```sh
openssl rand -hex 24       # MinIO root 密码
openssl rand -base64 32    # MinIO KES master key
```

把这两个值写到本地 `deploy/.env`（复制 `deploy/.env.example` 改）。**不要 commit**——`.env*` 已在 .gitignore。

### 2.2 本地构建前端

```sh
NITRO_V1_PROXY_TARGET=http://backend:3211 \
VITE_CONVEX_URL=http://8.136.147.138:3210 \
VITE_CONVEX_SITE_URL=http://8.136.147.138:3211 \
SITE_URL=http://8.136.147.138 \
VITE_DEFAULT_SYSTEM_USER=1 \
bun run build

tar czf deploy/output.tar.gz -C . .output
```

> **每个 env 都必须**：详见 §4 坑列表 第 3/4/13 条。

### 2.3 推送到服务器

```sh
ssh root@8.136.147.138 'mkdir -p /opt/vulture-clawhub'
scp deploy/docker-compose.yml deploy/.env deploy/output.tar.gz \
    root@8.136.147.138:/opt/vulture-clawhub/

ssh root@8.136.147.138 'cd /opt/vulture-clawhub && \
  rm -rf output && mkdir output && \
  tar xzf output.tar.gz --strip-components=1 -C output'
```

### 2.4 启动栈

```sh
ssh root@8.136.147.138 'cd /opt/vulture-clawhub && docker compose up -d'
```

镜像走南大 ghcr 镜像（`ghcr.nju.edu.cn`），国内 ECS 直连 `ghcr.io` 失败。

### 2.5 推 convex 函数 + 设运行时 env

```sh
# 用 SSH 隧道绕开安全组，先拿 admin key 再 push 函数
ssh -fN -L 13210:127.0.0.1:3210 root@8.136.147.138

ADMIN_KEY=$(ssh root@8.136.147.138 \
  'docker exec vulture-convex-backend ./generate_admin_key.sh | tail -1')

CONVEX_SELF_HOSTED_URL=http://127.0.0.1:13210 \
CONVEX_SELF_HOSTED_ADMIN_KEY="$ADMIN_KEY" \
bunx convex deploy --yes

# 必须双写的 isolate runtime env
for k in VULTURE_DEFAULT_SYSTEM_USER VULTURE_SKIP_PLUGIN_PUBLISH_VALIDATION; do
  CONVEX_SELF_HOSTED_URL=http://127.0.0.1:13210 \
  CONVEX_SELF_HOSTED_ADMIN_KEY="$ADMIN_KEY" \
  bunx convex env set "$k" 1
done

pkill -f "ssh -fN -L 13210"
```

完成后浏览器打开 [http://8.136.147.138/](http://8.136.147.138/)，应该是 `system` admin 已登入态。

---

## 3. 升级（只改前端 / 只改 convex）

### 3.1 前端代码改了

```sh
NITRO_V1_PROXY_TARGET=http://backend:3211 \
VITE_CONVEX_URL=http://8.136.147.138:3210 \
VITE_CONVEX_SITE_URL=http://8.136.147.138:3211 \
SITE_URL=http://8.136.147.138 \
VITE_DEFAULT_SYSTEM_USER=1 \
bun run build

# vite/bun 缓存极强，确认 .output/public/assets/index-*.js 文件名 hash 真变了
# 没变就 rm -rf .output .nitro .tanstack node_modules/.vite 再来一遍

tar czf deploy/output.tar.gz -C . .output
scp deploy/output.tar.gz root@8.136.147.138:/opt/vulture-clawhub/
ssh root@8.136.147.138 'cd /opt/vulture-clawhub && \
  rm -rf output && mkdir output && \
  tar xzf output.tar.gz --strip-components=1 -C output && \
  docker compose restart web'
```

### 3.2 convex 函数 / schema 改了

**通过 SSH 隧道**（推荐：不暴露 3210 给公网时也能用）：

```sh
ssh -fN -L 13210:127.0.0.1:3210 root@8.136.147.138
ADMIN_KEY=$(ssh root@8.136.147.138 \
  'docker exec vulture-convex-backend bash -c "cd /convex && ./generate_admin_key.sh" | tail -1')
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:13210 \
CONVEX_SELF_HOSTED_ADMIN_KEY="$ADMIN_KEY" \
bunx convex deploy --yes
pkill -f "ssh -fN -L 13210"
```

**直连**（若 ECS 3210 已对你本机可达，比如已在内网/VPN 内）：

```sh
ADMIN_KEY=$(ssh root@8.136.147.138 \
  'docker exec vulture-convex-backend bash -c "cd /convex && ./generate_admin_key.sh" | tail -1')
CONVEX_SELF_HOSTED_URL=http://8.136.147.138:3210 \
CONVEX_SELF_HOSTED_ADMIN_KEY="$ADMIN_KEY" \
bunx convex deploy
```

> admin key 每次现取，避免落地到本地磁盘。如果本机有多套环境（本地 backend + ECS），不要混用 `.env.local` 里那把 key——本机和 ECS 的 `INSTANCE_SECRET` 不一样，本机 key 给 ECS 会 401 `BadAdminKey`。

#### 部署后烟测（区分『路由命中无数据』vs『路由未注册』）

新增/改造 v1 端点时，404 文本是判别 deploy 是否生效的关键信号——出自 issue [#1](https://github.com/pysinsjz/vulture-clawhub/issues/1) 的判别口径：

| 404 文本 | 含义 | 说明 |
|---|---|---|
| `Skill not found` / `Package not found` / `Package security not found` ... | **路由已注册**，handler 执行了 lookup 但数据库无匹配 | 新端点已生效 ✅ |
| `No matching routes found` | httpRouter 没找到该路由 | 新端点**没有**部署上来 ❌ |

```sh
# 选一条本次新加的端点，挑一个肯定无数据的 slug/name
curl -sS http://8.136.147.138:3211/api/v1/skills/__nonexistent__/download-url
#   ↑ 期望 "Skill not found"（不是 "No matching routes found"）
```

### 3.3 镜像 / 存储 schema 大改

要清 volume 重来时：

```sh
ssh root@8.136.147.138 'cd /opt/vulture-clawhub && \
  docker compose down && \
  docker volume rm vulture-clawhub_data vulture-clawhub_minio_data'
# 然后回到首次部署 §2.4 / §2.5
```

---

## 4. 实战中踩过的 13 条非显然约束

按踩坑顺序，新部署照本宣科避开。

### 4.1 基建层

**① 国内 ECS 拉 `ghcr.io` 几乎必失败**
用南大镜像 `ghcr.nju.edu.cn/<owner>/<image>`（daocloud 对小众镜像 403 不缓存）。compose 已写死。

**② Aliyun NAT 不支持 hairpin**
host 自己 curl 自己公网 IP 都会 timeout。所有「同机服务互访」**必须走 docker DNS 名**（如 `http://backend:3211`、`http://minio:9000`），不能用公网 IP。

**③ Cloudflare R2 在国内 ECS 不实用**
DNS 优先返 IPv6 但 ECS 无 IPv6 路由；IPv4 跨境约 90KB/s。改用同机 MinIO。

### 4.2 Convex backend 层

**④ R2 → MinIO 切换必须 clean reset 两个 volume**
（`vulture-clawhub_data` + `vulture-clawhub_minio_data`）。convex DB 里残留 R2 时代的 module storage key，切到 MinIO 后找不到 object，API 全 500 `Src Pkg storage key not found`。

**⑤ MinIO 必须启用 KES**
convex backend 写 S3 强制带 SSE-KMS header，不配 KMS 会 `NotImplemented (KMS not configured)`。compose 里：
```yaml
- MINIO_KMS_SECRET_KEY=vulture-key:<openssl rand -base64 32>
```

**⑥ `VULTURE_*` 运行时 env 要双写**
docker env（注 backend 容器）+ `bunx convex env set`（注 isolate 运行时）。前者给 Rust backend 守卫读，后者给 JS 函数运行时读：

| 变量 | 作用 | 缺时症状 |
|------|------|---------|
| `VULTURE_DEFAULT_SYSTEM_USER=1` | 内网默认登入 system admin | 前端没登录入口 |
| `VULTURE_SKIP_PLUGIN_PUBLISH_VALIDATION=1` | 跳过 plugin.json/package.json/configSchema/inspector 校验 | 上传 plugin 报 `plugin.json is required for plugin packages` |

### 4.3 前端 / SSR 层

**⑦ TanStack Start 构建产物是 `.output/`，不是 `dist/`**
里面是 Nitro SSR，需要 Node runtime 跑 `node server/index.mjs`，不能光 nginx 静态托管。web 容器用 `node:22-alpine`。

**⑧ SSR 容器要同时设 `CONVEX_URL` 和 `VITE_CONVEX_URL`**
- `CONVEX_URL=http://backend:3210`：SSR 内→backend 走 docker 内网
- `VITE_CONVEX_URL=http://8.136.147.138:3210`：hydrate 给客户端
SSR runtime `getRequiredRuntimeEnv("VITE_CONVEX_URL")` 硬检查，缺则 SSR 500。

**⑨ `crypto.subtle === undefined` 在 HTTP 站点**
`http://ip` 不是 secure context，浏览器禁用 WebCrypto。`src/routes/upload/-utils.ts` 的 `hashFile()` 直接 `crypto.subtle.digest(…)` 会抛 `Cannot read properties of undefined (reading 'digest')`，且 `publish.tsx` for-loop 没 catch，表单永远卡"正在上传文件…"。已修：检测到无 subtle 时 lazy import `@noble/hashes/sha2.js`。⚠️ 项目里还有第二个同名 `hashFile` 在 `src/lib/uploadUtils.ts`，publish 流程**用的不是它**。

**⑩ vite/bun build 增量缓存极强**
改 src 后 `bun run build` 可能 1.3 秒就跑完且 chunk 内容**没变**。需 `rm -rf .output .nitro .tanstack node_modules/.vite node_modules/.cache` 强制重打；确认 `.output/public/assets/index-*.js` 文件名 hash 变了再 scp。

**⑪ Nitro 不会自动反代 `/api/v1/**` 到 backend**
浏览器/CLI 访问 `http://<ip>/api/v1/...` 默认返回 `Only HTML requests are supported here`。修复在 `vite.config.ts` 的 `nitro()` plugin 加 routeRules：
```ts
routeRules: { "/api/v1/**": { proxy: `${process.env.NITRO_V1_PROXY_TARGET}/api/v1/**` } }
```
build 时附 `NITRO_V1_PROXY_TARGET=http://backend:3211`。前端用 `VITE_CONVEX_SITE_URL` 绝对 URL 不依赖这条 proxy，但 SSR 首页 hydrate 时也会同源 fetch `/api/v1/plugins?featured=true`，没这条 proxy 会 500。

### 4.4 部署流程层

**⑫ 推 convex 函数必须经 SSH 隧道**
即使 SG 开了 3210，本地 `bunx convex deploy` 走公网偶发 TLS reset。推荐：
```sh
ssh -fN -L 13210:127.0.0.1:3210 root@8.136.147.138
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:13210 bunx convex deploy --yes
```

**⑬ build 时 env 不能漏**
所有 `VITE_*` 前缀变量 build 时被 baked 进 client bundle，runtime 改 docker env 无效。变更前端 host/URL 后必须重 build + 重传 `.output/`。

---

## 5. 故障排查速查

| 症状 | 看哪 | 大概率原因 |
|------|------|-----------|
| 浏览器打开 `/skills/publish` 后表单卡 "正在上传文件…" | F12 Console 报 `Cannot read properties of undefined (reading 'digest')` | crypto.subtle in http context → 见 §4 第 ⑨ 条 |
| 上传 plugin 报 `plugin.json is required for plugin packages` | backend log | `VULTURE_SKIP_PLUGIN_PUBLISH_VALIDATION=1` 没双写 → §4 第 ⑥ 条 |
| `http://ip/api/v1/*` 返回 `Only HTML requests are supported here` | web 容器是 Nitro SSR | 没配 routeRules proxy → §4 第 ⑪ 条 |
| 任意 API 500 `Src Pkg storage key not found` | backend log | R2 时代脏数据 → §4 第 ④ 条 |
| `convex deploy` 推送时 `NotImplemented (KMS not configured)` | backend log | MinIO 没 KES → §4 第 ⑤ 条 |
| backend → MinIO 报 `HTTP connect timeout` | backend log | endpoint 用了公网 IP，aliyun 无 hairpin → §4 第 ② 条 |
| 前端 SSR `Missing required environment variable: VITE_CONVEX_URL` | web 容器 log | 没在 web env 里写 `VITE_*` 一组 → §4 第 ⑧ 条 |
| pull 镜像 timeout | `docker pull` | ghcr.io 不通 → §4 第 ① 条，换 `ghcr.nju.edu.cn` |
| 改了源码 build 后行为没变 | `.output/public/assets/index-*.js` hash 没变 | vite 缓存 → §4 第 ⑩ 条 |
| 重启或重装后默认 system user 没回来 | `docker exec backend env \| grep VULTURE`、`bunx convex env list` | env 双写丢一个 → §4 第 ⑥ 条 |

---

## 6. 文件说明

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | 4 容器 + 1 init container 的最终编排；NAT/KES/depends_on 都已配 |
| `.env.example` | 所有可配 env 的注释样板，**永远 commit** |
| `.env` | 实际凭证（R2/MinIO 密码/master key），**gitignored，永不 commit** |
| `output/` | 服务器上由 `output.tar.gz` 解出来的 Nitro SSR 产物，由 web 容器只读 mount |
| `output.tar.gz` | 本地 build 后打包传服务器的中间产物，**gitignored** |
