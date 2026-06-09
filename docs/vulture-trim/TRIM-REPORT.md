# Vulture 裁剪报告

对照 [TRIM-SPEC.md](./TRIM-SPEC.md) 逐条核对裁剪结果。覆盖 Phase 0–8。

**状态图例**：✅ 已停用/已改造（运行时生效）｜⬛ dormant 待物理删除（见 [PHYSICAL-DELETE.md](./PHYSICAL-DELETE.md)）｜⛔ 故意保留

> 核心策略：离线无法 `convex codegen`，故采用「**就地停用**」——去路由/cron/前端/测试，schema 表与 convex 模块保留 dormant，真正物理删除全部记入 PHYSICAL-DELETE.md。本报告「状态」列区分「停用（运行时不可达）」与「dormant（代码尚在）」。

---

## A. 保留（注册中心内核）— 全部保留 ⛔

| 契约项 | 结果 |
|--------|------|
| 数据模型：skills / skillVersions / skillVersionFingerprints / packages / packageReleases / packageSearchDigest / skillSearchDigest / slug 别名表 | ⛔ 保留 |
| v1 HTTP API：search / 列表 / 详情 / versions / resolve(指纹) / download / 安全端点 | ⛔ 保留（去鉴权，纯内网） |
| 生命周期：publish / resolve / install / update / pin / uninstall / rename / merge / soft-delete；lock.json + origin.json + 指纹算法 | ⛔ 保留 |
| semver + tag（latest 服务端权威）+ changelog | ⛔ 保留 |
| family：skill / code-plugin / bundle-plugin | ⛔ 保留 |
| compat 门禁 + Plugin Inspector（`packageInspectorNode` 发布前 breakage>0 失败） | ⛔ 保留（发布内联） |
| 确定性打包下载 + 确定性静态扫描（`runStaticPublishScan`）+ manualModeration(approved/quarantined/revoked) | ⛔ 保留 |
| 安装遥测 telemetry | ⛔ 保留 |

---

## B. 裁剪（移除）

### 身份认证 — Phase 1 ✅ `821a2dc2`
| 项 | 状态 |
|----|------|
| GitHub OAuth / Convex Auth / JWT 密钥 | ✅ 停用：HTTP API 去鉴权，`apiTokenAuth` 内网回退 system 身份 |
| GitHub 账龄门控 | ✅ 改为「用户存在」守卫（githubAccount） |
| GitHub App/Token、CLI device auth | ✅ `http.ts` 去 OAuth/device/mint 路由 |
| publish OIDC trusted-publishing token | ✅ 停用，改信任内网 |

### 公开市场 — Phase 2a/2b ✅ `e373df95` / `b7948035`
| 项 | 状态 |
|----|------|
| stars | ✅ 后端去 stars 路由；前端 `SHOW_SKILL_STARS` flag 关闭、去 /stars 导航。⬛ schema 表/模块 dormant |
| comments（含 scam 审核） | ✅ 早已 `SHOW_SKILL_COMMENTS=false`；⬛ 模块/表 dormant |
| leaderboards | ✅ crons 去 `trending-leaderboard`；⬛ 模块/表 dormant |
| reports / appeals / moderation 状态机 | ✅ 前端报告入口随 flag 关闭；⬛ 模块/表 dormant |
| publisherAbuse 评分 | ✅ crons 去 `publisher-abuse-score-refresh`/`publisher-temporal-abuse-scan`；⬛ 模块/表 dormant |
| auto-ban | ✅ 升级触发器停用；⬛ `users.ts` 相关 internal 待编辑删除（保留通用人工封禁） |

### souls 全套 — Phase 3 ✅ `7597efab`
| 项 | 状态 |
|----|------|
| souls/soulVersions/soulEmbeddings/soulComments/soulStars + soul 路由 | ✅ `http.ts` 移除全部 souls v1 路由；⬛ 模块/表 dormant |
| soul-format / SoulHub | ✅ 站点内网天然为 skills 模式，SoulHub 配置失活、不可达 |

### 外部扫描 worker — Phase 5 ✅ `05a259fa`
| 项 | 状态 |
|----|------|
| Codex 扫描 worker（securityScan worker 协议） | ✅ crons 去 `vt-*`；http 去 package-inspector worker 路由；⬛ worker 协议代码 dormant |
| VirusTotal（vt.ts） | ✅ 内网无 token 不可达；⬛ dormant |
| llmEval / Resend 邮件 | ✅ 内网无 key 不可达；⬛ dormant |
| depRegistryScan（可选移除） | ⬛ dormant（可选） |

### 向量搜索 — Phase 4 ✅ `cad5679d`
| 项 | 状态 |
|----|------|
| skillEmbeddings / embeddingSkillMap / soulEmbeddings + vector index + OpenAI embeddings | ✅ `search.ts` 去向量分支；改用 `skillSearchDigest` 全文/前缀索引。响应 `{results}` 不变。⬛ 表/embeddings 模块 dormant |

---

## C. 改造（适配）

| 契约项 | 状态 | 提交 |
|--------|------|------|
| 去鉴权纯内网：v1 API 信任网关内网调用；publish/维护端点内网专用；`requireApiTokenUser`/`requirePackagePublishAuth`/`mintPublishToken` → 信任内网桩 | ✅ | Phase 1 `821a2dc2` |
| 制品存储 → S3 兼容 OSS：配置化路线，自托管 convex file-storage 配 S3，**下载逻辑零改动** | ✅（spike + 配置） | Phase 6 `a905665f`（见 [STORAGE-SPIKE.md](./STORAGE-SPIKE.md)） |
| CLI 改品牌：`.clawhub`→`.vulture`、`CLAWHUB_DISABLE_TELEMETRY`→`VULTURE_DISABLE_TELEMETRY`、默认 registry URL | ✅（双 legacy 回退） | Phase 7b `a6ffd33e` |
| skill 下载补完整性头：`ETag:"sha256:..."` / `Digest` / `X-ClawHub-Artifact-Sha256` | ✅ | Phase 7a `5564f04c` |

---

## D. Phase 8 收尾 ✅

| 交付物 | 状态 |
|--------|------|
| [SELF-HOST.md](./SELF-HOST.md)：自托管组件 + 精简 env 清单 + docker-compose/部署步骤 | ✅ |
| 全量验证（build / test / lint / knip） | ✅ 全绿（见下） |
| 本报告 TRIM-REPORT.md | ✅ |

### 验证结果（Phase 8 收尾，本会话实跑）

| 命令 | 结果 |
|------|------|
| `VITE_CONVEX_URL=… bun run test` | ✅ 255 套件通过 / 1 skip（3000 通过 / 1 skip，符合基线） |
| `bunx tsc --noEmit`（根类型检查） | ✅ clean |
| `bun run lint`（oxlint type-aware） | ✅ clean |
| `bun run deadcode:knip`（files/dependencies/exports） | ✅ clean — knip 配置已覆盖 dormant 项，无新增死代码告警 |
| `VITE_CONVEX_URL=… bun run build`（vite + copy-og） | ✅ ok |
| `bun run --cwd packages/clawhub test:src`（CLI） | ✅ 27 套件 / 293 通过 |
| `bunx tsc -p packages/clawhub/tsconfig.json --noEmit`（CLI 类型） | ✅ clean |

> **死代码说明**：knip 干净，无需为其改动；本次裁剪的 dormant 模块/表/未用导出（`_generated` 约束下故意保留）未被 knip 标出，已分别记入 [PHYSICAL-DELETE.md](./PHYSICAL-DELETE.md)。未对任何 convex 模块/schema 表做物理删除（会破坏离线构建）。

---

## E. 待办（物理删除阶段，非本里程碑）

拿到可用 Convex 部署后，按 [PHYSICAL-DELETE.md](./PHYSICAL-DELETE.md) 一次性：删 dormant 文件 → 从 `convex/schema.ts` 移除表/校验器 → 清残留 `Id<"...">`/`ctx.db.query` 引用 → `bunx convex codegen` 重生成 `_generated/` → build+test 验证。停用状态下系统已完整可用，物理删除为可选清理。
