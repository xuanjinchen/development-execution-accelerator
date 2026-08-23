import assert from 'node:assert/strict';
import test from 'node:test';

import { doubleValue } from '../src/value.js';

test('doubles finite numeric input', () => {
  assert.equal(doubleValue(4), 8);
  assert.equal(doubleValue(-1.5), -3);
});

test('rejects non-finite input', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => doubleValue(value), TypeError);
  }
});
