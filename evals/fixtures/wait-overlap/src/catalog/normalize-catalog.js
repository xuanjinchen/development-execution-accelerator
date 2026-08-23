export function normalizeCatalog(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('records must be an array');
  }

  const merged = new Map();
  for (const record of records) {
    if (record === null || typeof record !== 'object') {
      throw new TypeError('each record must be an object');
    }
    const sku = typeof record.sku === 'string' ? record.sku.trim().toUpperCase() : '';
    if (sku.length === 0 || !Number.isSafeInteger(record.quantity) || record.quantity <= 0) {
      throw new TypeError('records require a non-empty SKU and positive safe-integer quantity');
    }
    if (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== 'string')) {
      throw new TypeError('record tags must be an array of strings');
    }

    const existing = merged.get(sku) ?? { sku, quantity: 0, tags: new Set() };
    existing.quantity += record.quantity;
    if (!Number.isSafeInteger(existing.quantity)) {
      throw new TypeError('merged quantity exceeds the safe-integer range');
    }
    for (const tag of record.tags) {
      const normalizedTag = tag.trim().toLowerCase();
      if (normalizedTag.length > 0) existing.tags.add(normalizedTag);
    }
    merged.set(sku, existing);
  }

  return [...merged.values()]
    .sort((left, right) => left.sku.localeCompare(right.sku, 'en'))
    .map(({ sku, quantity, tags }) => ({
      sku,
      quantity,
      tags: [...tags].sort((left, right) => left.localeCompare(right, 'en')),
    }));
}
