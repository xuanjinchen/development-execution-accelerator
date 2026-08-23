import assert from 'node:assert/strict';
import test from 'node:test';

export function defineBillingContract(allocateInvoice) {
  test('allocates exact cents by largest remainder with stable ties', () => {
    assert.deepEqual(allocateInvoice(10, [1, 1, 1]), [4, 3, 3]);
    assert.deepEqual(allocateInvoice(17, [3, 2, 1]), [8, 6, 3]);
  });

  test('does not mutate weights and handles a zero total', () => {
    const weights = [2, 3, 5];
    const snapshot = [...weights];

    assert.deepEqual(allocateInvoice(0, weights), [0, 0, 0]);
    assert.deepEqual(weights, snapshot);
  });

  test('rejects unsafe totals and non-positive or non-finite weights', () => {
    for (const total of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => allocateInvoice(total, [1]), TypeError);
    }
    for (const weights of [[], [0, 1], [-1, 1], [Number.POSITIVE_INFINITY, 1]]) {
      assert.throws(() => allocateInvoice(10, weights), TypeError);
    }
  });

  test('allocates a safe total when finite weights overflow their raw sum', () => {
    assert.deepEqual(
      allocateInvoice(Number.MAX_SAFE_INTEGER, [Number.MAX_VALUE, Number.MAX_VALUE]),
      [4503599627370496, 4503599627370495],
    );
  });

  test('is invariant when positive finite weights are scaled proportionally', () => {
    const scale = Number.MAX_VALUE / 4;
    assert.deepEqual(allocateInvoice(101, [1, 2, 3]), [17, 34, 50]);
    assert.deepEqual(allocateInvoice(101, [scale, scale * 2, scale * 3]), [17, 34, 50]);
  });

  test('keeps exact safe-integer quotas at a binary rounding boundary', () => {
    const totalCents = 9007199254740286;
    const allocations = allocateInvoice(totalCents, [1, 1 / 35]);

    assert.deepEqual(allocations, [8756999275441945, 250199979298341]);
    assert.ok(allocations.every(Number.isSafeInteger));
    assert.equal(allocations.reduce((sum, value) => sum + value, 0), totalCents);
  });

  test('supports positive finite subnormal weights without losing stable ties', () => {
    assert.deepEqual(allocateInvoice(3, [Number.MIN_VALUE, Number.MIN_VALUE]), [2, 1]);
    assert.deepEqual(allocateInvoice(3, [Number.MIN_VALUE, Number.MAX_VALUE]), [0, 3]);
  });
}
