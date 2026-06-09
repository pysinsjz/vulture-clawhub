# Vulture 裁剪契约

目标：把 ClawHub 裁成「内网私有 Skill/Plugin 注册中心」，鉴权与身份全部上移到外部网关，去掉公开市场。

## 保留（注册中心内核）
- 数据模型：skills / skillVersions / skillVersionFingerprints / packages / packageReleases / packageSearchDigest / skillSearchDigest / 相关 slug 别名表
- v1 HTTP API：search / 列表(skills,packages,plugins,code-plugins,bundle-plugins) / 详情 / versions / resolve(指纹) / download / 安全(security-verdicts,verify,scan,packages security)
- 生命周期：publish / resolve(指纹) / install / update / pin / uninstall / rename / merge / soft-delete；lock.json + origin.json + 指纹算法
- semver + tag（latest 服务端权威）+ changelog
- family：skill / code-plugin / bundle-plugin
- compat 门禁 + Plugin Inspector（packageInspectorNode 兼容性扫描，发布前 breakage>0 即失败）
- 确定性打包下载；确定性静态扫描(runStaticPublishScan)；manualModeration(approved/quarantined/revoked)
- 安装遥测 telemetry（保留）

## 裁剪（移除）
- 身份认证：GitHub OAuth、Convex Auth、JWT 密钥、GitHub 账龄门控、GitHub App/Token、CLI device auth、publish OIDC trusted-publishing token
- 公开市场：stars、comments(含 scam 审核)、leaderboards、reports/appeals/moderation 状态机、publisherAbuse 评分、auto-ban
- souls 全套（souls/soulVersions/soulEmbeddings/soulComments/soulStars + soul 路由 + soul-format + SoulHub）
- 外部扫描 worker：Codex 扫描 worker(securityScan worker 协议)、VirusTotal(vt.ts)、llmEval、Resend 邮件；depRegistryScan 可选移除
- 向量搜索：skillEmbeddings/embeddingSkillMap/soulEmbeddings + vector index + OpenAI embeddings；改为关键字/前缀检索（复用 skillSearchDigest 的 search_by_display_name/search_by_slug）

## 改造（适配）
- 去鉴权纯内网：HTTP API v1 不做鉴权（信任网关内网调用）；publish/维护类端点改为内网/运营专用。把 requireApiTokenUser / requirePackagePublishAuth / mintPublishToken 等替换为「信任内网」桩
- 制品存储 → S3 兼容 OSS：优先把自托管 Convex 的 file-storage 后端配成 S3 兼容 OSS（下载逻辑不变）；若不支持再改上传/下载路径直连 OSS
- 客户端 CLI 改品牌：.clawhub → .vulture；.clawhubignore → .vultureignore；CLAWHUB_DISABLE_TELEMETRY → VULTURE_DISABLE_TELEMETRY；默认 registry URL 改为我们的
- skill 下载补完整性头：downloadZipHandler 增加 ETag:"sha256:..." / Digest / X-ClawHub-Artifact-Sha256（与 package 下载一致）

## 纪律
- 每个阶段最小改动、可独立验证；改完跑 `bun run build` + `bun run test`，绿了再原子提交；测试失败优先判断是「该删的测试」还是「真回归」
