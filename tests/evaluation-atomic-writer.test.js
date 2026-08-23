import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeTraceAtomically } from '../scripts/evaluate-accelerator.js';

test('atomic trace writer preserves the old trace and cleans owned temps on sync failure', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-writer-sync-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'controller-trace.json');
  await writeFile(target, 'old-trace', 'utf8');

  await assert.rejects(
    writeTraceAtomically(target, { schema_version: 1 }, {
      async openFile(...args) {
        const handle = await open(...args);
        return {
          writeFile: (...writeArgs) => handle.writeFile(...writeArgs),
          sync: async () => { throw new Error('injected sync failure'); },
          close: () => handle.close(),
        };
      },
    }),
    /sync failure/iu,
  );

  assert.equal(await readFile(target, 'utf8'), 'old-trace');
  assert.deepEqual(await readdir(directory), ['controller-trace.json']);
});

test('atomic trace writer preserves the old trace and cleans owned temps on rename failure', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-writer-rename-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'controller-trace.json');
  await writeFile(target, 'old-trace', 'utf8');

  await assert.rejects(
    writeTraceAtomically(target, { schema_version: 1 }, {
      renameFile: async () => { throw new Error('injected rename failure'); },
    }),
    /rename failure/iu,
  );

  assert.equal(await readFile(target, 'utf8'), 'old-trace');
  assert.deepEqual(await readdir(directory), ['controller-trace.json']);
});
