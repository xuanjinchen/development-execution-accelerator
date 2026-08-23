import assert from 'node:assert/strict';
import test from 'node:test';

export function defineCatalogContract(normalizeCatalog) {
  test('normalizes SKU and tags without mutating the input', () => {
    const records = [{ sku: '  b-20 ', quantity: 2, tags: [' Sale ', 'FEATURED', 'sale'] }];
    const snapshot = structuredClone(records);

    assert.deepEqual(normalizeCatalog(records), [
      { sku: 'B-20', quantity: 2, tags: ['featured', 'sale'] },
    ]);
    assert.deepEqual(records, snapshot);
  });

  test('merges duplicate SKUs and returns stable SKU order', () => {
    const records = [
      { sku: 'b-20', quantity: 2, tags: ['clearance'] },
      { sku: ' A-10 ', quantity: 1, tags: ['New'] },
      { sku: ' B-20 ', quantity: 3, tags: ['FEATURED', 'clearance'] },
    ];

    assert.deepEqual(normalizeCatalog(records), [
      { sku: 'A-10', quantity: 1, tags: ['new'] },
      { sku: 'B-20', quantity: 5, tags: ['clearance', 'featured'] },
    ]);
  });

  test('rejects empty SKUs and zero quantities', () => {
    assert.throws(
      () => normalizeCatalog([{ sku: '  ', quantity: 1, tags: [] }]),
      TypeError,
    );
    assert.throws(
      () => normalizeCatalog([{ sku: 'A-10', quantity: 0, tags: [] }]),
      TypeError,
    );
  });

  test('rejects negative quantities', () => {
    assert.throws(
      () => normalizeCatalog([{ sku: 'A-10', quantity: -1, tags: [] }]),
      TypeError,
    );
  });
}
