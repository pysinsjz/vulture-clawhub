// vulture-trim: 内网注册中心——所有技能/插件均由团队内部发布，跳过安全审计。
//
// 前端「安全审计」面板（DetailSecuritySummary / SkillSecurityScanResults）的
// 顶点状态来自扫描产物 llmAnalysis（ClawScan），而非后端 scanStatus/moderationVerdict。
// 由于发布流程已不再调度任何扫描，若不写入产物，面板会回退显示「待检测(pending)」。
//
// 因此发布时写入一条合成的 clean llmAnalysis，使面板显示「通过」，并在详情页
// 给出「内网自动通过」的说明，同时与后端 scanStatus="clean" / moderationVerdict
// 保持一致。model 标记为内网哨兵，便于区分这不是真实扫描结果。

export const INTERNAL_AUTO_PASS_LLM_MODEL = "vulture-internal-auto-pass";

export function buildInternalAutoPassLlmAnalysis(now: number) {
  return {
    status: "clean",
    verdict: "clean",
    confidence: "high",
    summary: "内网注册中心：团队内部发布，已跳过安全审计并自动标记为通过。",
    guidance: "如需正式安全审计，可由管理员手动触发重扫（requestSkillRescan / requestPackageRescan）。",
    model: INTERNAL_AUTO_PASS_LLM_MODEL,
    checkedAt: now,
  };
}
