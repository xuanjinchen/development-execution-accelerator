import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSummary } from '../src/reporting/format-summary.js';

test('returns a stable reporting summary without mutating inputs', () => {
  const records = [
    { sku: 'B-20', quantity: 5, tags: ['sale'] },
    { sku: 'A-10', quantity: 2, tags: ['new'] },
  ];
  const allocations = [71, 29];
  const recordSnapshot = structuredClone(records);
  const allocationSnapshot = [...allocations];

  assert.deepEqual(formatSummary(records, allocations), {
    sku_count: 2,
    total_quantity: 7,
    allocated_cents: 100,
    skus: ['A-10', 'B-20'],
  });
  assert.deepEqual(records, recordSnapshot);
  assert.deepEqual(allocations, allocationSnapshot);
});
