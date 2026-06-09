# 制品存储 Spike — 自托管 Convex 能否用 S3 兼容 OSS

## 结论（决定 Phase 6 路线）

**支持。走「配置化」路线：不改 ClawHub 的 `convex/uploads.ts` / `convex/downloads.ts` / `packageReleases.clawpackStorageId` 取存代码。** 自托管 `get-convex/convex-backend` 的 file-storage 后端可通过环境变量直接配置为 S3 兼容对象存储（含阿里云 OSS / Cloudflare R2 / MinIO 等）。`ctx.storage` 读写的用户文件由后端写入 `S3_STORAGE_FILES_BUCKET`，应用层完全无感——确定性打包与 sha256 逻辑不变。

来源：[convex-backend/self-hosted/advanced/s3_storage.md](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/s3_storage.md)、[self-hosted/README.md](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md)

## 配置说明（自托管 backend 环境变量）

```sh
# AWS / S3 凭证与区域
export AWS_REGION="<region>"                  # 如 oss-cn-hangzhou 对应区域；非 AWS 任填占位
export AWS_ACCESS_KEY_ID="<access-key-id>"
export AWS_SECRET_ACCESS_KEY="<secret-access-key>"

# 五类存储桶（按用途分桶；可指向同一 OSS 不同 bucket）
export S3_STORAGE_EXPORTS_BUCKET="vulture-snapshot-exports"
export S3_STORAGE_SNAPSHOT_IMPORTS_BUCKET="vulture-snapshot-imports"
export S3_STORAGE_MODULES_BUCKET="vulture-modules"
export S3_STORAGE_FILES_BUCKET="vulture-user-files"      # ← 制品/用户文件（ctx.storage）落这里
export S3_STORAGE_SEARCH_BUCKET="vulture-search-indexes"

# 非 AWS S3 兼容服务（阿里云 OSS / R2 / MinIO）必填
export S3_ENDPOINT_URL="https://oss-cn-hangzhou.aliyuncs.com"   # 你的 OSS endpoint
export AWS_S3_FORCE_PATH_STYLE="true"          # MinIO / 部分 OSS 路径风格寻址需要
```

要点：
- **`S3_STORAGE_FILES_BUCKET` 是制品存储的关键**（`ctx.storage` 即 skill ZIP / package clawpack 的落点）。其余四个桶服务 exports/imports/modules/search，自托管运行同样需要，建议一并配置。
- **`S3_ENDPOINT_URL`**：非 AWS 的 S3 兼容服务（阿里云 OSS、Cloudflare R2、MinIO）必须设置为对应 endpoint。
- **`AWS_S3_FORCE_PATH_STYLE=true`**：MinIO / DigitalOcean / 部分 OSS 需要路径风格寻址（`endpoint/bucket/key` 而非 `bucket.endpoint/key`）。阿里云 OSS 两种寻址都支持，按 bucket 配置选择。
- 桶需预先创建并授予该 access key 读写权限。

## 路线影响

- **代码改造：无。** `convex/uploads.ts`（生成上传 URL）、`convex/downloads.ts`（下载 / 确定性打包 / sha256 头）、`packageReleases.clawpackStorageId` 全部保持原样——它们走 Convex `ctx.storage` 抽象，后端把存储落到 OSS 对应用层透明。
- **交付物：** 本配置说明 + 在 Phase 8 `SELF-HOST.md` 的 env 清单中纳入上述 S3 变量。
- 本地/默认仍可用 backend 自带的本地文件存储（不设 S3_* 变量时）；切换本地 ↔ S3 需 `npx convex export` 再 `npx convex import --replace-all` 迁移既有文件。

## 本阶段结论

Phase 6 **无代码改动**，仅产出本 spike + 配置说明。下载逻辑（含 Phase 7 将补的 skill 下载完整性头）与确定性打包不受存储后端影响。
