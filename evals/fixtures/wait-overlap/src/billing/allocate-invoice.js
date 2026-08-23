function finiteWeightParts(weight) {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, weight, false);
  const high = view.getUint32(0, false);
  const low = view.getUint32(4, false);
  const exponentBits = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(low);

  // 次正规数直接使用 2^-1074；正规数补回编码中省略的最高有效位。
  if (exponentBits === 0) {
    return { significand: fraction, exponent: -1074 };
  }
  return {
    significand: (1n << 52n) | fraction,
    exponent: exponentBits - 1023 - 52,
  };
}

export function allocateInvoice(totalCents, weights) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new TypeError('totalCents must be a non-negative safe integer');
  }
  if (!Array.isArray(weights) || weights.length === 0
      || weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw new TypeError('weights must be a non-empty array of positive finite numbers');
  }

  // 把有限 IEEE-754 权重还原为同一二进制尺度的整数，避免浮点配额越过整数边界。
  const parts = weights.map(finiteWeightParts);
  const commonExponent = parts.reduce(
    (minimum, { exponent }) => Math.min(minimum, exponent),
    parts[0].exponent,
  );
  const integerWeights = parts.map(({ significand, exponent }) => (
    significand << BigInt(exponent - commonExponent)
  ));
  const totalWeight = integerWeights.reduce((sum, weight) => sum + weight, 0n);
  const exactTotal = BigInt(totalCents);
  const quotas = integerWeights.map((weight, index) => {
    const numerator = exactTotal * weight;
    return {
      index,
      floor: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });
  const floorTotal = quotas.reduce((sum, { floor }) => sum + floor, 0n);
  const remaining = Number(exactTotal - floorTotal);
  const allocations = quotas.map(({ floor }) => Number(floor));

  // 精确余数相同时按原索引分配，保证最大余数法的稳定顺序。
  const remainderOrder = [...quotas].sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (let index = 0; index < remaining; index += 1) {
    allocations[remainderOrder[index].index] += 1;
  }
  return allocations;
}
