import assert from 'node:assert/strict';
import test from 'node:test';

import { allocateInvoice } from '../src/billing/allocate-invoice.js';
import { normalizeCatalog } from '../src/catalog/normalize-catalog.js';

test('normalizes the invoice catalog before allocating the exact total', () => {
  const normalized = normalizeCatalog([
    { sku: ' B-20 ', quantity: 2, tags: ['Sale'] },
    { sku: 'a-10', quantity: 1, tags: ['New'] },
    { sku: 'b-20', quantity: 3, tags: ['Featured'] },
  ]);
  const allocations = allocateInvoice(101, normalized.map(({ quantity }) => quantity));

  assert.deepEqual(normalized, [
    { sku: 'A-10', quantity: 1, tags: ['new'] },
    { sku: 'B-20', quantity: 5, tags: ['featured', 'sale'] },
  ]);
  assert.deepEqual(allocations, [17, 84]);
  assert.equal(allocations.reduce((sum, cents) => sum + cents, 0), 101);
});
