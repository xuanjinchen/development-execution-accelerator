export function allocateInvoice(totalCents, weights) {
  // 评测起点故意不分配金额，由 billing 工作域独立修复。
  return weights.map(() => 0);
}
