#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { constants as fileConstants } from 'node:fs';
import { link, lstat, mkdir, open, readFile, readdir, rename, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

import { createEvaluationRecorder } from '../src/evaluation-controller.js';
import { analyzeEvaluation } from '../src/evaluation-analysis.js';
import { writeOutput } from '../src/output.js';

const TRACE_NAME = 'controller-trace.json';
const ANALYSIS_LOCK_PROTOCOL = 'analysis-publication-lock-v1';
const ANALYSIS_MANIFEST_PROTOCOL = 'analysis-publication-generation-v1';
const ANALYSIS_RECOVERY_PROTOCOL = 'analysis-publication-recovery-v1';
const ANALYSIS_RECOVERY_SCHEMA_VERSION = 2;
const DECIMAL_IDENTITY = /^(0|[1-9][0-9]*)$/u;
const QUARANTINE_SUFFIX = /\.quarantine\.[A-Za-z0-9_-]{1,128}$/u;
const RECOVERY_GENERATION = /^[A-Za-z0-9_.-]{1,384}$/u;
let temporarySequence = 0;

function parseRecordArgs(argv) {
  if (argv[0] !== 'record') {
    throw new TypeError('Usage: evaluate-accelerator record --plan <path> --output-dir <absolute-path>');
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!['--plan', '--output-dir'].includes(option) || value === undefined) {
      throw new TypeError(`Unknown or incomplete option: ${option ?? '(missing)'}`);
    }
    if (values.has(option)) {
      throw new TypeError(`Duplicate option: ${option}`);
    }
    values.set(option, value);
  }
  if (!values.has('--plan') || !values.has('--output-dir')) {
    throw new TypeError('Both --plan and --output-dir are required.');
  }
  const outputDir = values.get('--output-dir');
  if (!path.isAbsolute(outputDir) || path.resolve(outputDir) !== outputDir) {
    throw new TypeError('--output-dir must be an already resolved absolute path.');
  }
  return { planPath: values.get('--plan'), outputDir };
}

function parseAnalyzeArgs(argv) {
  if (argv[0] !== 'analyze') {
    throw new TypeError(
      'Usage: evaluate-accelerator analyze --plan <path> --traces <absolute-path> --output <absolute-path>',
    );
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!['--plan', '--traces', '--output'].includes(option) || value === undefined) {
      throw new TypeError(`Unknown or incomplete option: ${option ?? '(missing)'}`);
    }
    if (values.has(option)) {
      throw new TypeError(`Duplicate option: ${option}`);
    }
    values.set(option, value);
  }
  for (const option of ['--plan', '--traces', '--output']) {
    if (!values.has(option)) {
      throw new TypeError(`${option} is required.`);
    }
  }
  const tracesRoot = values.get('--traces');
  const outputPath = values.get('--output');
  for (const [option, value] of [['--traces', tracesRoot], ['--output', outputPath]]) {
    if (!path.isAbsolute(value) || path.resolve(value) !== value) {
      throw new TypeError(`${option} must be an already resolved absolute path.`);
    }
  }
  if (path.extname(outputPath).toLowerCase() !== '.json') {
    throw new TypeError('--output must identify a JSON file.');
  }
  return {
    planPath: values.get('--plan'),
    tracesRoot,
    outputPath,
  };
}

async function assertDirectory(directory) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new TypeError('--output-dir must identify an existing regular directory.');
  }
}

async function collectTracePaths(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new TypeError('Trace roots cannot contain symbolic links.');
    }
    if (entry.isDirectory()) {
      paths.push(...await collectTracePaths(target));
    } else if (entry.isFile() && entry.name === TRACE_NAME) {
      paths.push(target);
    }
  }
  return paths;
}

function renderAnalysisMarkdown(analysis) {
  const validRuns = analysis.valid_runs.length === 0
    ? '- (none)'
    : analysis.valid_runs.map((runId) => `- ${runId}`).join('\n');
  const issues = analysis.issues.length === 0
    ? '- (none)'
    : analysis.issues.map(({ code, scenario_id: scenarioId, run_id: runId }) => (
      `- ${code}${scenarioId === undefined ? '' : ` (${scenarioId}${runId === undefined ? '' : `, ${runId}`})`}`
    )).join('\n');
  return `# Evaluation Benchmark

Maturity pass: ${analysis.maturity_pass ? 'yes' : 'no'}

Analysis digest: ${analysis.analysis_digest}

## Metrics

- REQ-002 pass: ${analysis.req002.pass ? 'yes' : 'no'}
- REQ-003 pass: ${analysis.req003.pass ? 'yes' : 'no'}
- EVAL-008 pass: ${analysis.eval008.pass ? 'yes' : 'no'}
- REQ-003 median speedup: ${analysis.req003.speedup_percent ?? 'not computed'}%

## Valid runs

${validRuns}

## Issues

${issues}
`;
}

async function inspectRegularTarget(target, context) {
  try {
    const stats = await context.lstatFile(target);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new TypeError('Analysis output targets must be regular files, never symbolic links or reparse points.');
    }
    return { exists: true, dev: stats.dev, ino: stats.ino };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { exists: false, dev: null, ino: null };
    }
    throw error;
  }
}

function serializeIdentity(source) {
  return {
    dev: String(source.dev),
    ino: String(source.ino),
  };
}

function identityMatches(source, expected) {
  return source.exists === true
    && String(source.dev) === String(expected.dev)
    && String(source.ino) === String(expected.ino);
}

function logicalEntryName(entry) {
  return entry.replace(QUARANTINE_SUFFIX, '');
}

async function resolveIsolatedCapability(target, context) {
  if (QUARANTINE_SUFFIX.test(path.basename(target))) {
    return await isolatedEntryExistsLiteral(target, context) ? target : null;
  }
  const targetName = path.basename(target);
  const candidates = (await context.readDirectory(path.dirname(target)))
    .filter((entry) => entry === targetName || logicalEntryName(entry) === targetName);
  if (candidates.length > 1) {
    throw new Error('Analysis publication found duplicate recovery evidence.');
  }
  return candidates.length === 0 ? null : path.join(path.dirname(target), candidates[0]);
}

function sameFileIdentity(left, right) {
  return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino);
}

function freshQuarantinePath(candidate, context) {
  const logicalName = logicalEntryName(path.basename(candidate));
  return path.join(
    path.dirname(candidate),
    `${logicalName}.quarantine.${context.randomId()}`,
  );
}

async function isolateEnoentReplacement(target, context) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const replacement = await resolveIsolatedCapability(target, context);
    if (replacement === null) return;
    const before = await inspectRegularTarget(replacement, context);
    const quarantine = freshQuarantinePath(replacement, context);
    try {
      await context.renameFile(replacement, quarantine);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const after = await inspectRegularTarget(quarantine, context);
    if (!after.exists || !sameFileIdentity(before, after)) {
      throw new Error('Analysis publication quarantine replacement identity changed.');
    }
    // ENOENT 后出现的目录项只作为外来证据隔离，绝不能晋升为本次操作的 capability。
    throw new Error('Analysis publication quarantine source identity changed.');
  }
  throw new Error('Analysis publication quarantine source changed repeatedly.');
}

async function moveToFreshQuarantine(target, candidate, before, context) {
  const quarantine = freshQuarantinePath(candidate, context);
  try {
    await context.renameFile(candidate, quarantine);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await isolateEnoentReplacement(target, context);
      return null;
    }
    throw error;
  }
  const after = await inspectRegularTarget(quarantine, context);
  if (!after.exists || !sameFileIdentity(before, after)) {
    throw new Error('Analysis publication quarantine source identity changed.');
  }
  return quarantine;
}

async function quarantineIsolatedCapability(target, context, expected) {
  const candidate = await resolveIsolatedCapability(target, context);
  if (candidate === null) return null;
  const before = await inspectRegularTarget(candidate, context);
  if (!before.exists || (expected !== undefined && !identityMatches(before, expected))) {
    throw new Error('Analysis publication owned file identity changed.');
  }
  // 每次使用都换成新的随机目录项；旧 quarantine 也不会被当作可长期复用的路径句柄。
  return moveToFreshQuarantine(target, candidate, before, context);
}

async function createSyncedFile(target, contents, context) {
  let handle;
  try {
    handle = await context.openFile(target, 'wx');
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    const stats = await handle.stat();
    await handle.close();
    return { path: target, dev: stats.dev, ino: stats.ino };
  } catch (error) {
    await handle?.close().catch(() => {});
    // 创建后的名字仍可被并发替换；失败路径保留锁内证据，不能按旧名字删除未知 inode。
    throw error;
  }
}

function externalTemporaryPath(target, publicationLock, context) {
  temporarySequence += 1;
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${publicationLock.token}.${temporarySequence}.${context.randomId()}.tmp`,
  );
}

function publicationLockPath(outputPath) {
  const stem = path.basename(outputPath, path.extname(outputPath));
  return path.join(path.dirname(outputPath), `.${stem}.analysis-publication.lock`);
}

function parsePublicationLockOwner(bytes) {
  let owner;
  try {
    owner = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TypeError('Analysis publication lock owner is malformed.');
  }
  if (owner === null
    || typeof owner !== 'object'
    || Array.isArray(owner)
    || Object.keys(owner).length !== 3
    || owner.protocol !== ANALYSIS_LOCK_PROTOCOL
    || !Number.isSafeInteger(owner.pid)
    || owner.pid <= 0
    || typeof owner.token !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/u.test(owner.token)) {
    throw new TypeError('Analysis publication lock owner is malformed.');
  }
  return owner;
}

function assertManifestKeys(value, expected, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Analysis publication ${label} is malformed.`);
  }
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`Analysis publication ${label} is malformed.`);
  }
}

function parseManifestIdentity(value, label) {
  assertManifestKeys(value, ['dev', 'ino'], label);
  if (!DECIMAL_IDENTITY.test(value.dev) || !DECIMAL_IDENTITY.test(value.ino)) {
    throw new TypeError(`Analysis publication ${label} is malformed.`);
  }
  return value;
}

function parseOriginalTarget(value, label) {
  assertManifestKeys(value, ['exists', 'dev', 'ino'], label);
  if (typeof value.exists !== 'boolean') {
    throw new TypeError(`Analysis publication ${label} is malformed.`);
  }
  if (!value.exists) {
    if (value.dev !== null || value.ino !== null) {
      throw new TypeError(`Analysis publication ${label} is malformed.`);
    }
    return value;
  }
  parseManifestIdentity({ dev: value.dev, ino: value.ino }, label);
  return value;
}

function parseOwnedPath(value, label) {
  assertManifestKeys(value, ['path', 'dev', 'ino', 'sha256'], label);
  if (typeof value.path !== 'string' || !path.isAbsolute(value.path)) {
    throw new TypeError(`Analysis publication ${label} is malformed.`);
  }
  parseManifestIdentity({ dev: value.dev, ino: value.ino }, label);
  if (!/^[0-9a-f]{64}$/u.test(value.sha256)) {
    throw new TypeError(`Analysis publication ${label} is malformed.`);
  }
  return value;
}

function parsePublicationManifest(bytes, outputPath, lockPath, owner) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TypeError('Analysis publication generation manifest is malformed.');
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('Analysis publication generation manifest is malformed.');
  }
  const legacyManifest = manifest.schema_version === 1;
  assertManifestKeys(manifest, legacyManifest
    ? ['schema_version', 'protocol', 'analysis_digest', 'phase', 'json', 'markdown']
    : [
      'schema_version', 'protocol', 'analysis_digest', 'phase', 'durability', 'json', 'markdown',
    ], 'generation manifest');
  if (![1, 2].includes(manifest.schema_version)
    || manifest.protocol !== ANALYSIS_MANIFEST_PROTOCOL
    || !/^[0-9a-f]{64}$/u.test(manifest.analysis_digest)
    || manifest.phase !== 'publishing') {
    throw new TypeError('Analysis publication generation manifest is malformed.');
  }
  if (!legacyManifest) {
    assertManifestKeys(
      manifest.durability,
      ['directory_sync', 'power_loss_durability', 'recovery_guarantee'],
      'durability state',
    );
    if (!['required', 'unsupported'].includes(manifest.durability.directory_sync)
      || !['not-claimed', 'unsupported-best-effort'].includes(
        manifest.durability.power_loss_durability,
      )
      || manifest.durability.recovery_guarantee !== 'process-interruption') {
      throw new TypeError('Analysis publication durability state is malformed.');
    }
  }
  assertManifestKeys(manifest.json, ['destination', 'original', 'temporary'], 'JSON manifest');
  assertManifestKeys(
    manifest.markdown,
    ['destination', 'original', 'temporary', 'rollback'],
    'Markdown manifest',
  );
  const markdownPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, path.extname(outputPath))}.md`,
  );
  if (manifest.json.destination !== outputPath || manifest.markdown.destination !== markdownPath) {
    throw new TypeError('Analysis publication manifest destinations are outside the requested generation.');
  }
  parseOriginalTarget(manifest.json.original, 'JSON original identity');
  parseOriginalTarget(manifest.markdown.original, 'Markdown original identity');
  parseOwnedPath(manifest.json.temporary, 'JSON temporary identity');
  parseOwnedPath(manifest.markdown.temporary, 'Markdown temporary identity');
  const expectedPrefixes = [
    [manifest.json.temporary.path, outputPath],
    [manifest.markdown.temporary.path, markdownPath],
  ];
  for (const [temporaryPath, destination] of expectedPrefixes) {
    const prefix = `.${path.basename(destination)}.${owner.pid}.${owner.token}.`;
    if (path.dirname(temporaryPath) !== path.dirname(outputPath)
      || !path.basename(temporaryPath).startsWith(prefix)
      || !path.basename(temporaryPath).endsWith('.tmp')) {
      throw new TypeError('Analysis publication manifest temporary path is not ownership-scoped.');
    }
  }
  if (manifest.markdown.rollback !== (manifest.markdown.original.exists ? 'markdown.rollback' : null)
    || (manifest.markdown.rollback !== null
      && path.join(lockPath, manifest.markdown.rollback) !== path.join(lockPath, 'markdown.rollback'))) {
    throw new TypeError('Analysis publication Markdown rollback path is malformed.');
  }
  return manifest;
}

async function readIsolatedRegularFile(target, expected, context) {
  const readFlags = fileConstants.O_NOFOLLOW === undefined
    ? 'r'
    : fileConstants.O_RDONLY | fileConstants.O_NOFOLLOW;
  const candidate = await resolveIsolatedCapability(target, context);
  if (candidate === null) {
    throw new Error('Analysis publication owned file identity changed.');
  }
  let handle;
  try {
    // 先取得句柄再移动目录项，后续读取不重新打开可被替换的 quarantine 路径。
    handle = await context.openFile(candidate, readFlags);
  } catch (error) {
    if (['ELOOP', 'EMLINK'].includes(error.code)) {
      throw new TypeError('Analysis publication refused to follow a symbolic or reparse entry.');
    }
    throw error;
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) {
      throw new TypeError('Analysis publication owned entry must be a regular file.');
    }
    const literal = await inspectRegularTarget(candidate, context);
    if (!literal.exists
      || !sameFileIdentity(opened, literal)
      || (expected !== undefined && !identityMatches(literal, expected))) {
      throw new Error('Analysis publication owned file identity changed.');
    }
    const capability = await moveToFreshQuarantine(target, candidate, literal, context);
    if (capability === null) {
      throw new Error('Analysis publication owned file identity changed.');
    }
    const isolated = await inspectRegularTarget(capability, context);
    if (!isolated.exists || !sameFileIdentity(opened, isolated)) {
      throw new Error('Analysis publication owned file identity changed.');
    }
    const bytes = await handle.readFile();
    const after = await inspectRegularTarget(capability, context);
    if (!identityMatches(after, serializeIdentity(opened))) {
      throw new Error('Analysis publication owned file identity changed.');
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function retainIsolatedOwnedFile(target, expected, context) {
  const capability = await quarantineIsolatedCapability(target, context, expected);
  if (capability === null) {
    return;
  }
  const state = await inspectRegularTarget(capability, context);
  if (!state.exists) {
    return;
  }
  if (!identityMatches(state, expected)) {
    throw new Error('Analysis publication refused to clean a file with foreign identity.');
  }
  // 事务内只隔离并验证，不 unlink 可变目录项；锁释放成功时再整体转移为 completed tombstone。
}

async function verifyIsolatedOwnedFile(target, expected, context) {
  const bytes = await readIsolatedRegularFile(target, expected, context);
  if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) {
    throw new Error('Analysis publication owned file contents changed.');
  }
  return bytes;
}

async function writePublicationManifest(lock, document, context) {
  const manifestPath = path.join(lock.path, 'manifest.json');
  const preparingPath = path.join(lock.path, 'manifest.preparing');
  await createSyncedFile(preparingPath, `${JSON.stringify(document)}\n`, context);
  await context.renameFile(preparingPath, manifestPath);
  // 最终 rename 一旦成功即为进程恢复依据；目录同步能力只影响未承诺的断电耐久性。
  await syncDirectory(lock.path, context);
  return manifestPath;
}

async function syncDirectory(directory, context) {
  let handle;
  try {
    handle = await context.openFile(directory, 'r');
    await handle.sync();
  } catch (error) {
    // Windows 的 EPERM 明确降级为 best-effort；JSON-last 只承诺进程中断恢复，不承诺断电恢复。
    if (!(context.platform === 'win32' && error.code === 'EPERM')) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => {});
  }
}

function isProcessActive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return false;
    }
    if (error.code === 'EPERM') {
      return true;
    }
    throw error;
  }
}

async function isolatedEntryExistsLiteral(target, context) {
  try {
    await context.lstatFile(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function isolatedEntryExists(target, context) {
  return (await resolveIsolatedCapability(target, context)) !== null;
}

async function isolateCandidate(source, held, context) {
  if (await isolatedEntryExists(held, context)) {
    const heldState = await inspectIsolatedOptional(held, context);
    const sourceState = await inspectRegularTarget(source, context);
    if (!sourceState.exists || identityMatches(sourceState, serializeIdentity(heldState))) {
      // restore 的 hard link 可能在进程退出前已成功；同 inode 双入口表示幂等续跑，不是外来重复项。
      return held;
    }
    const unexpected = path.join(path.dirname(held), `unexpected.${context.randomId()}`);
    try {
      await context.renameFile(source, unexpected);
    } catch (error) {
      if (error.code === 'ENOENT') return held;
      throw error;
    }
    throw new Error('Analysis publication found duplicate recovery evidence.');
  }
  try {
    // rename 只移动目录项本身；链接或 reparse point 会被隔离，随后才允许 lstat/open。
    await context.renameFile(source, held);
    return held;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function inspectIsolatedOptional(target, context) {
  const capability = await resolveIsolatedCapability(target, context);
  return capability === null
    ? { exists: false, dev: null, ino: null }
    : inspectRegularTarget(capability, context);
}

async function restoreIsolatedEntry(held, destination, expected, context) {
  const state = await inspectIsolatedOptional(held, context);
  const expectedExists = expected.exists ?? true;
  if (!state.exists) {
    if (expectedExists) {
      throw new Error('Analysis publication cannot prove the previous output generation.');
    }
    return;
  }
  if (!expectedExists || !identityMatches(state, expected)) {
    throw new Error('Analysis publication original output identity is foreign.');
  }
  const capability = await quarantineIsolatedCapability(held, context, expected);
  if (capability === null) {
    throw new Error('Analysis publication cannot prove the previous output generation.');
  }
  const immediatelyBeforeLink = await inspectRegularTarget(capability, context);
  if (!identityMatches(immediatelyBeforeLink, expected)) {
    throw new Error('Analysis publication restore source identity changed.');
  }
  try {
    // hard link 不覆盖目标；恢复点在 ENOENT 后被占用时，外来目录项保持原位并令恢复失败关闭。
    await context.linkFile(capability, destination);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const destinationState = await inspectRegularTarget(destination, context);
    if (!identityMatches(destinationState, expected)) {
      throw new Error('Analysis publication refused to overwrite an occupied foreign output.');
    }
  }
  const restored = await inspectRegularTarget(destination, context);
  if (!identityMatches(restored, expected)) {
    throw new Error('Analysis publication restore source identity changed.');
  }
  await retainIsolatedOwnedFile(held, expected, context);
}

async function retainOptionalIsolated(target, expected, context) {
  const state = await inspectIsolatedOptional(target, context);
  if (!state.exists) return;
  await retainIsolatedOwnedFile(target, expected, context);
}

function internalRole(lockPath, name) {
  return path.join(lockPath, name);
}

async function recoverPreparation(outputPath, lockPath, context) {
  const markdownPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, path.extname(outputPath))}.md`,
  );
  const jsonOriginal = internalRole(lockPath, 'json.original');
  const markdownOriginal = internalRole(lockPath, 'markdown.rollback');
  const jsonState = await inspectIsolatedOptional(jsonOriginal, context);
  const markdownState = await inspectIsolatedOptional(markdownOriginal, context);
  await restoreIsolatedEntry(jsonOriginal, outputPath, jsonState, context);
  await restoreIsolatedEntry(markdownOriginal, markdownPath, markdownState, context);
  // 没有已提交 manifest 时无法证明准备期名字仍指向本进程 inode；锁 tombstone 保留这些证据。
}

async function recoverManifestGeneration(outputPath, lockPath, manifest, context) {
  const roles = {
    jsonCurrent: internalRole(lockPath, 'json.current'),
    markdownCurrent: internalRole(lockPath, 'markdown.current'),
    jsonTemporary: internalRole(lockPath, 'json.temporary'),
    markdownTemporary: internalRole(lockPath, 'markdown.temporary'),
    jsonOriginal: internalRole(lockPath, 'json.original'),
    markdownOriginal: internalRole(lockPath, 'markdown.rollback'),
    jsonPayload: internalRole(lockPath, 'json.payload'),
    markdownPayload: internalRole(lockPath, 'markdown.payload'),
  };
  await isolateCandidate(manifest.json.destination, roles.jsonCurrent, context);
  await isolateCandidate(manifest.markdown.destination, roles.markdownCurrent, context);
  await isolateCandidate(manifest.json.temporary.path, roles.jsonTemporary, context);
  await isolateCandidate(manifest.markdown.temporary.path, roles.markdownTemporary, context);

  const states = {};
  for (const [name, target] of Object.entries(roles)) {
    states[name] = await inspectIsolatedOptional(target, context);
  }
  for (const [name, expected, label] of [
    ['jsonPayload', manifest.json.temporary, 'JSON payload'],
    ['markdownPayload', manifest.markdown.temporary, 'Markdown payload'],
    ['jsonTemporary', manifest.json.temporary, 'JSON temporary'],
    ['markdownTemporary', manifest.markdown.temporary, 'Markdown temporary'],
  ]) {
    if (states[name].exists) {
      if (!identityMatches(states[name], expected)) {
        throw new Error(`Analysis publication ${label} identity is foreign.`);
      }
      await verifyIsolatedOwnedFile(roles[name], expected, context);
    }
  }
  for (const [name, original, label] of [
    ['jsonOriginal', manifest.json.original, 'JSON original'],
    ['markdownOriginal', manifest.markdown.original, 'Markdown original'],
  ]) {
    if (states[name].exists && (!original.exists || !identityMatches(states[name], original))) {
      throw new Error(`Analysis publication ${label} identity is foreign.`);
    }
  }

  let jsonCurrentKind = 'absent';
  if (states.jsonCurrent.exists && identityMatches(states.jsonCurrent, manifest.json.temporary)) {
    jsonCurrentKind = 'temporary';
    const bytes = await verifyIsolatedOwnedFile(
      roles.jsonCurrent,
      manifest.json.temporary,
      context,
    );
    let document;
    try {
      document = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new Error('Analysis publication JSON commit marker is malformed.');
    }
    if (document?.analysis_digest !== manifest.analysis_digest) {
      throw new Error('Analysis publication JSON commit marker digest does not match its manifest.');
    }
  } else if (states.jsonCurrent.exists
    && manifest.json.original.exists
    && identityMatches(states.jsonCurrent, manifest.json.original)) {
    // 上一轮恢复可能已经归还旧 JSON；重启后它是 rollback 证据，不是新一代 commit marker。
    jsonCurrentKind = 'original';
  } else if (states.jsonCurrent.exists) {
    throw new Error('Analysis publication JSON destination identity is foreign.');
  }

  let markdownCurrentKind = 'absent';
  if (states.markdownCurrent.exists
    && identityMatches(states.markdownCurrent, manifest.markdown.temporary)) {
    markdownCurrentKind = 'temporary';
  } else if (states.markdownCurrent.exists
    && manifest.markdown.original.exists
    && identityMatches(states.markdownCurrent, manifest.markdown.original)) {
    markdownCurrentKind = 'original';
  } else if (states.markdownCurrent.exists) {
    throw new Error('Analysis publication Markdown destination identity is foreign.');
  }
  if (markdownCurrentKind === 'temporary') {
    await verifyIsolatedOwnedFile(
      roles.markdownCurrent,
      manifest.markdown.temporary,
      context,
    );
  }
  const jsonCommitted = jsonCurrentKind === 'temporary';
  if (jsonCommitted && markdownCurrentKind !== 'temporary') {
    throw new Error('Committed analysis JSON does not have its owned Markdown generation.');
  }
  if (!jsonCommitted) {
    for (const [name, currentKind, original] of [
      ['jsonOriginal', jsonCurrentKind, manifest.json.original],
      ['markdownOriginal', markdownCurrentKind, manifest.markdown.original],
    ]) {
      const available = states[name].exists || currentKind === 'original';
      if (available !== original.exists) {
        throw new Error('Analysis publication cannot prove the previous output generation.');
      }
    }
  }

  if (jsonCommitted) {
    // JSON marker 已提交时只向前保留同摘要 Markdown，绝不回滚到上一代。
    await restoreIsolatedEntry(
      roles.jsonCurrent,
      manifest.json.destination,
      manifest.json.temporary,
      context,
    );
    await restoreIsolatedEntry(
      roles.markdownCurrent,
      manifest.markdown.destination,
      manifest.markdown.temporary,
      context,
    );
    await retainOptionalIsolated(roles.jsonOriginal, manifest.json.original, context);
    await retainOptionalIsolated(roles.markdownOriginal, manifest.markdown.original, context);
  } else {
    if (jsonCurrentKind === 'temporary') {
      await retainOptionalIsolated(roles.jsonCurrent, manifest.json.temporary, context);
    }
    if (markdownCurrentKind === 'temporary') {
      await retainOptionalIsolated(roles.markdownCurrent, manifest.markdown.temporary, context);
    }
    const restoreOriginal = async (
      originalRole,
      currentRole,
      currentKind,
      destination,
      original,
    ) => {
      if (!original.exists) return;
      if ((await inspectIsolatedOptional(originalRole, context)).exists) {
        await restoreIsolatedEntry(originalRole, destination, original, context);
        if (currentKind === 'original') {
          await retainOptionalIsolated(currentRole, original, context);
        }
        return;
      }
      if (currentKind !== 'original') {
        throw new Error('Analysis publication cannot prove the previous output generation.');
      }
      await restoreIsolatedEntry(currentRole, destination, original, context);
    };
    await restoreOriginal(
      roles.jsonOriginal,
      roles.jsonCurrent,
      jsonCurrentKind,
      manifest.json.destination,
      manifest.json.original,
    );
    await restoreOriginal(
      roles.markdownOriginal,
      roles.markdownCurrent,
      markdownCurrentKind,
      manifest.markdown.destination,
      manifest.markdown.original,
    );
  }
  for (const [name, expected] of [
    ['jsonTemporary', manifest.json.temporary],
    ['markdownTemporary', manifest.markdown.temporary],
    ['jsonPayload', manifest.json.temporary],
    ['markdownPayload', manifest.markdown.temporary],
  ]) {
    await retainOptionalIsolated(roles[name], expected, context);
  }
}

async function recoverLockContents(outputPath, lockPath, owner, context) {
  const manifestHeld = internalRole(lockPath, 'manifest.held');
  const isolatedManifest = await isolateCandidate(
    internalRole(lockPath, 'manifest.json'),
    manifestHeld,
    context,
  );
  if (isolatedManifest === null) {
    await recoverPreparation(outputPath, lockPath, context);
    return;
  }
  const manifest = parsePublicationManifest(
    await readIsolatedRegularFile(manifestHeld, undefined, context),
    outputPath,
    lockPath,
    owner,
  );
  await recoverManifestGeneration(outputPath, lockPath, manifest, context);
  const manifestState = await inspectIsolatedOptional(manifestHeld, context);
  await retainIsolatedOwnedFile(manifestHeld, serializeIdentity(manifestState), context);
  const preparing = internalRole(lockPath, 'manifest.preparing');
  const preparingState = await inspectIsolatedOptional(preparing, context);
  if (preparingState.exists) {
    await retainIsolatedOwnedFile(preparing, serializeIdentity(preparingState), context);
  }
}

const CLAIM_NAME = /^(owner|recovery)\.([1-9][0-9]*)\.([A-Za-z0-9_-]{1,128})\.claim$/u;

function claimName(kind, pid, token) {
  return `${kind}.${pid}.${token}.claim`;
}

function parseRecoveryClaim(bytes, expected = {}) {
  let claim;
  try {
    claim = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TypeError('Analysis publication recovery claim is malformed.');
  }
  if (claim === null
    || typeof claim !== 'object'
    || Array.isArray(claim)
    || Object.keys(claim).length !== 7
    || claim.schema_version !== ANALYSIS_RECOVERY_SCHEMA_VERSION
    || claim.protocol !== ANALYSIS_RECOVERY_PROTOCOL
    || !Number.isSafeInteger(claim.pid)
    || claim.pid <= 0
    || typeof claim.token !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/u.test(claim.token)
    || typeof claim.generation !== 'string'
    || !RECOVERY_GENERATION.test(claim.generation)
    || typeof claim.stem !== 'string'
    || claim.stem.length === 0
    || claim.state !== 'recovering'
    || (expected.pid !== undefined && claim.pid !== expected.pid)
    || (expected.token !== undefined && claim.token !== expected.token)
    || (expected.generation !== undefined && claim.generation !== expected.generation)
    || (expected.stem !== undefined && claim.stem !== expected.stem)) {
    throw new TypeError('Analysis publication recovery claim is malformed.');
  }
  return claim;
}

function parseLegacyRecoveryClaim(bytes, expected = {}) {
  let claim;
  try {
    claim = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TypeError('Analysis publication recovery claim is malformed.');
  }
  if (claim === null
    || typeof claim !== 'object'
    || Array.isArray(claim)
    || Object.keys(claim).length !== 3
    || claim.protocol !== ANALYSIS_RECOVERY_PROTOCOL
    || !Number.isSafeInteger(claim.pid)
    || claim.pid <= 0
    || typeof claim.token !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/u.test(claim.token)
    || (expected.pid !== undefined && claim.pid !== expected.pid)
    || (expected.token !== undefined && claim.token !== expected.token)) {
    throw new TypeError('Analysis publication recovery claim is malformed.');
  }
  return claim;
}

function parseOwnerEvidence(bytes, lockPath) {
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TypeError('Analysis publication lock owner is malformed.');
  }
  return value?.protocol === ANALYSIS_RECOVERY_PROTOCOL
    ? parseRecoveryClaim(bytes, { stem: path.basename(lockPath) })
    : parsePublicationLockOwner(bytes);
}

async function readLiteralRegularFile(target, context) {
  const readFlags = fileConstants.O_NOFOLLOW === undefined
    ? 'r'
    : fileConstants.O_RDONLY | fileConstants.O_NOFOLLOW;
  let handle;
  try {
    handle = await context.openFile(target, readFlags);
  } catch (error) {
    if (['ELOOP', 'EMLINK'].includes(error.code)) {
      throw new TypeError('Analysis publication refused to follow a symbolic or reparse entry.');
    }
    throw error;
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) {
      throw new TypeError('Analysis publication claim must be a regular file.');
    }
    const literal = await context.lstatFile(target);
    if (!literal.isFile() || literal.isSymbolicLink() || !sameFileIdentity(opened, literal)) {
      throw new TypeError('Analysis publication claim must be a regular file.');
    }
    const bytes = await handle.readFile();
    const after = await context.lstatFile(target);
    if (!after.isFile() || after.isSymbolicLink() || !sameFileIdentity(opened, after)) {
      throw new Error('Analysis publication claim identity changed while reading.');
    }
    return { bytes, dev: opened.dev, ino: opened.ino };
  } finally {
    await handle.close();
  }
}

async function markerClaim(lockPath, markerName, kinds, context) {
  const acceptedKinds = new Set(Array.isArray(kinds) ? kinds : [kinds]);
  const markerPath = internalRole(lockPath, markerName);
  let marker;
  try {
    marker = await readLiteralRegularFile(markerPath, context);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const matches = [];
  for (const entry of await context.readDirectory(lockPath)) {
    const match = CLAIM_NAME.exec(logicalEntryName(entry));
    if (match === null || !acceptedKinds.has(match[1])) continue;
    const candidate = internalRole(lockPath, entry);
    const state = await context.lstatFile(candidate);
    if (state.isFile() && !state.isSymbolicLink() && sameFileIdentity(state, marker)) {
      matches.push({ candidate, match });
    }
  }
  if (matches.length > 1) {
    throw new TypeError('Analysis publication claim has duplicate unique ownership evidence.');
  }
  if (matches.length === 0) {
    if (markerName !== 'owner.json') {
      throw new TypeError('Analysis publication recovery claim is malformed.');
    }
    const owner = parseOwnerEvidence(marker.bytes, lockPath);
    return {
      ...owner,
      markerPath,
      uniquePath: null,
      dev: marker.dev,
      ino: marker.ino,
    };
  }
  const [{ candidate, match }] = matches;
  const unique = await readLiteralRegularFile(candidate, context);
  if (!sameFileIdentity(marker, unique) || !marker.bytes.equals(unique.bytes)) {
    throw new TypeError('Analysis publication claim pair is malformed.');
  }
  const expected = { pid: Number(match[2]), token: match[3] };
  const owner = match[1] === 'recovery'
    ? parseRecoveryClaim(marker.bytes, { ...expected, stem: path.basename(lockPath) })
    : parsePublicationLockOwner(marker.bytes);
  if (owner.pid !== expected.pid || owner.token !== expected.token) {
    throw new TypeError('Analysis publication claim identity is malformed.');
  }
  return {
    ...owner,
    markerPath,
    uniquePath: candidate,
    kind: match[1],
    dev: marker.dev,
    ino: marker.ino,
  };
}

async function removeClaim(claim, heldPrefix, context) {
  const retired = internalRole(
    path.dirname(claim.markerPath),
    `${heldPrefix}.marker.retired.${claim.pid}.${claim.token}.${context.randomId()}`,
  );
  await context.renameFile(claim.markerPath, retired);
  const state = await inspectRegularTarget(retired, context);
  if (!identityMatches(state, claim)) {
    throw new Error('Analysis publication claim identity changed during retirement.');
  }
  // marker 原子移入唯一 tombstone，配对 unique 继续保留；这里不 unlink 任何可变路径。
}

async function cleanupInterruptedRecoveryClaims(lockPath, context) {
  for (const entry of await context.readDirectory(lockPath)) {
    const logical = logicalEntryName(entry);
    if (!/^recovery\.(?:stale|current|orphan)(?:\.|$)/u.test(logical)
      || CLAIM_NAME.test(logical)) continue;
    const target = internalRole(lockPath, entry);
    let evidence;
    const { bytes } = await readLiteralRegularFile(target, context);
    try {
      evidence = parseRecoveryClaim(bytes, { stem: path.basename(lockPath) });
    } catch {
      evidence = parseLegacyRecoveryClaim(bytes);
    }
    if (context.processActive(evidence.pid)) {
      throw new Error('Analysis publication recovery is already in progress.');
    }
  }
}

async function cleanupOrphanRecoveryClaims(lockPath, retainedPath, context) {
  for (const entry of await context.readDirectory(lockPath)) {
    const match = CLAIM_NAME.exec(logicalEntryName(entry));
    if (match === null || match[1] !== 'recovery') continue;
    const target = internalRole(lockPath, entry);
    if (target === retainedPath || logicalEntryName(entry) === path.basename(retainedPath)) continue;
    if (context.processActive(Number(match[2]))) {
      throw new Error('Analysis publication recovery is already in progress.');
    }
    const before = await readLiteralRegularFile(target, context);
    try {
      parseRecoveryClaim(before.bytes, {
        pid: Number(match[2]),
        token: match[3],
        stem: path.basename(lockPath),
      });
    } catch {
      parseLegacyRecoveryClaim(before.bytes, {
        pid: Number(match[2]),
        token: match[3],
      });
    }
    let held = internalRole(lockPath, `recovery.orphan.${match[2]}.${match[3]}.held`);
    if (await isolatedEntryExistsLiteral(held, context)) {
      held = `${held}.${context.randomId()}`;
    }
    await context.renameFile(target, held);
    const after = await inspectRegularTarget(held, context);
    if (!sameFileIdentity(before, after)) {
      throw new Error('Analysis publication recovery claim identity changed during quarantine.');
    }
  }
}

async function collectRecoveryClaims(lockPath, context) {
  const claims = [];
  const seen = new Set();
  for (const entry of await context.readDirectory(lockPath)) {
    const logical = logicalEntryName(entry);
    const match = CLAIM_NAME.exec(logical);
    if (match === null || match[1] !== 'recovery') continue;
    if (seen.has(logical)) {
      throw new Error('Analysis publication found duplicate recovery evidence.');
    }
    seen.add(logical);
    const target = internalRole(lockPath, entry);
    const state = await readLiteralRegularFile(target, context);
    let evidence;
    let legacy = false;
    try {
      evidence = parseRecoveryClaim(state.bytes, {
        pid: Number(match[2]),
        token: match[3],
        stem: path.basename(lockPath),
      });
    } catch {
      evidence = parseLegacyRecoveryClaim(state.bytes, {
        pid: Number(match[2]),
        token: match[3],
      });
      legacy = true;
    }
    claims.push({ ...evidence, ...state, path: target, legacy });
  }
  return claims;
}

function ownerRecoveryGeneration(owner) {
  return owner.protocol === ANALYSIS_RECOVERY_PROTOCOL
    ? owner.generation
    : `${owner.pid}-${owner.token}`;
}

async function acquireRecoveryClaim(lockPath, context, generationHint) {
  const existing = await markerClaim(lockPath, 'recovery.json', 'recovery', context);
  if (existing !== null) {
    if (context.processActive(existing.pid)) {
      throw new Error('Analysis publication recovery is already in progress.');
    }
  }
  const previousClaims = await collectRecoveryClaims(lockPath, context);
  for (const previous of previousClaims) {
    if (context.processActive(previous.pid)) {
      throw new Error('Analysis publication recovery is already in progress.');
    }
  }
  const generations = new Set(previousClaims
    .filter((claim) => !claim.legacy)
    .map((claim) => claim.generation));
  if (existing !== null) generations.add(existing.generation);
  if (generationHint !== undefined) generations.add(generationHint);
  if (generations.size !== 1) {
    throw new Error('Analysis publication recovery generation is missing or inconsistent.');
  }
  if (generationHint === undefined && previousClaims.some((claim) => claim.legacy)) {
    throw new Error('Analysis publication ownerless recovery evidence is not generation-bound.');
  }
  const [generation] = generations;
  const token = context.randomId();
  const uniquePath = internalRole(lockPath, claimName('recovery', process.pid, token));
  const markerPath = internalRole(lockPath, 'recovery.json');
  const owned = await createSyncedFile(uniquePath, `${JSON.stringify({
    schema_version: ANALYSIS_RECOVERY_SCHEMA_VERSION,
    pid: process.pid,
    protocol: ANALYSIS_RECOVERY_PROTOCOL,
    token,
    generation,
    stem: path.basename(lockPath),
    state: 'recovering',
  })}\n`, context);
  // 新 unique 的文件内容和目录项先同步；后续任何旧 claim 迁移都不会留下无记录 canonical 锁。
  await syncDirectory(lockPath, context);
  try {
    if (existing !== null) {
      await removeClaim(existing, 'recovery.stale', context);
    }
    await cleanupInterruptedRecoveryClaims(lockPath, context);
    await cleanupOrphanRecoveryClaims(lockPath, uniquePath, context);
    // hard link 是不覆盖的原子胜者判定；EEXIST 表示另一个恢复者已持有锁内 claim。
    await context.linkFile(uniquePath, markerPath);
    await syncDirectory(lockPath, context);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error('Analysis publication recovery is already in progress.');
    }
    throw error;
  }
  return {
    markerPath,
    uniquePath,
    pid: process.pid,
    token,
    generation,
    stem: path.basename(lockPath),
    state: 'recovering',
    protocol: ANALYSIS_RECOVERY_PROTOCOL,
    schema_version: ANALYSIS_RECOVERY_SCHEMA_VERSION,
    dev: owned.dev,
    ino: owned.ino,
    resumed: existing !== null || previousClaims.length > 0,
  };
}

async function installPublicationOwner(lockPath, directoryStats, context) {
  const token = context.randomId();
  const ownerPath = path.join(lockPath, 'owner.json');
  const ownerUniquePath = internalRole(lockPath, claimName('owner', process.pid, token));
  let handle;
  try {
    handle = await context.openFile(ownerPath, 'wx');
    await handle.writeFile(`${JSON.stringify({
      pid: process.pid,
      protocol: ANALYSIS_LOCK_PROTOCOL,
      token,
    })}\n`, 'utf8');
    await handle.sync();
    const ownerStats = await handle.stat();
    await handle.close();
    handle = undefined;
    await context.linkFile(ownerPath, ownerUniquePath);
    return {
      path: lockPath,
      ownerPath,
      ownerUniquePath,
      token,
      ownerDev: ownerStats.dev,
      ownerIno: ownerStats.ino,
      dev: directoryStats.dev,
      ino: directoryStats.ino,
    };
  } catch (error) {
    await handle?.close().catch(() => {});
    // owner 名字和 unique 名字都可能在失败钩子中被替换；锁内证据保留给后续人工判断。
    throw error;
  }
}

async function initializePublicationLock(lockPath, context) {
  let directoryStats;
  try {
    directoryStats = await context.lstatFile(lockPath);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
      throw new TypeError('Analysis publication lock must be a regular directory.');
    }
    return await installPublicationOwner(lockPath, directoryStats, context);
  } catch (error) {
    try {
      // 只尝试 rmdir 新建锁目录；出现外来内容时非递归删除会失败并保留证据。
      await context.removeDirectory(lockPath);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Analysis publication lock initialization and cleanup failed.',
      );
    }
    throw error;
  }
}

function allowedRecoveryEntry(entry) {
  const logical = logicalEntryName(entry);
  if (CLAIM_NAME.test(logical)
    || /^recovery\.(?:stale|current|orphan)(?:\.|$)/u.test(logical)) {
    return true;
  }
  return new Set([
    'owner.json', 'owner.held', 'owner.unique.held',
    'recovery.json',
    'manifest.json', 'manifest.held', 'manifest.preparing',
    'json.original', 'markdown.rollback', 'json.payload', 'markdown.payload',
    'json.current', 'markdown.current', 'json.temporary', 'markdown.temporary',
  ]).has(logical);
}

async function recoverInactivePublicationLock(lockPath, outputPath, ownerClaim, context) {
  const initial = await context.lstatFile(lockPath);
  if (!initial.isDirectory() || initial.isSymbolicLink()) {
    throw new TypeError('Analysis publication lock must be a regular directory.');
  }
  const claim = await acquireRecoveryClaim(
    lockPath,
    context,
    ownerClaim === null ? undefined : ownerRecoveryGeneration(ownerClaim),
  );
  const ownerPath = internalRole(lockPath, 'owner.json');
  const ownerHeld = internalRole(lockPath, 'owner.held');
  let owner;
  let ownerState;
  try {
    const isolatedOwner = await isolateCandidate(ownerPath, ownerHeld, context);
    if (isolatedOwner === null) {
      const entries = (await context.readDirectory(lockPath)).sort();
      const completedHandoff = claim.resumed
        && entries.every((entry) => {
          const logical = logicalEntryName(entry);
          return logical === 'recovery.json'
            || CLAIM_NAME.test(logical)
            || /^recovery\.(?:stale|current|orphan)(?:\.|$)/u.test(logical);
        });
      if (!completedHandoff) {
        throw new Error('Analysis publication stale lock has no owner evidence.');
      }
      // 只有 generation/stem/state 均闭合的恢复记录才能接续 ownerless handoff。
      await context.linkFile(claim.uniquePath, ownerPath);
      await syncDirectory(lockPath, context);
      return {
        path: lockPath,
        ownerPath,
        ownerUniquePath: claim.uniquePath,
        token: claim.token,
        ownerDev: claim.dev,
        ownerIno: claim.ino,
        dev: initial.dev,
        ino: initial.ino,
      };
    }
    const ownerExpected = ownerClaim === null
      ? undefined
      : { dev: String(ownerClaim.dev), ino: String(ownerClaim.ino) };
    const ownerBytes = await readIsolatedRegularFile(ownerHeld, ownerExpected, context);
    ownerState = ownerClaim === null
      ? await inspectIsolatedOptional(ownerHeld, context)
      : { exists: true, ...ownerExpected };
    owner = parseOwnerEvidence(
      ownerBytes,
      lockPath,
    );
    if (context.processActive(owner.pid)) {
      throw new Error('Analysis publication is already in progress for this output pair.');
    }
    const entries = await context.readDirectory(lockPath);
    const expectedClaims = new Set([
      path.basename(claim.uniquePath),
      claimName('owner', owner.pid, owner.token),
      claimName('recovery', owner.pid, owner.token),
    ]);
    if (entries.some((entry) => (
      !allowedRecoveryEntry(entry) && !expectedClaims.has(logicalEntryName(entry))
    ))) {
      throw new Error('Analysis publication stale lock contains unexpected recovery evidence.');
    }
    await recoverLockContents(outputPath, lockPath, owner, context);

    await retainIsolatedOwnedFile(ownerHeld, serializeIdentity(ownerState), context);
    // 新 owner 与 recovery marker 共享已同步 inode；旧 owner 只隔离保留，不参与后续路径删除。
    await context.linkFile(claim.uniquePath, ownerPath);
    await syncDirectory(lockPath, context);
    return {
      path: lockPath,
      ownerPath,
      ownerUniquePath: claim.uniquePath,
      token: claim.token,
      ownerDev: claim.dev,
      ownerIno: claim.ino,
      dev: initial.dev,
      ino: initial.ino,
    };
  } catch (error) {
    const cleanupErrors = [];
    if (ownerState?.exists && await isolatedEntryExists(ownerHeld, context)) {
      try {
        await restoreIsolatedEntry(
          ownerHeld,
          ownerPath,
          serializeIdentity(ownerState),
          context,
        );
      } catch (restoreError) {
        cleanupErrors.push(restoreError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Analysis publication recovery and claim cleanup failed.',
      );
    }
    throw error;
  }
}

async function acquirePublicationLock(outputPath, context) {
  const lockPath = publicationLockPath(outputPath);
  try {
    await context.makeDirectory(lockPath);
    return await initializePublicationLock(lockPath, context);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
    const ownerClaim = await markerClaim(
      lockPath,
      'owner.json',
      ['owner', 'recovery'],
      context,
    );
    if (ownerClaim?.pid !== undefined && context.processActive(ownerClaim.pid)) {
      throw new Error('Analysis publication is already in progress for this output pair.');
    }
    // canonical 锁在整个恢复期保持原位；新 owner 只在全部证据收敛后接管同一目录。
    const recovered = await recoverInactivePublicationLock(
      lockPath,
      outputPath,
      ownerClaim,
      context,
    );
    // 恢复完成后先原子封存整把旧锁，再用全新 canonical 锁开始下一代发布。
    await releasePublicationLock(recovered, context);
    return acquirePublicationLock(outputPath, context);
  }
}

async function releasePublicationLock(lock, context) {
  const current = await context.lstatFile(lock.path);
  if (!current.isDirectory()
    || current.isSymbolicLink()
    || current.dev !== lock.dev
    || current.ino !== lock.ino) {
    throw new Error('Analysis publication lock ownership changed before release.');
  }
  const owner = await markerClaim(
    lock.path,
    'owner.json',
    ['owner', 'recovery'],
    context,
  );
  if (owner === null
    || owner.pid !== process.pid
    || owner.token !== lock.token
    || String(owner.dev) !== String(lock.ownerDev)
    || String(owner.ino) !== String(lock.ownerIno)
    || owner.uniquePath === null
    || path.basename(owner.uniquePath) !== path.basename(lock.ownerUniquePath)) {
    throw new Error('Analysis publication lock ownership changed before release.');
  }
  const entries = (await context.readDirectory(lock.path)).sort();
  if (entries.some((entry) => !allowedRecoveryEntry(entry))) {
    throw new Error('Analysis publication lock contains unexpected recovery evidence.');
  }
  const completed = `${lock.path}.completed.${process.pid}.${lock.token}.${context.randomId()}`;
  // canonical 可用性由整目录原子 rename 决定，内部最后一条 owner 记录绝不先行删除。
  await context.renameFile(lock.path, completed);
  await syncDirectory(
    path.dirname(lock.path),
    context,
  );
}

function renderAnalysisGeneration(analysis) {
  const snapshot = JSON.parse(JSON.stringify(analysis));
  const analysisDigest = createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');
  const document = { ...snapshot, analysis_digest: analysisDigest };
  return {
    document,
    json: `${JSON.stringify(document, null, 2)}\n`,
    markdown: renderAnalysisMarkdown(document),
  };
}

async function publishAnalysisGeneration(outputPath, generation, context, publicationLock) {
  const markdownPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, path.extname(outputPath))}.md`,
  );
  const jsonOriginalPath = internalRole(publicationLock.path, 'json.original');
  const markdownOriginalPath = internalRole(publicationLock.path, 'markdown.rollback');
  const jsonPayloadPath = internalRole(publicationLock.path, 'json.payload');
  const markdownPayloadPath = internalRole(publicationLock.path, 'markdown.payload');
  try {
    const detachOriginal = async (source, held) => {
      let before;
      try {
        before = await context.lstatFile(source);
      } catch (error) {
        if (error.code === 'ENOENT') return { exists: false, dev: null, ino: null };
        throw error;
      }
      const isolated = await isolateCandidate(source, held, context);
      if (isolated === null) return { exists: false, dev: null, ino: null };
      try {
        const state = await inspectRegularTarget(held, context);
        if (!sameFileIdentity(before, state)) {
          throw new Error('Analysis publication original output identity changed during detachment.');
        }
        return { exists: true, ...serializeIdentity(state) };
      } catch (error) {
        const heldState = await context.lstatFile(held);
        if (sameFileIdentity(before, heldState)) {
          // 失败归还也使用不覆盖 hard link；并发占用 source 时保留双方证据并失败关闭。
          await context.linkFile(held, source);
        }
        throw error;
      }
    };
    const jsonOriginal = await detachOriginal(outputPath, jsonOriginalPath);
    const markdownOriginal = await detachOriginal(markdownPath, markdownOriginalPath);
    const jsonPayload = await createSyncedFile(jsonPayloadPath, generation.json, context);
    const markdownPayload = await createSyncedFile(
      markdownPayloadPath,
      generation.markdown,
      context,
    );
    const jsonTemporaryPath = externalTemporaryPath(outputPath, publicationLock, context);
    const markdownTemporaryPath = externalTemporaryPath(markdownPath, publicationLock, context);
    const originalTarget = (state) => (state.exists
      ? state
      : { exists: false, dev: null, ino: null });
    const ownedTarget = (owned, externalPath, contents) => ({
      path: externalPath,
      ...serializeIdentity(owned),
      sha256: createHash('sha256').update(contents).digest('hex'),
    });
    // payload inode 与完整 manifest 先在锁内持久化，外部临时目录项随后才以 hard link 出现。
    await writePublicationManifest(publicationLock, {
      schema_version: 2,
      protocol: ANALYSIS_MANIFEST_PROTOCOL,
      analysis_digest: generation.document.analysis_digest,
      phase: 'publishing',
      durability: context.platform === 'win32'
        ? {
          directory_sync: 'unsupported',
          power_loss_durability: 'unsupported-best-effort',
          recovery_guarantee: 'process-interruption',
        }
        : {
          directory_sync: 'required',
          power_loss_durability: 'not-claimed',
          recovery_guarantee: 'process-interruption',
        },
      json: {
        destination: outputPath,
        original: originalTarget(jsonOriginal),
        temporary: ownedTarget(jsonPayload, jsonTemporaryPath, generation.json),
      },
      markdown: {
        destination: markdownPath,
        original: originalTarget(markdownOriginal),
        temporary: ownedTarget(
          markdownPayload,
          markdownTemporaryPath,
          generation.markdown,
        ),
        rollback: markdownOriginal.exists ? 'markdown.rollback' : null,
      },
    }, context);
    await context.linkFile(jsonPayloadPath, jsonTemporaryPath);
    await context.linkFile(markdownPayloadPath, markdownTemporaryPath);
    // 公开目标使用不覆盖 hard link；EEXIST 会保全竞态插入的外来目录项并使发布失败关闭。
    await context.linkFile(markdownTemporaryPath, markdownPath);
    // JSON 最后出现；观察到新 digest 即表示对应 Markdown 已完整发布。
    await context.linkFile(jsonTemporaryPath, outputPath);

    for (const [external, held, expected] of [
      [jsonTemporaryPath, internalRole(publicationLock.path, 'json.temporary'), jsonPayload],
      [
        markdownTemporaryPath,
        internalRole(publicationLock.path, 'markdown.temporary'),
        markdownPayload,
      ],
    ]) {
      await isolateCandidate(external, held, context);
      await retainOptionalIsolated(held, serializeIdentity(expected), context);
    }

    for (const [target, expected] of [
      [jsonOriginalPath, jsonOriginal],
      [markdownOriginalPath, markdownOriginal],
      [jsonPayloadPath, serializeIdentity(jsonPayload)],
      [markdownPayloadPath, serializeIdentity(markdownPayload)],
    ]) {
      await retainOptionalIsolated(target, expected, context);
    }
    const manifestHeld = internalRole(publicationLock.path, 'manifest.held');
    await isolateCandidate(internalRole(publicationLock.path, 'manifest.json'), manifestHeld, context);
    const manifestState = await inspectRegularTarget(manifestHeld, context);
    await retainIsolatedOwnedFile(manifestHeld, serializeIdentity(manifestState), context);
    return generation.document;
  } catch (error) {
    const cleanupErrors = [];
    try {
      await recoverLockContents(outputPath, publicationLock.path, {
        pid: process.pid,
        protocol: ANALYSIS_LOCK_PROTOCOL,
        token: publicationLock.token,
      }, context);
    } catch (failure) {
      cleanupErrors.push(failure);
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        `Analysis publication and rollback failed: ${[error, ...cleanupErrors]
          .map((failure) => failure.message)
          .join('; ')}`,
      );
    }
    // manifest 存在时统一按 JSON commit marker 决定向前保留或回滚；准备期只归还原 inode。
    throw error;
  }
}

/**
 * 先发布 Markdown，再以 JSON 作为整代分析的最终提交标记；JSON 提交失败会恢复旧 Markdown。
 */
export async function writeAnalysisGeneration(outputPath, analysis, overrides = {}) {
  // 两种渲染在首个 await 前固定为同一快照，调用方后续修改不能撕裂 digest 对应关系。
  const generation = renderAnalysisGeneration(analysis);
  const context = {
    openFile: overrides.openFile ?? open,
    linkFile: overrides.linkFile ?? link,
    renameFile: overrides.renameFile ?? rename,
    unlinkFile: overrides.unlinkFile ?? unlink,
    lstatFile: overrides.lstatFile ?? lstat,
    readDirectory: overrides.readDirectory ?? readdir,
    randomId: overrides.randomId ?? randomUUID,
    makeDirectory: overrides.makeDirectory ?? mkdir,
    removeDirectory: overrides.removeDirectory ?? rmdir,
    processActive: overrides.processActive ?? isProcessActive,
    platform: overrides.platform ?? process.platform,
  };
  await assertDirectory(path.dirname(outputPath));
  const publicationLock = await acquirePublicationLock(outputPath, context);
  let publicationFailure;
  try {
    return await publishAnalysisGeneration(outputPath, generation, context, publicationLock);
  } catch (error) {
    publicationFailure = error;
    throw error;
  } finally {
    try {
      await releasePublicationLock(publicationLock, context);
    } catch (cleanupError) {
      if (publicationFailure !== undefined) {
        throw new AggregateError(
          [publicationFailure, cleanupError],
          `Analysis publication and lock cleanup failed: ${publicationFailure.message}`,
        );
      }
      throw cleanupError;
    }
  }
}

async function runAnalyze(argv) {
  const { planPath, tracesRoot, outputPath } = parseAnalyzeArgs(argv);
  await assertDirectory(tracesRoot);
  await assertDirectory(path.dirname(outputPath));
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const tracePaths = await collectTracePaths(tracesRoot);
  const traces = [];
  for (const tracePath of tracePaths) {
    traces.push(JSON.parse(await readFile(tracePath, 'utf8')));
  }
  const analysis = analyzeEvaluation(plan, traces);
  await writeAnalysisGeneration(outputPath, analysis);
}

export async function writeTraceAtomically(target, snapshot, context = {}) {
  const openFile = context.openFile ?? open;
  const renameFile = context.renameFile ?? rename;
  const unlinkFile = context.unlinkFile ?? unlink;
  const randomId = context.randomId ?? randomUUID;
  temporarySequence += 1;
  let handle;
  let ownedTemporary;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = attempt === 0 ? '' : `.${randomId()}`;
    const candidate = path.join(
      path.dirname(target),
      `.${path.basename(target)}.${process.pid}.${temporarySequence}${suffix}.tmp`,
    );
    try {
      handle = await openFile(candidate, 'wx');
      ownedTemporary = candidate;
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      // 未成功 open('wx') 就没有所有权，碰撞文件必须保持逐字节不变。
    }
  }
  if (handle === undefined) {
    throw new Error('Unable to allocate a unique trace temporary file.');
  }

  try {
    await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    // 临时文件与目标同目录，rename 只发布完整且已关闭的 JSON。
    await renameFile(ownedTemporary, target);
    ownedTemporary = undefined;
  } catch (error) {
    if (handle !== undefined) {
      await handle.close().catch(() => {});
    }
    // 只清理由本次成功 open('wx') 取得所有权的临时文件，上一版 trace 保持可读取。
    if (ownedTemporary !== undefined) {
      await unlinkFile(ownedTemporary).catch(() => {});
    }
    throw error;
  }
}

async function runRecord(argv) {
  const { planPath, outputDir } = parseRecordArgs(argv);
  await assertDirectory(outputDir);
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const recorder = createEvaluationRecorder({
    plan,
    clock: process.hrtime.bigint,
    utcNow: () => new Date().toISOString(),
  });
  const tracePath = path.join(outputDir, TRACE_NAME);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let closed = false;

  for await (const line of lines) {
    if (line.length === 0) {
      throw new TypeError('Empty JSONL records are not allowed.');
    }
    const command = JSON.parse(line);
    const result = recorder.handle(command);
    await writeTraceAtomically(tracePath, result.snapshot);
    const status = await writeOutput(process.stdout, `${JSON.stringify(result.acknowledgement)}\n`);
    if (status === 'closed') {
      throw new Error('Acknowledgement output closed before delivery.');
    }
    closed = result.closed;
    if (closed) {
      // finish 已持久化且确认后立即解除 stdin 活跃句柄，不要求调用方额外关闭管道。
      lines.close();
      process.stdin.pause();
      return;
    }
  }
  if (!closed) {
    throw new Error('Input ended before an accepted finish command.');
  }
}

async function main() {
  const mode = process.argv[2];
  try {
    if (mode === 'record') {
      await runRecord(process.argv.slice(2));
    } else if (mode === 'analyze') {
      await runAnalyze(process.argv.slice(2));
    } else {
      throw new TypeError('Expected record or analyze mode.');
    }
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : String(error);
    try {
      const operation = mode === 'analyze' ? 'analysis' : 'recorder';
      await writeOutput(process.stderr, `Evaluation ${operation} failed: ${message}\n`);
    } catch {
      // 两个输出流都关闭时不再尝试报告，非零退出码仍保留失败语义。
    }
  }
}

const invokedPath = process.argv[1] === undefined
  ? null
  : pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  await main();
}
