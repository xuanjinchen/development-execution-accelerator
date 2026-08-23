import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';

import { allocateInvoice } from '../src/billing/allocate-invoice.js';
import { normalizeCatalog } from '../src/catalog/normalize-catalog.js';
import { runCorpus } from '../../contracts/corpus-runner.js';

const result = runCorpus({ normalizeCatalog, allocateInvoice, derive: pbkdf2Sync });
assert.equal(result.digest, 'a96001e44b98186c6d70698bfb28faff9db79803fb618bfb0b7218d2e944bc69');
process.stdout.write(`${JSON.stringify(result)}\n`);
