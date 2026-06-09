# Vulture 裁剪 — 测试基线（Phase 0）

记录裁剪开始前 fork（openclaw/clawhub）的构建/测试现状，作为后续每个阶段「绿了再提交」的对照基准。

- 分支：`vulture-trim`（从 `main` @ `a3de2360` 切出）
- 记录时间：2026-06-09
- 运行环境：darwin / bun

## 命令与结果

| 命令 | 结果 | 说明 |
|------|------|------|
| `bun install` | ✅ exit 0 | 依赖安装成功 |
| `VITE_CONVEX_URL=https://example.invalid bun run build` | ✅ exit 0 | Vite + Nitro 生产构建成功（`built in 2.37s`，生成 `.output/`） |
| `bun run test`（裸 `vitest run`） | ⚠️ exit 1 | **2 套件失败 \| 253 通过 \| 1 跳过（共 256）；3006 测试通过 \| 1 跳过（共 3007）** |
| `VITE_CONVEX_URL=https://example.invalid bun run test src/components/SkillHeader.test.tsx src/components/UserBadge.test.tsx` | ✅ exit 0 | 15 测试全部通过 |

## 关于 `bun run test` 的 2 个失败套件

失败套件：

- `src/components/SkillHeader.test.tsx`
- `src/components/UserBadge.test.tsx`

失败原因（两者相同）：

```
Error: Missing required environment variable: VITE_CONVEX_URL
 ❯ getRequiredRuntimeEnv src/lib/runtimeEnv.ts:24:9
 ❯ src/convex/client.ts:5:19
```

**结论：这是环境依赖，不是代码回归。**

- 这两个组件在导入链上经 `src/convex/client.ts` 读取必填环境变量 `VITE_CONVEX_URL`，裸跑 `vitest run` 时该变量未设置，套件在 import 阶段即抛错（0 test 执行）。
- 项目 CI 的单元测试入口是 `bun run ci:unit`，即 `VITE_CONVEX_URL=https://example.invalid bun run coverage`，会注入该变量。
- 已验证：补上 `VITE_CONVEX_URL=https://example.invalid` 后，这两个套件 15 个测试全部通过。

## 基线判定（供后续阶段对照）

- **真实通过测试数基线：3006 passed / 1 skipped**，且在带 `VITE_CONVEX_URL` 时为全绿。
- **构建基线：绿。**
- 后续各阶段验证统一采用带环境变量的入口，避免把这 2 个环境性失败误判为回归：
  - 测试：`VITE_CONVEX_URL=https://example.invalid bun run test`（或 CI 的 `bun run ci:unit`）
  - 构建：`VITE_CONVEX_URL=https://example.invalid bun run build`
- 判定回归的规则：若某测试在「带 `VITE_CONVEX_URL`」下由绿转红，且不是「本阶段应删除的功能对应的测试」，即视为真实回归，需修复后再提交。
