export function formatRetryDelay(retryAfterSeconds: number | null) {
  if (!retryAfterSeconds || retryAfterSeconds <= 0) return "稍后";
  if (retryAfterSeconds < 60) {
    return `约 ${retryAfterSeconds} 秒后`;
  }
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `约 ${minutes} 分钟后`;
}
