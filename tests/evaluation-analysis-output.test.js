import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analyzeEvaluation } from '../src/evaluation-analysis.js';

const plan = {
  schema_version: 1,
  scenarios: {
    'REQ-003': {
      orders: [
        ['with_skill', 'without_skill', 'draft_a34625a'],
        ['without_skill', 'draft_a34625a', 'with_skill'],
        ['draft_a34625a', 'with_skill', 'without_skill'],
      ],
      required_worker_domains: ['src/catalog', 'src/billing'],
      required_commands: ['npm run test:catalog', 'npm run test:billing', 'npm test'],
    },
    'REQ-002': {
      orders: [
        ['with_skill', 'without_skill'],
        ['without_skill', 'with_skill'],
        ['with_skill', 'without_skill'],
      ],
      required_commands: ['npm run test:value', 'npm test'],
    },
    'EVAL-008': {
      required_valid_runs: 3,
      variants: ['with_skill'],
      required_commands: ['npm run verify:corpus', 'npm run test:reporting', 'npm test'],
    },
  },
  invalid_reasons: ['CONTROLLER_FAILURE'],
  thresholds: {
    median_speedup_percent: 20,
    short_relative_percent: 115,
    short_absolute_seconds: 3,
    wait_min_remaining_seconds: 15,
  },
};

async function writer() {
  const { writeAnalysisGeneration } = await import('../scripts/evaluate-accelerator.js');
  assert.equal(typeof writeAnalysisGeneration, 'function');
  return writeAnalysisGeneration;
}

function interruptedAnalysis(label) {
  const analysis = analyzeEvaluation(plan, []);
  analysis.valid_runs = [label];
  return analysis;
}

async function interruptAfterRename(target, analysis, renameNumber, directory) {
  const input = path.join(directory, `interrupted-${renameNumber}.json`);
  await writeFile(input, JSON.stringify(analysis), 'utf8');
  const moduleUrl = new URL('../scripts/evaluate-accelerator.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import path from 'node:path';
    import { link, readFile, rename } from 'node:fs/promises';
    import { writeAnalysisGeneration } from ${JSON.stringify(moduleUrl)};
    const analysis = JSON.parse(await readFile(${JSON.stringify(input)}, 'utf8'));
    const output = ${JSON.stringify(target)};
    const markdown = path.join(path.dirname(output), path.basename(output, path.extname(output)) + '.md');
    const rollback = path.join(
      path.dirname(output),
      '.' + path.basename(output, path.extname(output)) + '.analysis-publication.lock',
      'markdown.rollback',
    );
    let publicationSteps = 0;
    await writeAnalysisGeneration(output, analysis, {
      async renameFile(source, destination) {
        await rename(source, destination);
        if (source === markdown && destination === rollback) {
          publicationSteps += 1;
          if (publicationSteps === ${renameNumber}) process.exit(86);
        }
      },
      async linkFile(source, destination) {
        await link(source, destination);
        if (destination === markdown || destination === output) {
          publicationSteps += 1;
          if (publicationSteps === ${renameNumber}) process.exit(86);
        }
      },
    });
  `], { encoding: 'utf8' });
  await rm(input);
  assert.equal(child.status, 86, child.stderr);
}

async function interruptAtPreparationStage(target, analysis, stage, directory) {
  const input = path.join(directory, `preparation-${stage}.json`);
  await writeFile(input, JSON.stringify(analysis), 'utf8');
  const moduleUrl = new URL('../scripts/evaluate-accelerator.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { link, open, readFile, rename } from 'node:fs/promises';
    import path from 'node:path';
    import { writeAnalysisGeneration } from ${JSON.stringify(moduleUrl)};
    const analysis = JSON.parse(await readFile(${JSON.stringify(input)}, 'utf8'));
    const output = ${JSON.stringify(target)};
    const lock = path.join(
      path.dirname(output),
      '.' + path.basename(output, path.extname(output)) + '.analysis-publication.lock',
    );
    const requestedStage = ${JSON.stringify(stage)};
    let externalCreates = 0;
    await writeAnalysisGeneration(output, analysis, {
      async openFile(targetPath, flags) {
        const handle = await open(targetPath, flags);
        const inLock = targetPath.startsWith(lock + path.sep);
        if (flags === 'wx' && inLock && path.basename(targetPath).includes('manifest')
          && requestedStage === 'manifest-prepare') process.exit(86);
        if (flags === 'wx' && !inLock && targetPath.endsWith('.tmp')) {
          externalCreates += 1;
          if (requestedStage === 'external-' + externalCreates) process.exit(86);
        }
        return handle;
      },
      async linkFile(source, destination) {
        await link(source, destination);
        if (!destination.startsWith(lock + path.sep) && destination.endsWith('.tmp')) {
          externalCreates += 1;
          if (requestedStage === 'external-' + externalCreates) process.exit(86);
        }
      },
      async renameFile(source, destination) {
        await rename(source, destination);
        if (!source.startsWith(lock + path.sep) && destination.endsWith('.tmp')) {
          externalCreates += 1;
          if (requestedStage === 'external-' + externalCreates) process.exit(86);
        }
        if (source.startsWith(lock + path.sep)
          && !destination.startsWith(lock + path.sep)
          && destination.endsWith('.tmp')) {
          externalCreates += 1;
          if (requestedStage === 'external-' + externalCreates) process.exit(86);
        }
        if (destination === path.join(lock, 'manifest.json')
          && requestedStage === 'manifest-commit') process.exit(86);
      },
    });
  `], { encoding: 'utf8' });
  await rm(input);
  assert.equal(child.status, 86, child.stderr);
}

async function interruptDuringRecovery(target, analysis, directory) {
  const input = path.join(directory, 'recovery-interruption.json');
  await writeFile(input, JSON.stringify(analysis), 'utf8');
  const moduleUrl = new URL('../scripts/evaluate-accelerator.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { readFile, rename } from 'node:fs/promises';
    import path from 'node:path';
    import { writeAnalysisGeneration } from ${JSON.stringify(moduleUrl)};
    const output = ${JSON.stringify(target)};
    const lock = path.join(
      path.dirname(output),
      '.' + path.basename(output, path.extname(output)) + '.analysis-publication.lock',
    );
    const analysis = JSON.parse(await readFile(${JSON.stringify(input)}, 'utf8'));
    await writeAnalysisGeneration(output, analysis, {
      async renameFile(source, destination) {
        await rename(source, destination);
        if (source === lock
          || (source.startsWith(lock + path.sep) && destination.startsWith(lock + path.sep))) {
          process.exit(87);
        }
      },
    });
  `], { encoding: 'utf8' });
  await rm(input);
  assert.equal(child.status, 87, child.stderr);
}

async function interruptRecoveryTransition(target, analysis, transition, directory) {
  const input = path.join(directory, `recovery-${transition}.json`);
  await writeFile(input, JSON.stringify(analysis), 'utf8');
  const moduleUrl = new URL('../scripts/evaluate-accelerator.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { link, readFile, rename, unlink } from 'node:fs/promises';
    import path from 'node:path';
    import { writeAnalysisGeneration } from ${JSON.stringify(moduleUrl)};
    const output = ${JSON.stringify(target)};
    const transition = ${JSON.stringify(transition)};
    const lock = path.join(
      path.dirname(output),
      '.' + path.basename(output, path.extname(output)) + '.analysis-publication.lock',
    );
    const analysis = JSON.parse(await readFile(${JSON.stringify(input)}, 'utf8'));
    const isOldOwnerClaim = (targetPath) => /^owner\.[1-9][0-9]*\.[A-Za-z0-9_-]+\.claim(?:\.quarantine\.[A-Za-z0-9_-]+)?$/u
      .test(path.basename(targetPath));
    const isJsonOriginal = (targetPath) => path.basename(targetPath).startsWith('json.original');
    const isJsonCurrent = (targetPath) => path.basename(targetPath).startsWith('json.current');
    await writeAnalysisGeneration(output, analysis, {
      async renameFile(source, destination) {
        await rename(source, destination);
        if (transition === 'orphan-held'
          && path.basename(destination).startsWith('recovery.orphan.')
          && path.basename(destination).includes('.held')) process.exit(88);
        if (transition === 'owner-handoff'
          && path.basename(source).startsWith('owner.held')
          && destination.includes('.quarantine.')) process.exit(88);
        if (transition === 'json-restored'
          && destination === output
          && isJsonOriginal(source)) process.exit(88);
        if (transition === 'committed-json-restored'
          && destination === output
          && isJsonCurrent(source)) process.exit(88);
      },
      async linkFile(source, destination) {
        await link(source, destination);
        if (transition === 'json-restored'
          && destination === output
          && isJsonOriginal(source)) process.exit(88);
        if (transition === 'committed-json-restored'
          && destination === output
          && isJsonCurrent(source)) process.exit(88);
      },
      async unlinkFile(targetPath) {
        await unlink(targetPath);
        if (transition === 'owner-handoff' && isOldOwnerClaim(targetPath)) process.exit(88);
      },
    });
  `], { encoding: 'utf8' });
  await rm(input);
  assert.equal(child.status, 88, child.stderr);
}

async function interruptRecoveryClaimReplacement(target, analysis, directory) {
  const input = path.join(directory, 'recovery-claim-replacement.json');
  await writeFile(input, JSON.stringify(analysis), 'utf8');
  const moduleUrl = new URL('../scripts/evaluate-accelerator.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { readFile, rename, unlink } from 'node:fs/promises';
    import path from 'node:path';
    import { writeAnalysisGeneration } from ${JSON.stringify(moduleUrl)};
    const output = ${JSON.stringify(target)};
    const analysis = JSON.parse(await readFile(${JSON.stringify(input)}, 'utf8'));
    const isRetiredRecovery = (source, destination) => (
      path.basename(source).startsWith('recovery.')
      && path.basename(destination).includes('.retired.')
    );
    await writeAnalysisGeneration(output, analysis, {
      async renameFile(source, destination) {
        await rename(source, destination);
        if (isRetiredRecovery(source, destination)) process.exit(90);
      },
      async unlinkFile(targetPath) {
        await unlink(targetPath);
        if (path.basename(targetPath).startsWith('recovery.stale.unique.held')) {
          process.exit(90);
        }
      },
    });
  `], { encoding: 'utf8' });
  await rm(input);
  assert.equal(child.status, 90, child.stderr);
}

async function interruptDuringRelease(target, analysis, directory) {
  const input = path.join(directory, 'release-interruption.json');
  await writeFile(input, JSON.stringify(analysis), 'utf8');
  const moduleUrl = new URL('../scripts/evaluate-accelerator.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { readFile, rename } from 'node:fs/promises';
    import path from 'node:path';
    import { writeAnalysisGeneration } from ${JSON.stringify(moduleUrl)};
    const output = ${JSON.stringify(target)};
    const lock = path.join(
      path.dirname(output),
      '.' + path.basename(output, path.extname(output)) + '.analysis-publication.lock',
    );
    const analysis = JSON.parse(await readFile(${JSON.stringify(input)}, 'utf8'));
    await writeAnalysisGeneration(output, analysis, {
      async renameFile(source, destination) {
        await rename(source, destination);
        if (source === lock && destination.includes('.completed.')) process.exit(91);
      },
    });
  `], { encoding: 'utf8' });
  await rm(input);
  assert.equal(child.status, 91, child.stderr);
}

async function createStaleOwnerLock(directory, token = 'stale-owner') {
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  await mkdir(lock);
  await writeFile(path.join(lock, 'owner.json'), `${JSON.stringify({
    pid: 2_147_483_647,
    protocol: 'analysis-publication-lock-v1',
    token,
  })}\n`, 'utf8');
  return lock;
}

async function assertSecondAndThirdRecoveryConverge(target, retained, final) {
  await stopNewPublicationAfterRecovery(target, interruptedAnalysis('second-recovery-probe'));
  const recovered = JSON.parse(await readFile(target, 'utf8'));
  assert.deepEqual(recovered.valid_runs, [retained]);

  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis(final));
  const published = JSON.parse(await readFile(target, 'utf8'));
  assert.deepEqual(published.valid_runs, [final]);
  assert.deepEqual(await visiblePublicationEntries(path.dirname(target)), ['benchmark.json', 'benchmark.md']);
}

async function interruptAfterUnsupportedDirectorySync(target, analysis, directory) {
  const input = path.join(directory, 'unsupported-directory-sync.json');
  await writeFile(input, JSON.stringify(analysis), 'utf8');
  const moduleUrl = new URL('../scripts/evaluate-accelerator.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { link, open, readFile } from 'node:fs/promises';
    import path from 'node:path';
    import { writeAnalysisGeneration } from ${JSON.stringify(moduleUrl)};
    const output = ${JSON.stringify(target)};
    const lock = path.join(
      path.dirname(output),
      '.' + path.basename(output, path.extname(output)) + '.analysis-publication.lock',
    );
    const analysis = JSON.parse(await readFile(${JSON.stringify(input)}, 'utf8'));
    await writeAnalysisGeneration(output, analysis, {
      platform: 'win32',
      async openFile(targetPath, flags) {
        const handle = await open(targetPath, flags);
        if (targetPath !== lock) return handle;
        return {
          async sync() {
            const error = new Error('injected unsupported directory sync');
            error.code = 'EPERM';
            throw error;
          },
          async close() {
            await handle.close();
          },
        };
      },
      async linkFile(source, destination) {
        await link(source, destination);
        if (!destination.startsWith(lock + path.sep) && destination.endsWith('.tmp')) {
          process.exit(89);
        }
      },
    });
  `], { encoding: 'utf8' });
  await rm(input);
  assert.equal(child.status, 89, child.stderr);
}

async function findFileWithBytes(directory, expected) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileWithBytes(target, expected);
      if (nested !== null) return nested;
    } else if (entry.isFile() && await readFile(target, 'utf8') === expected) {
      return target;
    }
  }
  return null;
}

async function visiblePublicationEntries(directory) {
  const visible = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.includes('.analysis-publication.lock.completed.')) {
      assert.equal(entry.isDirectory(), true);
      assert.equal((await readdir(path.join(directory, entry.name))).length > 0, true);
    } else {
      visible.push(entry.name);
    }
  }
  return visible.sort();
}

async function stopNewPublicationAfterRecovery(target, analysis) {
  const writeGeneration = await writer();
  await assert.rejects(
    writeGeneration(target, analysis, {
      async openFile(targetPath, flags) {
        if (targetPath.endsWith('.tmp') && flags === 'wx') {
          throw new Error('injected stop after recovery');
        }
        const { open } = await import('node:fs/promises');
        return open(targetPath, flags);
      },
      async linkFile(source, destination) {
        if (destination.endsWith('.tmp')) {
          throw new Error('injected stop after recovery');
        }
        const { link } = await import('node:fs/promises');
        return link(source, destination);
      },
    }),
    /stop after recovery/iu,
  );
}

test('analysis generation shares one digest and publishes JSON as the final commit marker', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-publish-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const destinations = [];
  const writeGeneration = await writer();
  await writeGeneration(target, analyzeEvaluation(plan, []), {
    async renameFile(source, destination) {
      await rename(source, destination);
    },
    async linkFile(source, destination) {
      if (destination === path.join(directory, 'benchmark.md') || destination === target) {
        destinations.push(path.basename(destination));
      }
      await link(source, destination);
    },
  });

  const document = JSON.parse(await readFile(target, 'utf8'));
  const markdown = await readFile(path.join(directory, 'benchmark.md'), 'utf8');
  assert.match(document.analysis_digest, /^[0-9a-f]{64}$/u);
  assert.match(markdown, new RegExp(`Analysis digest: ${document.analysis_digest}`, 'u'));
  assert.deepEqual(
    destinations.filter((destination) => ['benchmark.md', 'benchmark.json'].includes(destination)),
    ['benchmark.md', 'benchmark.json'],
  );
  assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
});

test('analysis generation rejects pre-existing JSON or Markdown symlink targets', async (t) => {
  const writeGeneration = await writer();
  for (const linkedName of ['benchmark.json', 'benchmark.md']) {
    const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-link-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const outside = path.join(directory, 'outside.txt');
    await writeFile(outside, 'outside-bytes', 'utf8');
    try {
      await symlink(outside, path.join(directory, linkedName), 'file');
    } catch (error) {
      if (error.code === 'EPERM') {
        t.skip('当前 Windows 配置不允许创建测试符号链接');
        return;
      }
      throw error;
    }

    await assert.rejects(
      writeGeneration(
        path.join(directory, 'benchmark.json'),
        analyzeEvaluation(plan, []),
      ),
      /symbolic|reparse|regular/iu,
    );
    assert.equal(await readFile(outside, 'utf8'), 'outside-bytes');
  }
});

test('analysis generation rejects a target replaced by a symlink before rollback detachment', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-swap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const markdown = path.join(directory, 'benchmark.md');
  const displaced = path.join(directory, 'displaced.md');
  const outside = path.join(directory, 'outside.txt');
  await writeFile(target, 'old-json', 'utf8');
  await writeFile(markdown, 'old-markdown', 'utf8');
  await writeFile(outside, 'outside-bytes', 'utf8');
  const writeGeneration = await writer();
  let swapped = false;

  await assert.rejects(
    writeGeneration(target, analyzeEvaluation(plan, []), {
      async renameFile(source, destination) {
        if (!swapped && source === markdown) {
          swapped = true;
          await rename(markdown, displaced);
          try {
            await symlink(outside, markdown, 'file');
          } catch (error) {
            if (error.code === 'EPERM') {
              t.skip('当前 Windows 配置不允许创建测试符号链接');
              await rename(displaced, markdown);
              return rename(source, destination);
            }
            throw error;
          }
        }
        return rename(source, destination);
      },
    }),
    /changed|symbolic|reparse|regular/iu,
  );
  assert.equal(swapped, true);
  assert.equal(await readFile(outside, 'utf8'), 'outside-bytes');
});

test('analysis generation snapshots both renderings before its first publication await', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-snapshot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const analysis = analyzeEvaluation(plan, []);
  const writeGeneration = await writer();
  let mutated = false;

  await writeGeneration(target, analysis, {
    async openFile(targetPath, flags) {
      if (!mutated) {
        mutated = true;
        analysis.req003.speedup_percent = 'caller-mutated';
      }
      const { open } = await import('node:fs/promises');
      return open(targetPath, flags);
    },
  });

  const document = JSON.parse(await readFile(target, 'utf8'));
  const markdown = await readFile(path.join(directory, 'benchmark.md'), 'utf8');
  assert.equal(document.req003.speedup_percent, null);
  assert.match(markdown, /REQ-003 median speedup: not computed%/u);
  assert.doesNotMatch(markdown, /caller-mutated/u);
});

test('analysis generation cleans a lock whose initialization fails after acquisition', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-lock-init-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const writeGeneration = await writer();

  await assert.rejects(
    writeGeneration(target, analyzeEvaluation(plan, []), {
      async lstatFile(targetPath) {
        if (targetPath.endsWith('.analysis-publication.lock')) {
          throw new Error('injected lock stat failure');
        }
        const { lstat } = await import('node:fs/promises');
        return lstat(targetPath);
      },
    }),
    /lock stat failure/iu,
  );
  assert.deepEqual(await readdir(directory), []);
});

test('analysis generation never deletes an owner file it failed to create exclusively', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-lock-owner-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const foreignBytes = 'foreign-owner-bytes';
  let foreignOwnerPath;
  const writeGeneration = await writer();

  await assert.rejects(
    writeGeneration(target, analyzeEvaluation(plan, []), {
      async openFile(targetPath, flags) {
        const { open } = await import('node:fs/promises');
        if (targetPath.endsWith(`${path.sep}owner.json`)) {
          foreignOwnerPath = targetPath;
          await writeFile(targetPath, foreignBytes, 'utf8');
        }
        return open(targetPath, flags);
      },
    }),
    /lock|exist|cleanup/iu,
  );
  assert.equal(await readFile(foreignOwnerPath, 'utf8'), foreignBytes);
});

test('analysis generation recovers an inactive stale shared-stem lock', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-stale-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  await mkdir(lock);
  await writeFile(path.join(lock, 'owner.json'), `${JSON.stringify({
    pid: 2_147_483_647,
    protocol: 'analysis-publication-lock-v1',
    token: 'test',
  })}\n`, 'utf8');
  const writeGeneration = await writer();

  await writeGeneration(target, analyzeEvaluation(plan, []));
  assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
});

test('manifest commit precedes every external temporary across real preparation crashes', async (t) => {
  for (const stage of ['external-1', 'external-2', 'manifest-prepare', 'manifest-commit']) {
    await t.test(stage, async (subtest) => {
      const directory = await mkdtemp(path.join(tmpdir(), `accelerator-analysis-prepare-${stage}-`));
      subtest.after(() => rm(directory, { recursive: true, force: true }));
      const target = path.join(directory, 'benchmark.json');
      const writeGeneration = await writer();
      await writeGeneration(target, interruptedAnalysis(`previous-${stage}`));
      await interruptAtPreparationStage(
        target,
        interruptedAnalysis(`interrupted-${stage}`),
        stage,
        directory,
      );

      await writeGeneration(target, interruptedAnalysis(`recovered-${stage}`));
      const document = JSON.parse(await readFile(target, 'utf8'));
      assert.deepEqual(document.valid_runs, [`recovered-${stage}`]);
      assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
    });
  }
});

test('stale publication recovery never follows a linked owner file', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-stale-owner-link-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const outside = path.join(directory, 'outside-owner.json');
  const outsideBytes = `${JSON.stringify({
    pid: 2_147_483_647,
    protocol: 'analysis-publication-lock-v1',
    token: 'linked-owner',
  })}\n`;
  await mkdir(lock);
  await writeFile(outside, outsideBytes, 'utf8');
  try {
    await symlink(outside, path.join(lock, 'owner.json'), 'file');
  } catch (error) {
    if (error.code === 'EPERM') {
      t.skip('当前 Windows 配置不允许创建测试符号链接');
      return;
    }
    throw error;
  }

  const writeGeneration = await writer();
  await assert.rejects(
    writeGeneration(target, analyzeEvaluation(plan, [])),
    /symbolic|reparse|regular/iu,
  );
  assert.equal(await readFile(outside, 'utf8'), outsideBytes);
});

test('analysis generation admits only one concurrent publisher for an output pair', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-concurrent-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const writeGeneration = await writer();
  let releaseFirstRename;
  const release = new Promise((resolve) => { releaseFirstRename = resolve; });
  let firstRenameReached;
  const reached = new Promise((resolve) => { firstRenameReached = resolve; });
  let renameCalls = 0;
  const first = writeGeneration(target, analyzeEvaluation(plan, []), {
    async renameFile(source, destination) {
      renameCalls += 1;
      if (renameCalls === 1) {
        firstRenameReached();
        await release;
      }
      await rename(source, destination);
    },
  });
  await reached;

  await assert.rejects(
    writeGeneration(path.join(directory, 'benchmark.JSON'), analyzeEvaluation(plan, [])),
    /publication.*progress|concurrent/iu,
  );
  releaseFirstRename();
  await first;

  const document = JSON.parse(await readFile(target, 'utf8'));
  const markdown = await readFile(path.join(directory, 'benchmark.md'), 'utf8');
  assert.match(markdown, new RegExp(`Analysis digest: ${document.analysis_digest}`, 'u'));
  assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
});

test('stale recovery keeps the canonical lock while excluding a concurrent publisher', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-recovery-mutex-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-mutex'));
  await interruptAfterRename(target, interruptedAnalysis('interrupted-mutex'), 1, directory);

  let releaseRecovery;
  const release = new Promise((resolve) => { releaseRecovery = resolve; });
  let recoveryReached;
  const reached = new Promise((resolve) => { recoveryReached = resolve; });
  let paused = false;
  const first = writeGeneration(target, interruptedAnalysis('recovered-mutex'), {
    async renameFile(source, destination) {
      await rename(source, destination);
      if (!paused && (source === lock
        || (source.startsWith(`${lock}${path.sep}`) && destination.startsWith(`${lock}${path.sep}`)))) {
        paused = true;
        recoveryReached();
        await release;
      }
    },
  });
  await reached;
  let assertionFailure;
  try {
    const lockStats = await (await import('node:fs/promises')).lstat(lock);
    assert.equal(lockStats.isDirectory(), true);
    await assert.rejects(
      writeGeneration(target, interruptedAnalysis('concurrent-must-not-publish')),
      /publication.*progress|concurrent|recovery/iu,
    );
  } catch (error) {
    assertionFailure = error;
  } finally {
    releaseRecovery();
  }
  await first.catch(() => {});
  if (assertionFailure !== undefined) throw assertionFailure;
});

test('recovery interruption restarts in place without orphan stale directories', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-recovery-restart-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-restart'));
  await interruptAfterRename(target, interruptedAnalysis('interrupted-restart'), 1, directory);
  await interruptDuringRecovery(target, interruptedAnalysis('recovery-crashed'), directory);

  await writeGeneration(target, interruptedAnalysis('recovery-restarted'));
  const document = JSON.parse(await readFile(target, 'utf8'));
  assert.deepEqual(document.valid_runs, ['recovery-restarted']);
  assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
});

test('recovery restarts after quarantining an orphan recovery claim', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-orphan-held-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const previous = 'previous-orphan-held';
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis(previous));
  await interruptAfterRename(target, interruptedAnalysis('interrupted-orphan-held'), 2, directory);
  const orphanPid = 2_147_483_646;
  const orphanToken = 'orphan-held';
  await writeFile(
    path.join(lock, `recovery.${orphanPid}.${orphanToken}.claim`),
    `${JSON.stringify({
      pid: orphanPid,
      protocol: 'analysis-publication-recovery-v1',
      token: orphanToken,
    })}\n`,
    'utf8',
  );

  await interruptRecoveryTransition(
    target,
    interruptedAnalysis('first-recovery-orphan-held'),
    'orphan-held',
    directory,
  );
  await assertSecondAndThirdRecoveryConverge(target, previous, 'third-recovery-orphan-held');
});

test('recovery restarts after the previous JSON has already been restored', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-json-restored-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const previous = 'previous-json-restored';
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis(previous));
  await interruptAfterRename(target, interruptedAnalysis('interrupted-json-restored'), 2, directory);

  await interruptRecoveryTransition(
    target,
    interruptedAnalysis('first-recovery-json-restored'),
    'json-restored',
    directory,
  );
  await assertSecondAndThirdRecoveryConverge(target, previous, 'third-recovery-json-restored');
});

test('recovery restarts after a committed JSON marker has already been restored', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-committed-restored-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const committed = 'committed-json-restored';
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-committed-restored'));
  await interruptAfterRename(target, interruptedAnalysis(committed), 3, directory);

  await interruptRecoveryTransition(
    target,
    interruptedAnalysis('first-recovery-committed-restored'),
    'committed-json-restored',
    directory,
  );
  await assertSecondAndThirdRecoveryConverge(
    target,
    committed,
    'third-recovery-committed-restored',
  );
});

test('recovery keeps an ownership record across the old-owner handoff', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-owner-handoff-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const previous = 'previous-owner-handoff';
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis(previous));
  await interruptAfterRename(target, interruptedAnalysis('interrupted-owner-handoff'), 2, directory);

  await interruptRecoveryTransition(
    target,
    interruptedAnalysis('first-recovery-owner-handoff'),
    'owner-handoff',
    directory,
  );
  await assertSecondAndThirdRecoveryConverge(target, previous, 'third-recovery-owner-handoff');
});

test('recovery quarantines held owner evidence before opening it', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-held-open-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const ownerHeld = path.join(lock, 'owner.held');
  const displaced = path.join(lock, 'owner-before-open.displaced');
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-held-open'));
  await interruptAfterRename(target, interruptedAnalysis('interrupted-held-open'), 2, directory);
  let ownerObserved = false;
  let foreignOpened = false;

  await writeGeneration(target, interruptedAnalysis('recovered-held-open'), {
    async lstatFile(targetPath) {
      const stats = await lstat(targetPath);
      if (targetPath === ownerHeld) ownerObserved = true;
      return stats;
    },
    async openFile(targetPath, flags) {
      if (ownerObserved && !foreignOpened && targetPath === ownerHeld) {
        await rename(ownerHeld, displaced);
        await writeFile(ownerHeld, 'foreign-owner-before-open', 'utf8');
        foreignOpened = true;
      }
      return open(targetPath, flags);
    },
  });

  assert.equal(ownerObserved, true);
  assert.equal(foreignOpened, false);
  const document = JSON.parse(await readFile(target, 'utf8'));
  assert.deepEqual(document.valid_runs, ['recovered-held-open']);
});

test('successful publication quarantines and retains Markdown rollback instead of unlinking it', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-rollback-unlink-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const rollback = path.join(lock, 'markdown.rollback');
  const displaced = path.join(lock, 'markdown-rollback-before-unlink.displaced');
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-rollback-unlink'));
  let rollbackObserved = false;
  let foreignDeleted = false;

  await writeGeneration(target, interruptedAnalysis('published-rollback-unlink'), {
    async lstatFile(targetPath) {
      const stats = await lstat(targetPath);
      if (targetPath === rollback) rollbackObserved = true;
      return stats;
    },
    async unlinkFile(targetPath) {
      if (rollbackObserved && !foreignDeleted && targetPath === rollback) {
        await rename(rollback, displaced);
        await writeFile(rollback, 'foreign-rollback-before-unlink', 'utf8');
        foreignDeleted = true;
      }
      return unlink(targetPath);
    },
  });

  assert.equal(rollbackObserved, true);
  assert.equal(foreignDeleted, false);
  assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
});

test('rollback restore fails closed when its destination becomes occupied', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-restore-occupied-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const foreignBytes = 'foreign-json-during-restore';
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-restore-occupied'));
  await interruptAfterRename(target, interruptedAnalysis('interrupted-restore-occupied'), 2, directory);
  let occupied = false;
  const isJsonRestore = (source, destination) => (
    destination === target && path.basename(source).startsWith('json.original')
  );

  await assert.rejects(
    writeGeneration(target, interruptedAnalysis('must-not-overwrite-occupied'), {
      async renameFile(source, destination) {
        if (!occupied && isJsonRestore(source, destination)) {
          occupied = true;
          await writeFile(destination, foreignBytes, 'utf8');
          // 模拟 POSIX rename 的原子替换语义，确保测试在 Windows 上也覆盖同一风险。
          await unlink(destination);
        }
        return rename(source, destination);
      },
      async linkFile(source, destination) {
        if (!occupied && isJsonRestore(source, destination)) {
          occupied = true;
          await writeFile(destination, foreignBytes, 'utf8');
        }
        return link(source, destination);
      },
    }),
    /occupied|overwrite|exist|foreign|recovery/iu,
  );
  assert.equal(occupied, true);
  assert.equal(await readFile(target, 'utf8'), foreignBytes);
});

test('unsupported Windows directory sync is recorded as best-effort process recovery', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-sync-truth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  await interruptAfterUnsupportedDirectorySync(
    target,
    interruptedAnalysis('interrupted-sync-truth'),
    directory,
  );

  const manifest = JSON.parse(await readFile(path.join(lock, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.durability, {
    directory_sync: 'unsupported',
    power_loss_durability: 'unsupported-best-effort',
    recovery_guarantee: 'process-interruption',
  });

  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('recovered-sync-truth'));
  const document = JSON.parse(await readFile(target, 'utf8'));
  assert.deepEqual(document.valid_runs, ['recovered-sync-truth']);
  assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
});

test('recovery accepts a pre-durability manifest from the same generation protocol', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-legacy-manifest-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const manifestPath = path.join(directory, '.benchmark.analysis-publication.lock', 'manifest.json');
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-legacy-manifest'));
  await interruptAfterRename(target, interruptedAnalysis('interrupted-legacy-manifest'), 2, directory);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.durability;
  manifest.schema_version = 1;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');

  await writeGeneration(target, interruptedAnalysis('recovered-legacy-manifest'));
  const document = JSON.parse(await readFile(target, 'utf8'));
  assert.deepEqual(document.valid_runs, ['recovered-legacy-manifest']);
  assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
});

test('cleanup quarantines a swapped external temporary without deleting the foreign inode', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-cleanup-swap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const markdown = path.join(directory, 'benchmark.md');
  const displaced = path.join(directory, 'owned-temp-displaced');
  const foreignBytes = 'foreign-temp-bytes';
  const writeGeneration = await writer();
  let publicationFailed = false;
  let swapped = false;
  const isJsonTemporary = (targetPath) => (
    path.dirname(targetPath) === directory
    && path.basename(targetPath).startsWith('.benchmark.json.')
    && targetPath.endsWith('.tmp')
  );
  async function swapTemporary(targetPath) {
    await rename(targetPath, displaced);
    await writeFile(targetPath, foreignBytes, 'utf8');
    swapped = true;
  }

  await assert.rejects(
    writeGeneration(target, analyzeEvaluation(plan, []), {
      async linkFile(source, destination) {
        if (!publicationFailed && destination === markdown && source.endsWith('.tmp')) {
          publicationFailed = true;
          throw new Error('injected publication failure before cleanup');
        }
        return link(source, destination);
      },
      async renameFile(source, destination) {
        if (publicationFailed && !swapped && isJsonTemporary(source)) {
          await swapTemporary(source);
        }
        return rename(source, destination);
      },
      async lstatFile(targetPath) {
        const { lstat } = await import('node:fs/promises');
        const stats = await lstat(targetPath);
        if (publicationFailed && !swapped && isJsonTemporary(targetPath)) {
          await swapTemporary(targetPath);
        }
        return stats;
      },
    }),
    /publication failure|foreign identity|cleanup|rollback/iu,
  );
  assert.equal(swapped, true);
  assert.notEqual(await findFileWithBytes(directory, foreignBytes), null);
});

test('final JSON publication quarantines a newly occupied destination instead of overwriting it', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-json-swap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const foreignBytes = 'foreign-json-destination';
  const writeGeneration = await writer();
  let occupied = false;

  await assert.rejects(
    writeGeneration(target, analyzeEvaluation(plan, []), {
      async linkFile(source, destination) {
        if (!occupied && destination === target && source.endsWith('.tmp')) {
          occupied = true;
          await writeFile(target, foreignBytes, 'utf8');
        }
        return link(source, destination);
      },
    }),
    /changed|foreign|occupied|overwrite/iu,
  );
  assert.equal(occupied, true);
  assert.notEqual(await findFileWithBytes(directory, foreignBytes), null);
});

test('analysis generation preserves old outputs and cleans owned temps on first publish failure', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-first-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const markdown = path.join(directory, 'benchmark.md');
  await writeFile(target, 'old-json', 'utf8');
  await writeFile(markdown, 'old-markdown', 'utf8');
  const writeGeneration = await writer();

  await assert.rejects(
    writeGeneration(target, analyzeEvaluation(plan, []), {
      async renameFile(source, destination) {
        if (source === markdown) throw new Error('injected first publish failure');
        return rename(source, destination);
      },
    }),
    /first publish failure/iu,
  );

  assert.equal(await readFile(target, 'utf8'), 'old-json');
  assert.equal(await readFile(markdown, 'utf8'), 'old-markdown');
  assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
});

test('analysis generation rolls Markdown back when final JSON publication fails', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-second-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const markdown = path.join(directory, 'benchmark.md');
  await writeFile(target, 'old-json', 'utf8');
  await writeFile(markdown, 'old-markdown', 'utf8');
  const writeGeneration = await writer();
  let publicationSteps = 0;

  await assert.rejects(
    writeGeneration(target, analyzeEvaluation(plan, []), {
      async renameFile(source, destination) {
        if (source === markdown && destination.endsWith('markdown.rollback')) {
          publicationSteps += 1;
        }
        await rename(source, destination);
      },
      async linkFile(source, destination) {
        if (destination === markdown || destination === target) {
          publicationSteps += 1;
        }
        if (publicationSteps === 3 && destination === target) {
          throw new Error('injected final marker failure');
        }
        await link(source, destination);
      },
    }),
    /final marker failure/iu,
  );

  assert.equal(await readFile(target, 'utf8'), 'old-json');
  assert.equal(await readFile(markdown, 'utf8'), 'old-markdown');
  assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
});

test('analysis generation recovers each real process-interruption publication state', async (t) => {
  const writeGeneration = await writer();
  for (const renameNumber of [1, 2, 3]) {
    const directory = await mkdtemp(path.join(tmpdir(), `accelerator-analysis-interrupt-${renameNumber}-`));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const target = path.join(directory, 'benchmark.json');
    const markdown = path.join(directory, 'benchmark.md');
    const previous = interruptedAnalysis(`previous-${renameNumber}`);
    const interrupted = interruptedAnalysis(`interrupted-${renameNumber}`);
    await writeGeneration(target, previous);
    await interruptAfterRename(target, interrupted, renameNumber, directory);

    await stopNewPublicationAfterRecovery(target, interruptedAnalysis(`recovery-${renameNumber}`));
    const document = JSON.parse(await readFile(target, 'utf8'));
    const rendered = await readFile(markdown, 'utf8');
    const retained = renameNumber === 3 ? `interrupted-${renameNumber}` : `previous-${renameNumber}`;
    assert.deepEqual(document.valid_runs, [retained]);
    assert.match(rendered, new RegExp(`- ${retained}`, 'u'));
    assert.match(rendered, new RegExp(`Analysis digest: ${document.analysis_digest}`, 'u'));
    assert.deepEqual(await visiblePublicationEntries(directory), ['benchmark.json', 'benchmark.md']);
  }
});

test('stale publication recovery fails closed on foreign lock entries', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-interrupt-foreign-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-foreign'));
  await interruptAfterRename(target, interruptedAnalysis('interrupted-foreign'), 1, directory);
  await writeFile(path.join(lock, 'foreign.txt'), 'foreign-bytes', 'utf8');

  await assert.rejects(
    writeGeneration(target, interruptedAnalysis('must-not-publish')),
    /unexpected recovery evidence/iu,
  );
  assert.equal(await readFile(path.join(lock, 'foreign.txt'), 'utf8'), 'foreign-bytes');
});

test('analysis generation never unlinks rollback evidence or rolls behind a committed JSON marker', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-committed-cleanup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const markdown = path.join(directory, 'benchmark.md');
  await writeFile(target, 'old-json', 'utf8');
  await writeFile(markdown, 'old-markdown', 'utf8');
  const writeGeneration = await writer();
  let rollbackUnlinked = false;

  await writeGeneration(target, analyzeEvaluation(plan, []), {
    async unlinkFile(targetPath) {
      if (path.basename(targetPath).startsWith('markdown.rollback')) {
        rollbackUnlinked = true;
      }
      return unlink(targetPath);
    },
  });

  const document = JSON.parse(await readFile(target, 'utf8'));
  const rendered = await readFile(markdown, 'utf8');
  assert.equal(rollbackUnlinked, false);
  assert.match(rendered, new RegExp(`Analysis digest: ${document.analysis_digest}`, 'u'));
});

test('repeated recovery-claim interruption retains ownership evidence and the third run converges', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-repeated-claim-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-repeated-claim'));
  await interruptAfterRename(
    target,
    interruptedAnalysis('interrupted-repeated-claim'),
    2,
    directory,
  );
  await interruptRecoveryTransition(
    target,
    interruptedAnalysis('first-recovery-repeated-claim'),
    'owner-handoff',
    directory,
  );
  await interruptRecoveryClaimReplacement(
    target,
    interruptedAnalysis('second-recovery-repeated-claim'),
    directory,
  );

  const ownershipEntries = await readdir(lock);
  assert.equal(
    ownershipEntries.some((entry) => /^(?:owner|recovery)(?:\.|\.json$)/u.test(entry)),
    true,
  );
  await writeGeneration(target, interruptedAnalysis('third-recovery-repeated-claim'));
  const document = JSON.parse(await readFile(target, 'utf8'));
  assert.deepEqual(document.valid_runs, ['third-recovery-repeated-claim']);
});

test('release atomically tombstones the owned canonical lock before interruptible cleanup', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-release-tombstone-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  await interruptDuringRelease(target, interruptedAnalysis('release-interrupted'), directory);

  await assert.rejects(lstat(lock), { code: 'ENOENT' });
  assert.equal(
    (await readdir(directory)).some((entry) => entry.startsWith(
      '.benchmark.analysis-publication.lock.completed.',
    )),
    true,
  );
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('release-third-run'));
  const document = JSON.parse(await readFile(target, 'utf8'));
  assert.deepEqual(document.valid_runs, ['release-third-run']);
  await assert.rejects(lstat(lock), { code: 'ENOENT' });
});

test('ownerless recovery rejects and preserves an arbitrary-byte hard-linked pair', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-recovery-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const unique = path.join(lock, 'recovery.2147483646.arbitrary.claim');
  const marker = path.join(lock, 'recovery.json');
  const bytes = 'arbitrary-recovery-bytes';
  await mkdir(lock);
  await writeFile(unique, bytes, 'utf8');
  await link(unique, marker);
  const writeGeneration = await writer();

  await assert.rejects(
    writeGeneration(target, interruptedAnalysis('must-not-adopt-arbitrary-recovery')),
    /recovery|claim|malformed|owner/iu,
  );
  assert.equal(await readFile(unique, 'utf8'), bytes);
  assert.equal(await readFile(marker, 'utf8'), bytes);
});

test('quarantine ENOENT replacement is isolated without opening, linking, or deleting it', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-quarantine-enoent-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const manifestHeld = path.join(lock, 'manifest.held');
  const displaced = path.join(lock, 'manifest-held-before-enoent.displaced');
  const foreignBytes = 'foreign-manifest-after-enoent';
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-quarantine-enoent'));
  await interruptAfterRename(
    target,
    interruptedAnalysis('interrupted-quarantine-enoent'),
    2,
    directory,
  );
  let injected = false;
  let openedReplacement = false;
  let linkedReplacement = false;
  let deletedReplacement = false;

  await assert.rejects(
    writeGeneration(target, interruptedAnalysis('must-not-use-enoent-replacement'), {
      async renameFile(source, destination) {
        if (!injected && source === manifestHeld && destination.includes('.quarantine.')) {
          injected = true;
          await rename(source, displaced);
          await writeFile(source, foreignBytes, 'utf8');
          const error = new Error('injected quarantine ENOENT replacement');
          error.code = 'ENOENT';
          throw error;
        }
        return rename(source, destination);
      },
      async openFile(targetPath, flags) {
        if (injected && path.basename(targetPath).startsWith('manifest.held')) {
          openedReplacement = true;
        }
        return open(targetPath, flags);
      },
      async linkFile(source, destination) {
        if (injected && path.basename(source).startsWith('manifest.held')) {
          linkedReplacement = true;
        }
        return link(source, destination);
      },
      async unlinkFile(targetPath) {
        if (injected && path.basename(targetPath).startsWith('manifest.held')) {
          deletedReplacement = true;
        }
        return unlink(targetPath);
      },
    }),
    /changed|foreign|recovery|enoent|identity|malformed|manifest/iu,
  );
  assert.equal(injected, true);
  assert.equal(openedReplacement, false);
  assert.equal(linkedReplacement, false);
  assert.equal(deletedReplacement, false);
  assert.notEqual(await findFileWithBytes(directory, foreignBytes), null);
});

test('restore-source replacement after quarantine is never opened, linked, or deleted', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-restore-source-swap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const lock = path.join(directory, '.benchmark.analysis-publication.lock');
  const writeGeneration = await writer();
  await writeGeneration(target, interruptedAnalysis('previous-restore-source-swap'));
  await interruptAfterRename(
    target,
    interruptedAnalysis('interrupted-restore-source-swap'),
    2,
    directory,
  );
  const displaced = path.join(lock, 'json-original-before-link.displaced');
  const foreignBytes = 'foreign-json-restore-source';
  let replacementPath;
  let linkedReplacement = false;
  let openedReplacement = false;
  let deletedReplacement = false;

  await assert.rejects(
    writeGeneration(target, interruptedAnalysis('must-not-link-restore-source-swap'), {
      async renameFile(source, destination) {
        if (replacementPath === undefined
          && source === path.join(lock, 'json.original')
          && destination.includes('.quarantine.')) {
          await rename(source, destination);
          await rename(destination, displaced);
          await writeFile(destination, foreignBytes, 'utf8');
          replacementPath = destination;
          return;
        }
        return rename(source, destination);
      },
      async openFile(targetPath, flags) {
        if (replacementPath !== undefined && targetPath === replacementPath) {
          openedReplacement = true;
        }
        return open(targetPath, flags);
      },
      async linkFile(source, destination) {
        if (replacementPath !== undefined && source === replacementPath) {
          linkedReplacement = true;
        }
        return link(source, destination);
      },
      async unlinkFile(targetPath) {
        if (replacementPath !== undefined && targetPath === replacementPath) {
          deletedReplacement = true;
        }
        return unlink(targetPath);
      },
    }),
    /changed|foreign|recovery|identity/iu,
  );
  assert.notEqual(replacementPath, undefined);
  assert.equal(openedReplacement, false);
  assert.equal(linkedReplacement, false);
  assert.equal(deletedReplacement, false);
  assert.notEqual(await findFileWithBytes(directory, foreignBytes), null);
});

test('payload sync failure preserves a replacement at the created name', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-payload-sync-swap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const foreignBytes = 'foreign-json-payload-after-sync';
  const displaced = path.join(directory, 'owned-json-payload.displaced');
  const writeGeneration = await writer();
  let injected = false;

  await assert.rejects(
    writeGeneration(target, interruptedAnalysis('payload-sync-swap'), {
      async openFile(targetPath, flags) {
        const handle = await open(targetPath, flags);
        if (path.basename(targetPath) !== 'json.payload') return handle;
        return {
          close: (...args) => handle.close(...args),
          stat: (...args) => handle.stat(...args),
          writeFile: (...args) => handle.writeFile(...args),
          async sync() {
            await handle.sync();
            await rename(targetPath, displaced);
            await writeFile(targetPath, foreignBytes, 'utf8');
            injected = true;
            throw new Error('injected payload sync failure');
          },
        };
      },
    }),
    /payload sync failure|cleanup|rollback/iu,
  );
  assert.equal(injected, true);
  assert.notEqual(await findFileWithBytes(directory, foreignBytes), null);
});

test('recovery claim-link failure preserves a replacement at the unique claim name', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-claim-link-swap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  await createStaleOwnerLock(directory, 'claim-link-swap');
  const displaced = path.join(directory, 'owned-recovery-claim.displaced');
  const foreignBytes = 'foreign-recovery-claim-after-link';
  const writeGeneration = await writer();
  let injected = false;

  await assert.rejects(
    writeGeneration(target, interruptedAnalysis('claim-link-swap'), {
      async linkFile(source, destination) {
        if (!injected && path.basename(destination) === 'recovery.json') {
          await rename(source, displaced);
          await writeFile(source, foreignBytes, 'utf8');
          injected = true;
          throw new Error('injected recovery claim-link failure');
        }
        return link(source, destination);
      },
    }),
    /claim-link failure|recovery|cleanup/iu,
  );
  assert.equal(injected, true);
  assert.notEqual(await findFileWithBytes(directory, foreignBytes), null);
});

test('owner-install failure preserves a replacement at the owner name', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-owner-install-swap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'benchmark.json');
  const displaced = path.join(directory, 'owned-owner-record.displaced');
  const foreignBytes = 'foreign-owner-after-install';
  const writeGeneration = await writer();
  let injected = false;

  await assert.rejects(
    writeGeneration(target, interruptedAnalysis('owner-install-swap'), {
      async linkFile(source, destination) {
        if (!injected
          && path.basename(source) === 'owner.json'
          && /^owner\.[1-9][0-9]*\.[A-Za-z0-9_-]+\.claim$/u.test(path.basename(destination))) {
          await rename(source, displaced);
          await writeFile(source, foreignBytes, 'utf8');
          injected = true;
          throw new Error('injected owner-install failure');
        }
        return link(source, destination);
      },
    }),
    /owner-install failure|initialization|cleanup/iu,
  );
  assert.equal(injected, true);
  assert.notEqual(await findFileWithBytes(directory, foreignBytes), null);
});
