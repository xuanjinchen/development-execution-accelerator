export function formatSummary(records, allocations) {
  // 评测起点故意保留独立 reporting 缺口，供语料验证运行期间修复。
  return { records, allocations };
}
