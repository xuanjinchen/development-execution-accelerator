import { createHash } from 'node:crypto';

const RECORD_COUNT = 96;
const PBKDF2_ITERATIONS = 2400000;

export function runCorpus({ normalizeCatalog, allocateInvoice, derive }) {
  const records = Array.from({ length: RECORD_COUNT }, (_, index) => ({
    sku: ` sku-${String(index % 32).padStart(3, '0')} `,
    quantity: (index % 5) + 1,
    tags: [` GROUP-${index % 4} `, index % 2 === 0 ? 'featured' : ' Featured '],
  }));
  const normalized = normalizeCatalog(records);
  const weights = normalized.map(({ quantity }, index) => quantity * (index + 1));
  const allocations = allocateInvoice(98765, weights);

  // 固定语料逐项进入可注入派生函数，使廉价测试与生产 PBKDF2 共享同一数据流。
  const integrity = createHash('sha256');
  for (let index = 0; index < records.length; index += 1) {
    const payload = JSON.stringify({
      index,
      source: records[index],
      normalized: normalized[index % normalized.length],
      allocated_cents: allocations[index % allocations.length],
    });
    const salt = `development-execution-accelerator:${String(index).padStart(3, '0')}`;
    integrity.update(derive(payload, salt, PBKDF2_ITERATIONS, 32, 'sha256'));
  }

  return {
    records: RECORD_COUNT,
    iterations: PBKDF2_ITERATIONS,
    algorithm: 'sha256',
    digest: integrity.digest('hex'),
  };
}
