import { spawn } from 'node:child_process';
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';

export const MAX_SUBJECT_PROCESSES = 11;
export const SKILL_NAME = 'development-execution-accelerator';

const FORBIDDEN_PAIR_HINT = /skill|worker|parallel|serial/iu;
const FORBIDDEN_SHORT_TOOLS = /spawn_agent|worker|background|write_stdin|wait_agent|wait_threads|update_plan|plan_state/iu;
const FORBIDDEN_SHORT_COMMAND = /Start-Process|spawn_agent|background|write_stdin|wait_agent|wait_threads|update_plan|plan[_ -]?state|session/iu;
const TRAILING_BACKGROUND_COMMAND = /(?:^|[^&])&\s*$/u;

function requireText(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
}

function portablePath(value) {
  return path.resolve(value).split(path.sep).join('/');
}

function disabledPersonalSkillConfig(userHome) {
  const roots = ['.agents', '.codex'].map((directory) => ({
    path: portablePath(path.join(userHome, directory, 'skills', SKILL_NAME)),
    enabled: false,
  }));
  return `skills.config=[${roots.map(({ path: skillPath, enabled }) => `{path=${JSON.stringify(skillPath)},enabled=${enabled}}`).join(',')}]`;
}

const SUBJECT_ENV_KEYS = new Set([
  'PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'SystemDrive',
  'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'CODEX_HOME',
  'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'TERM',
  'npm_config_cache',
]);
const WINDOWS_SUBJECT_ENV_KEYS = new Set([...SUBJECT_ENV_KEYS].map((key) => key.toLowerCase()));

/** Windows 环境名大小写不敏感，但输出保留宿主键名，避免改写可用的 Path/ComSpec。 */
export function buildSubjectEnvironment(source = process.env, platform = process.platform) {
  const matches = platform === 'win32'
    ? (key) => WINDOWS_SUBJECT_ENV_KEYS.has(key.toLowerCase())
    : (key) => SUBJECT_ENV_KEYS.has(key);
  return Object.fromEntries(Object.entries(source)
    .filter(([key, value]) => matches(key) && typeof value === 'string'));
}

/** Windows npm shim 不能直接交给 spawn；只执行同一安装根中的真实 JS 入口。 */
export async function resolveCodexLaunch({
  platform = process.platform,
  pathValue = process.env.PATH ?? '',
  pathExt = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
  execPath = process.execPath,
} = {}) {
  if (platform !== 'win32') {
    return { command: 'codex', prefixArgs: [], entryPath: null };
  }
  const extensions = pathExt.split(';').filter(Boolean).map((value) => value.toLowerCase());
  const names = ['codex.cmd', 'codex.ps1', 'codex.exe']
    .filter((name) => name.endsWith('.ps1') || extensions.includes(path.extname(name).toLowerCase()));
  for (const directory of pathValue.split(';').filter(Boolean)) {
    for (const name of names) {
      try {
        const shim = path.join(directory, name);
        const shimStats = await lstat(shim);
        if (!shimStats.isFile() || shimStats.isSymbolicLink()) {
          continue;
        }
        const entryPath = path.join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
        const entryStats = await lstat(entryPath);
        if (!entryStats.isFile() || entryStats.isSymbolicLink()) {
          continue;
        }
        return {
          command: path.resolve(execPath),
          prefixArgs: [entryPath],
          entryPath,
        };
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }
  throw new Error('Unable to resolve the installed Codex JavaScript entry from PATH.');
}

/** 固定所有会影响 subject 权限、模型和个人 Skill 隔离的启动参数。 */
export function buildCodexInvocation({
  workspaceDir,
  prompt,
  userHome = os.homedir(),
  multiAgent = true,
  launcher = { command: 'codex', prefixArgs: [] },
}) {
  const resolvedWorkspace = path.resolve(requireText(workspaceDir, 'workspaceDir'));
  return {
    command: launcher.command,
    args: [
      ...launcher.prefixArgs,
      'exec',
      '--json',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--strict-config',
      '--color',
      'never',
      '--model',
      'gpt-5.6-sol',
      '--sandbox',
      'workspace-write',
      '--config',
      'model_reasoning_effort="high"',
      '--config',
      'sandbox_workspace_write.network_access=false',
      '--config',
      'web_search="disabled"',
      '--config',
      disabledPersonalSkillConfig(userHome),
      '--config',
      `features.multi_agent=${multiAgent === true}`,
      '--config',
      `agents.enabled=${multiAgent === true}`,
      '--config',
      'approval_policy="never"',
      '--cd',
      resolvedWorkspace,
      '--skip-git-repo-check',
      '-',
    ],
    stdin: requireText(prompt, 'prompt'),
  };
}

export function assertProcessBudget(subjects) {
  if (!Array.isArray(subjects) || subjects.length > MAX_SUBJECT_PROCESSES) {
    throw new RangeError(`An accepted Skill version is limited to ${MAX_SUBJECT_PROCESSES} subject processes.`);
  }
  return subjects;
}

function assertWithin(root, target, label) {
  const relative = path.relative(root, target);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return target;
  }
  throw new Error(`${label} escapes its canonical root.`);
}

async function sha256File(filePath) {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Identity input must be a regular file without symbolic links: ${filePath}`);
  }
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function hashTree(rootPath) {
  const root = path.resolve(rootPath);
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) {
        throw new Error(`Fixture identity rejects symbolic link: ${relative}`);
      }
      if (stats.isDirectory()) {
        await visit(absolute);
      } else if (stats.isFile()) {
        files.push({ relative, bytes: await readFile(absolute) });
      } else {
        throw new Error(`Fixture identity rejects non-regular entry: ${relative}`);
      }
    }
  }
  await visit(root);
  files.sort((left, right) => left.relative.localeCompare(right.relative, 'en'));
  const treeHash = createHash('sha256');
  const hashes = {};
  for (const { relative, bytes } of files) {
    treeHash.update(relative).update('\0').update(String(bytes.length)).update('\0').update(bytes);
    hashes[relative] = createHash('sha256').update(bytes).digest('hex');
  }
  return { sha256: treeHash.digest('hex'), files: hashes };
}

function assertNeutralPair(plan, pairId) {
  const pair = plan.filter((subject) => subject.pairId === pairId);
  if (pair.length !== 2 || Buffer.compare(Buffer.from(pair[0].prompt), Buffer.from(pair[1].prompt)) !== 0) {
    throw new TypeError(`${pairId} must contain byte-identical paired prompts.`);
  }
  if (FORBIDDEN_PAIR_HINT.test(pair[0].prompt)) {
    throw new TypeError(`${pairId} prompt must not contain execution-strategy hints.`);
  }
}

/** 计划是硬上限而非可扩展 campaign；调用方不能追加或挪用 subject 配额。 */
export function buildSubjectPlan({
  longTaskPrompt,
  fallbackPilotPrompt = longTaskPrompt,
  shortTaskPrompt,
  waitTaskPrompt,
  implicitPositivePrompt,
  nearMissPrompt,
}) {
  const longPrompt = requireText(longTaskPrompt, 'longTaskPrompt');
  const shortPrompt = requireText(shortTaskPrompt, 'shortTaskPrompt');
  const plan = [
    {
      id: 'pilot-with-skill',
      scenario: 'long',
      phase: 'pilot',
      variant: 'with_skill',
      prompt: requireText(fallbackPilotPrompt, 'fallbackPilotPrompt'),
    },
    { id: 'long-1-with', scenario: 'long', phase: 'formal', pairId: 'long-1', variant: 'with_skill', prompt: longPrompt },
    { id: 'long-1-without', scenario: 'long', phase: 'formal', pairId: 'long-1', variant: 'without_skill', prompt: longPrompt },
    { id: 'long-2-without', scenario: 'long', phase: 'formal', pairId: 'long-2', variant: 'without_skill', prompt: longPrompt },
    { id: 'long-2-with', scenario: 'long', phase: 'formal', pairId: 'long-2', variant: 'with_skill', prompt: longPrompt },
    { id: 'long-3-with', scenario: 'long', phase: 'formal', pairId: 'long-3', variant: 'with_skill', prompt: longPrompt },
    { id: 'long-3-without', scenario: 'long', phase: 'formal', pairId: 'long-3', variant: 'without_skill', prompt: longPrompt },
    { id: 'short-explicit', scenario: 'short', phase: 'formal', variant: 'with_skill', load: 'explicit', prompt: `$${SKILL_NAME}\n\n${shortPrompt}` },
    { id: 'wait-overlap', scenario: 'wait', phase: 'formal', variant: 'with_skill', prompt: requireText(waitTaskPrompt, 'waitTaskPrompt') },
    { id: 'implicit-positive', scenario: 'discovery-positive', phase: 'formal', variant: 'with_skill', prompt: requireText(implicitPositivePrompt, 'implicitPositivePrompt') },
    { id: 'near-miss-negative', scenario: 'discovery-negative', phase: 'formal', variant: 'with_skill', prompt: requireText(nearMissPrompt, 'nearMissPrompt') },
  ];
  for (const pairId of ['long-1', 'long-2', 'long-3']) {
    assertNeutralPair(plan, pairId);
  }
  return assertProcessBudget(plan);
}

export function parseCampaignArgs(argv) {
  if (argv.length !== 4 || argv[0] !== '--output-root' || argv[2] !== '--campaign-name') {
    throw new TypeError('Usage: run-lean-evaluation --output-root <directory> --campaign-name <name>');
  }
  const campaignName = requireText(argv[3], 'campaignName');
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(campaignName)) {
    throw new TypeError('Campaign name must be a safe filename component.');
  }
  return { outputRoot: path.resolve(requireText(argv[1], 'outputRoot')), campaignName };
}

function digestText(text) {
  return createHash('sha256').update(Buffer.from(text)).digest('hex');
}

function medianNs(values) {
  const ordered = values.map(BigInt).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return ordered[Math.floor(ordered.length / 2)];
}

export function summarizeCampaign(attempts, elapsedNs) {
  const correctnessPassed = attempts.length === MAX_SUBJECT_PROCESSES
    && attempts.every(({ summary }) => summary?.valid === true);
  const result = {
    valid: correctnessPassed,
    elapsed_ns: String(elapsedNs),
    correctness_passed: correctnessPassed,
    attempts,
    performance: { evaluated: false, pilot_excluded: true },
  };
  if (!correctnessPassed) {
    return result;
  }
  const formalLong = attempts.filter(({ subject }) => subject.phase === 'formal' && subject.scenario === 'long');
  const withMedian = medianNs(formalLong.filter(({ subject }) => subject.variant === 'with_skill').map(({ summary }) => summary.elapsed_ns));
  const withoutMedian = medianNs(formalLong.filter(({ subject }) => subject.variant === 'without_skill').map(({ summary }) => summary.elapsed_ns));
  result.performance = {
    evaluated: true,
    pilot_excluded: true,
    pair_elapsed_ns: ['long-1', 'long-2', 'long-3'].map((pair_id) => ({
      pair_id,
      with_skill: formalLong.find(({ subject }) => subject.pairId === pair_id && subject.variant === 'with_skill').summary.elapsed_ns,
      without_skill: formalLong.find(({ subject }) => subject.pairId === pair_id && subject.variant === 'without_skill').summary.elapsed_ns,
    })),
    with_skill_median_ns: String(withMedian),
    without_skill_median_ns: String(withoutMedian),
    meets_twenty_percent: withMedian * 100n <= withoutMedian * 80n,
  };
  return result;
}

function subjectContract(repoRoot, subject) {
  const long = {
    fixturePath: path.join(repoRoot, 'evals', 'fixtures', 'long-task'),
    requiredCommands: ['npm run test:catalog', 'npm run test:billing', 'npm test'],
    allowedPaths: ['src/catalog/normalize-catalog.js', 'src/billing/allocate-invoice.js'],
  };
  if (subject.scenario === 'short') {
    return {
      fixturePath: path.join(repoRoot, 'evals', 'fixtures', 'short-task'),
      requiredCommands: ['npm run test:value', 'npm test'],
      allowedPaths: ['src/value.js'],
      mode: 'short',
    };
  }
  if (subject.scenario === 'wait') {
    return {
      fixturePath: path.join(repoRoot, 'evals', 'fixtures', 'wait-overlap'),
      requiredCommands: ['npm run verify:corpus', 'npm run test:reporting', 'npm test'],
      allowedPaths: ['src/reporting/format-summary.js'],
      mode: 'wait',
      waitExpectation: {
        longCommand: 'npm run verify:corpus',
        usefulWorkCommand: 'npm run test:reporting',
        testCommand: 'npm test',
      },
    };
  }
  if (subject.scenario === 'discovery-negative') {
    return { ...long, mode: 'short' };
  }
  const requireWorkers = subject.phase === 'formal' && subject.variant === 'with_skill';
  return {
    ...long,
    mode: requireWorkers ? 'worker' : 'generic',
    ...(requireWorkers ? { workerExpectation: { expectedDomains: ['src/catalog', 'src/billing'] } } : {}),
  };
}

/** campaign runner 是唯一 subject 调度入口，因此 11 次顺序、身份与上限在执行时生效。 */
export async function runLeanCampaign({
  repoRoot,
  outputRoot,
  campaignName,
  runAttempt = runLeanAttempt,
  nowNs = process.hrtime.bigint,
}) {
  const startedNs = nowNs();
  const canonicalRepo = await realpath(path.resolve(repoRoot));
  const canonicalOutput = await realpath(path.resolve(outputRoot));
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(campaignName)) {
    throw new TypeError('Campaign name must be a safe filename component.');
  }
  const campaignDir = assertWithin(canonicalOutput, path.join(canonicalOutput, campaignName), 'Campaign output root');
  try {
    await mkdir(campaignDir);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Campaign directory already exists: ${campaignDir}`);
    }
    throw error;
  }
  const evalDocument = JSON.parse(await readFile(path.join(canonicalRepo, 'evals', 'evals.json'), 'utf8'));
  const prompts = new Map(evalDocument.evals.map(({ id, prompt }) => [id, requireText(prompt, id)]));
  const plan = buildSubjectPlan({
    longTaskPrompt: prompts.get('EVAL-001'),
    fallbackPilotPrompt: prompts.get('EVAL-003'),
    shortTaskPrompt: prompts.get('EVAL-004'),
    waitTaskPrompt: prompts.get('EVAL-008'),
    implicitPositivePrompt: prompts.get('EVAL-011'),
    nearMissPrompt: prompts.get('EVAL-010'),
  });
  const skillPath = path.join(canonicalRepo, 'SKILL.md');
  const fixtureIdentities = {};
  for (const fixture of ['long-task', 'short-task', 'wait-overlap']) {
    fixtureIdentities[fixture] = (await hashTree(path.join(canonicalRepo, 'evals', 'fixtures', fixture))).sha256;
  }
  const manifest = {
    subject_count: plan.length,
    skill_sha256: await sha256File(skillPath),
    fixture_sha256: fixtureIdentities,
    subjects: plan.map((subject) => ({ id: subject.id, prompt_sha256: digestText(subject.prompt) })),
  };
  await writeFile(path.join(campaignDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  const launcher = await resolveCodexLaunch();
  const attempts = [];
  for (const subject of plan) {
    const contract = subjectContract(canonicalRepo, subject);
    const attempt = await runAttempt({
      sourceRoot: canonicalRepo,
      outputRoot: campaignDir,
      attemptDir: path.join(campaignDir, subject.id),
      skillPath,
      variant: subject.variant,
      prompt: subject.prompt,
      promptSha256: digestText(subject.prompt),
      subject,
      launcher,
      multiAgent: subject.phase !== 'pilot',
      ...contract,
    });
    attempts.push({ subject: { ...subject, prompt: undefined }, summary: attempt.summary });
    // 无效 pilot 仍保留在结果中，但不得启动未经 preflight 验证的正式 subject。
    if (subject.phase === 'pilot' && attempt.summary?.valid !== true) {
      break;
    }
  }
  const result = summarizeCampaign(attempts, nowNs() - startedNs);
  await writeFile(path.join(campaignDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  return { campaignDir, manifest, result };
}

/** mkdir 的失败就是 attempt 失效边界；禁止清理后重用同一目录。 */
export async function prepareAttempt({
  sourceRoot = process.cwd(),
  outputRoot = path.dirname(path.resolve(requireText(attemptDir, 'attemptDir'))),
  attemptDir,
  variant,
  skillPath,
  fixturePath,
}) {
  const canonicalSource = await realpath(path.resolve(requireText(sourceRoot, 'sourceRoot')));
  const canonicalOutput = await realpath(path.resolve(requireText(outputRoot, 'outputRoot')));
  const resolvedAttempt = assertWithin(canonicalOutput, path.resolve(requireText(attemptDir, 'attemptDir')), 'Attempt output root');
  const resolvedSkill = assertWithin(canonicalSource, path.resolve(requireText(skillPath, 'skillPath')), 'Skill repository root');
  if (resolvedSkill !== path.join(canonicalSource, 'SKILL.md')) {
    throw new Error('Skill path must be the canonical repository-current SKILL.md.');
  }
  const resolvedFixture = fixturePath === undefined ? undefined
    : assertWithin(path.join(canonicalSource, 'evals', 'fixtures'), path.resolve(requireText(fixturePath, 'fixturePath')), 'Fixture repository root');
  const skillSha256 = await sha256File(resolvedSkill);
  if (resolvedFixture !== undefined) {
    const fixtureRootStats = await lstat(resolvedFixture);
    if (!fixtureRootStats.isDirectory() || fixtureRootStats.isSymbolicLink()) {
      throw new Error('Fixture root must be a real directory, not a symbolic link or junction.');
    }
  }
  const fixtureSource = resolvedFixture === undefined ? undefined : await hashTree(resolvedFixture);
  for (const userDirectory of ['.agents', '.codex']) {
    const prefix = `${userDirectory}/skills/${SKILL_NAME}`;
    if (Object.keys(fixtureSource?.files ?? {}).some((file) => file === prefix || file.startsWith(`${prefix}/`))) {
      throw new Error(`Fixture must not contain the accelerator Skill payload: ${prefix}`);
    }
  }
  try {
    await mkdir(resolvedAttempt);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Attempt directory already exists: ${resolvedAttempt}`);
    }
    throw error;
  }
  const workspaceDir = path.join(resolvedAttempt, 'workspace');
  await mkdir(workspaceDir);
  if (resolvedFixture !== undefined) {
    await cp(resolvedFixture, workspaceDir, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  const fixtureCopy = await hashTree(workspaceDir);
  if (fixtureSource !== undefined && fixtureCopy.sha256 !== fixtureSource.sha256) {
    throw new Error('Copied fixture tree identity does not match its canonical source.');
  }
  const targetDir = path.join(workspaceDir, '.codex', 'skills', SKILL_NAME);
  let stagedSkillSha256 = null;
  if (variant === 'with_skill') {
    await mkdir(targetDir, { recursive: true });
    const stagedSkillPath = path.join(targetDir, 'SKILL.md');
    await copyFile(resolvedSkill, stagedSkillPath);
    stagedSkillSha256 = await sha256File(stagedSkillPath);
    if (stagedSkillSha256 !== skillSha256) {
      throw new Error('Staged Skill identity does not match repository-current SKILL.md.');
    }
  } else if (variant !== 'without_skill') {
    throw new TypeError(`Unknown evaluation variant: ${variant}`);
  }
  const initialTree = await hashTree(workspaceDir);
  return {
    attemptDir: resolvedAttempt,
    workspaceDir,
    identities: {
      skill_sha256: skillSha256,
      staged_skill_sha256: stagedSkillSha256,
      fixture_source_sha256: fixtureSource?.sha256 ?? null,
      fixture_copy_sha256: fixtureCopy.sha256,
    },
    initialFiles: initialTree.files,
  };
}

export function parseNativeJsonl(text) {
  const lines = requireText(text, 'JSONL').split(/\r?\n/u).filter((line) => line.length > 0);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new SyntaxError(`Invalid native JSONL at line ${index + 1}: ${error.message}`);
    }
  });
}

function normalizeCommand(command) {
  return requireText(command, 'command').trim().replace(/\s+/gu, ' ');
}

function hasUsableLifecycleId(id) {
  return typeof id === 'string' && id.trim().length > 0;
}

function requiresLifecycle(item) {
  return item?.type === 'command_execution'
    || /tool|collab|worker|session/iu.test(item?.type ?? '');
}

function isLifecycleEvidence(event) {
  return /^(?:thread|turn|item)\./u.test(event?.type ?? '') || requiresLifecycle(event?.item);
}

/** 只相信原生事件顺序；subject 文字总结不能补齐缺失生命周期。 */
export function validateNativeTrace(events, {
  requiredCommands = [],
  enforceRequiredCommandCompletionOrder = true,
} = {}) {
  if (!Array.isArray(events) || events[0]?.type !== 'thread.started') {
    throw new Error('Native trace must begin with thread.started.');
  }
  const turnStarted = events.findIndex(({ type }) => type === 'turn.started');
  const turnCompletions = events
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value.type === 'turn.completed');
  if (turnCompletions.length !== 1) {
    throw new Error('Native trace requires exactly one successful turn completion.');
  }
  const turnCompleted = turnCompletions[0].index;
  if (events.some(({ type }) => type === 'error' || type === 'turn.failed')) {
    throw new Error('Native trace contains a top-level or turn failure.');
  }
  if (turnStarted <= 0 || turnCompleted <= turnStarted) {
    throw new Error('Native turn lifecycle order is invalid.');
  }
  if (events.slice(turnCompleted + 1).some(isLifecycleEvidence)) {
    throw new Error('Native turn completion must be the terminal lifecycle event.');
  }

  const startedById = new Map();
  const completedIds = new Set();
  const commandIntervals = [];
  // 命令完成必须回连同一原生 ID 与规范化命令，避免按文本重组出虚假区间。
  for (const { value, index } of events.map((value, index) => ({ value, index }))) {
    const id = value?.item?.id;
    const isCommandLifecycle = value?.item?.type === 'command_execution'
      && ['item.started', 'item.completed'].includes(value?.type);
    if (isCommandLifecycle && !hasUsableLifecycleId(id)) {
      throw new Error('Command lifecycle requires a non-empty string ID.');
    }
    if (value?.type === 'item.started' && id !== undefined) {
      if (startedById.has(id)) {
        throw new Error(`Item ${id} has a duplicate lifecycle start.`);
      }
      startedById.set(id, index);
    }
    if (value?.type === 'item.completed' && id !== undefined) {
      const startIndex = startedById.get(id);
      const startedItem = events[startIndex]?.item;
      if (requiresLifecycle(value.item) && (startIndex === undefined || startIndex >= index)) {
        throw new Error(`Item ${id} completed outside lifecycle order.`);
      }
      // 同一原生 ID 的完成事件必须保持类型一致，不能借消息完成伪造命令闭合。
      if (startedItem !== undefined && startedItem.type !== value.item?.type) {
        throw new Error(`Item ${id} has a cross-type lifecycle completion.`);
      }
      if (completedIds.has(id)) {
        throw new Error(`Item ${id} has a duplicate lifecycle completion.`);
      }
      completedIds.add(id);
      if (value.item?.status && !['completed', 'success'].includes(value.item.status)) {
        throw new Error(`Item ${id} did not complete successfully.`);
      }
      if (value.item?.type === 'command_execution') {
        if (startedItem?.type !== 'command_execution') {
          throw new Error(`Command ${id} lacks a same-ID command lifecycle start.`);
        }
        const command = normalizeCommand(value.item.command);
        if (normalizeCommand(startedItem.command) !== command) {
          throw new Error(`Command ${id} changed normalized command identity before completion.`);
        }
        if (!['completed', 'success'].includes(value.item.status)) {
          throw new Error(`Command ${id} lacks an explicit successful completion status.`);
        }
        const exitCode = value.item.exit_code;
        if (typeof exitCode !== 'number' || !Number.isFinite(exitCode) || exitCode !== 0) {
          throw new Error(`Command ${id} requires numeric zero exit_code.`);
        }
        commandIntervals.push({ id, command, startIndex, completionIndex: index });
      }
    }
  }

  for (const [id, index] of startedById) {
    if (requiresLifecycle(events[index]?.item) && !completedIds.has(id)) {
      throw new Error(`Item ${id} has an orphan started lifecycle.`);
    }
  }

  const normalizedCompleted = commandIntervals.map(({ command, completionIndex }) => ({
    command,
    index: completionIndex,
  }));
  if (normalizedCompleted.some(({ command }) => TRAILING_BACKGROUND_COMMAND.test(command))) {
    throw new Error('Native trace rejects trailing shell background command substitutions.');
  }
  let previousIndex = -1;
  for (const required of requiredCommands) {
    const normalizedRequired = normalizeCommand(required);
    const matches = normalizedCompleted.filter(({ command }) => command === normalizedRequired);
    if (matches.length !== 1) {
      throw new Error(`Required exact command must complete once: ${required}`);
    }
    const [match] = matches;
    if (enforceRequiredCommandCompletionOrder && match.index <= previousIndex) {
      throw new Error(`Required command order is invalid: ${required}`);
    }
    previousIndex = match.index;
  }
  return {
    commands: normalizedCompleted.map(({ command }) => command),
    commandIntervals,
  };
}

export function validateShortTrace(events) {
  validateNativeTrace(events);
  for (const event of events) {
    const item = event?.item ?? {};
    const forbiddenTool = item.type !== 'command_execution' && FORBIDDEN_SHORT_TOOLS.test(JSON.stringify(item));
    const forbiddenCommand = item.type === 'command_execution'
      && FORBIDDEN_SHORT_COMMAND.test(item.command ?? '');
    if (forbiddenTool || forbiddenCommand) {
      throw new Error('Short trace contains a forbidden acceleration probe.');
    }
  }
}

function ownedDomain(prompt, expectedDomains) {
  if (typeof prompt !== 'string' || !/(?:^|\W)(?:own|owns|writer|write|edit)(?:\W|$)/iu.test(prompt)) {
    return null;
  }
  const matches = expectedDomains.filter((domain) => {
    const escaped = domain.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9_.-])${escaped}(?=$|[^a-z0-9_.-])`, 'iu').test(prompt);
  });
  return matches.length === 1 ? matches[0] : null;
}

/** keyed running state 到 terminal state 构成原生 worker 区间；只接受明确且唯一的写入归属声明。 */
export function validateWorkerEvidence(events, { expectedDomains } = {}) {
  validateNativeTrace(events);
  if (!Array.isArray(expectedDomains) || expectedDomains.length < 2
    || new Set(expectedDomains).size !== expectedDomains.length
    || expectedDomains.some((domain) => typeof domain !== 'string' || domain.length === 0)) {
    throw new Error('Native worker evidence requires at least two unique expected conflict domains.');
  }

  const startedById = new Map(events
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value.type === 'item.started' && typeof value.item?.id === 'string')
    .map(({ value, index }) => [value.item.id, { item: value.item, index }]));
  const writersByDomain = new Map();
  const workersByThread = new Map();

  for (const [index, event] of events.entries()) {
    const item = event?.item;
    if (event?.type !== 'item.completed' || item?.type !== 'collab_agent_tool_call'
      || item.tool !== 'spawn_agent') {
      continue;
    }
    const started = startedById.get(item.id);
    const threadIds = item.receiver_thread_ids;
    const conflictDomain = ownedDomain(started?.item?.prompt, expectedDomains);
    if (started?.item?.tool !== 'spawn_agent' || conflictDomain === null
      || !Array.isArray(threadIds) || threadIds.length !== 1
      || typeof threadIds[0] !== 'string' || threadIds[0].length === 0) {
      throw new Error('Native worker spawn lacks one explicit file-write ownership domain and one worker lifecycle ID.');
    }
    const [threadId] = threadIds;
    const spawnStates = item.agents_states;
    if (spawnStates === null || Array.isArray(spawnStates) || typeof spawnStates !== 'object'
      || Object.keys(spawnStates).length !== 1 || spawnStates[threadId]?.status !== 'running') {
      throw new Error('Native worker spawn lacks its keyed running lifecycle state.');
    }
    if (writersByDomain.has(conflictDomain) || workersByThread.has(threadId)) {
      throw new Error('Native worker evidence requires exactly one writer per conflict domain and worker ID.');
    }
    const worker = {
      thread_id: threadId,
      conflict_domain: conflictDomain,
      start_index: index,
      end_index: null,
    };
    writersByDomain.set(conflictDomain, worker);
    workersByThread.set(threadId, worker);
  }

  if (writersByDomain.size !== expectedDomains.length
    || expectedDomains.some((domain) => !writersByDomain.has(domain))) {
    throw new Error('Native worker evidence is missing an expected conflict-domain writer.');
  }

  for (const [index, event] of events.entries()) {
    const item = event?.item;
    if (event?.type !== 'item.completed' || item?.type !== 'collab_agent_tool_call'
      || item.tool !== 'wait') {
      continue;
    }
    const started = startedById.get(item.id);
    const states = item.agents_states;
    if (started?.item?.tool !== 'wait' || states === null || Array.isArray(states)
      || typeof states !== 'object') {
      throw new Error('Native worker terminal evidence lacks its wait lifecycle.');
    }
    // 原生 JSONL 以 worker ID 为 agents_states 的键；键和值必须同时可归属，不能靠总结文字补全。
    for (const [threadId, state] of Object.entries(states)) {
      const worker = workersByThread.get(threadId);
      if (worker === undefined) {
        throw new Error('Native worker terminal evidence names an unowned worker lifecycle.');
      }
      if (state?.status !== 'completed') {
        continue;
      }
      if (worker.end_index !== null) {
        throw new Error('Native worker lifecycle has duplicate terminal evidence.');
      }
      worker.end_index = index;
    }
  }

  const intervals = [...workersByThread.values()];
  if (intervals.some(({ start_index: start, end_index: end }) => end === null || start >= end)) {
    throw new Error('Native worker evidence is missing a complete execution interval.');
  }
  const overlapStart = Math.max(...intervals.map(({ start_index: start }) => start));
  const overlapEnd = Math.min(...intervals.map(({ end_index: end }) => end));
  if (overlapStart >= overlapEnd) {
    throw new Error('Native worker execution intervals require positive overlap.');
  }

  intervals.sort((left, right) => left.conflict_domain.localeCompare(right.conflict_domain, 'en'));
  return {
    domains: [...writersByDomain.keys()].sort((left, right) => left.localeCompare(right, 'en')),
    intervals,
    overlap: { start_index: overlapStart, end_index: overlapEnd },
    positive_overlap: true,
  };
}

/** wait subject 以区间协议替代互斥的完成序，但仍保留全部 exact-once 与成功门。 */
export function validateWaitOverlap(events, {
  longCommand,
  usefulWorkCommand,
  testCommand,
  requiredCommands = [longCommand, usefulWorkCommand, testCommand],
}) {
  const validated = validateNativeTrace(events, {
    requiredCommands,
    enforceRequiredCommandCompletionOrder: false,
  });
  const longNormalized = normalizeCommand(longCommand);
  const workNormalized = normalizeCommand(usefulWorkCommand);
  const testNormalized = normalizeCommand(testCommand);
  const longInterval = validated.commandIntervals.find(({ command }) => command === longNormalized);
  const workInterval = validated.commandIntervals.find(({ command }) => command === workNormalized);
  const testInterval = validated.commandIntervals.find(({ command }) => command === testNormalized);
  if (!longInterval || !workInterval || !testInterval
    || !(longInterval.startIndex < workInterval.startIndex
      && workInterval.startIndex < workInterval.completionIndex
      && workInterval.completionIndex < longInterval.completionIndex
      && longInterval.completionIndex < testInterval.startIndex
      && testInterval.startIndex < testInterval.completionIndex)) {
    throw new Error('Wait protocol requires useful work strictly inside the corpus interval and the test after corpus completion.');
  }
  return validated;
}

async function assertFinalSkillState(workspaceDir, variant, expectedSha256) {
  const targets = ['.agents', '.codex'].map((directory) => (
    path.join(workspaceDir, directory, 'skills', SKILL_NAME)
  ));
  if (variant === 'without_skill') {
    for (const target of targets) {
      try {
        await lstat(target);
        throw new Error(`Baseline created same-name Skill state: ${target}`);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }
    return;
  }

  const [agentsTarget, codexTarget] = targets;
  try {
    await lstat(agentsTarget);
    throw new Error(`With-Skill subject created duplicate same-name Skill state: ${agentsTarget}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  const targetStats = await lstat(codexTarget);
  if (!targetStats.isDirectory() || targetStats.isSymbolicLink()) {
    throw new Error('Staged Skill root must be a real directory.');
  }
  const entries = await readdir(codexTarget, { withFileTypes: true });
  if (entries.length !== 1 || entries[0].name !== 'SKILL.md' || !entries[0].isFile()) {
    throw new Error('Staged Skill subtree must contain only its regular SKILL.md file.');
  }
  if (await sha256File(path.join(codexTarget, 'SKILL.md')) !== expectedSha256) {
    throw new Error('Final staged Skill identity does not match repository-current SKILL.md.');
  }
}

function waitForClose(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });
}

function errorText(error) {
  const code = typeof error?.code === 'string' ? `${error.code}: ` : '';
  return `${code}${error?.message ?? String(error)}`;
}

async function destroyStreams(streams) {
  await Promise.all(streams.map(async (stream) => {
    if (stream === undefined) {
      return;
    }
    stream.destroy();
    await finished(stream).catch(() => {});
  }));
}

async function teardownChild(child, ownedStreams) {
  try {
    child?.kill?.();
  } catch {}
  child?.stdin?.destroy();
  await destroyStreams([child?.stdout, child?.stderr, ...ownedStreams]);
}

async function writeFailureSummary(attemptDir, summary) {
  await writeFile(
    path.join(attemptDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    { flag: 'wx' },
  ).catch(() => {});
}

/** 四个流端点在拥有期内共享首错门；后续错误只被吸收，拆卸完成后才移除监听。 */
export async function runLeanAttempt({
  sourceRoot,
  outputRoot,
  attemptDir,
  variant,
  skillPath,
  fixturePath,
  prompt,
  requiredCommands = [],
  mode = 'generic',
  waitExpectation,
  workerExpectation,
  spawnImpl = spawn,
  createWriteStreamImpl = createWriteStream,
  userHome,
  launcher,
  multiAgent = true,
  promptSha256 = digestText(prompt),
  allowedPaths = [],
  environment = process.env,
  nowNs = process.hrtime.bigint,
}) {
  const startedNs = nowNs();
  const prepared = await prepareAttempt({
    sourceRoot, outputRoot, attemptDir, variant, skillPath, fixturePath,
  });
  const resolvedLauncher = launcher ?? await resolveCodexLaunch();
  const invocation = buildCodexInvocation({
    workspaceDir: prepared.workspaceDir,
    prompt,
    userHome,
    multiAgent,
    launcher: resolvedLauncher,
  });
  const jsonlPath = path.join(prepared.attemptDir, 'native-events.jsonl');
  const stderrPath = path.join(prepared.attemptDir, 'stderr.txt');
  const knownPaths = { jsonl: jsonlPath, stderr: stderrPath };
  let stdout;
  let stderr;
  let child;
  let firstStreamError;
  let streamErrorSeen = false;
  let resolveStreamError;
  const streamError = new Promise((resolve) => {
    resolveStreamError = resolve;
  });
  const observedStreams = new Set();
  const handleStreamError = (error) => {
    if (!streamErrorSeen) {
      streamErrorSeen = true;
      firstStreamError = error;
      resolveStreamError(error);
    }
  };
  const observeStream = (stream) => {
    if (!observedStreams.has(stream)) {
      stream.on('error', handleStreamError);
      observedStreams.add(stream);
    }
  };
  const stopObservingStreams = () => {
    for (const stream of observedStreams) {
      stream.removeListener('error', handleStreamError);
    }
    observedStreams.clear();
  };
  const failAttempt = async (phase, error, processResult = { exitCode: null, signal: null }) => {
    await teardownChild(child, [stdout, stderr]);
    stopObservingStreams();
    const summary = {
      valid: false,
      phase,
      error: errorText(error),
      elapsed_ns: String(nowNs() - startedNs),
      paths: knownPaths,
    };
    await writeFailureSummary(prepared.attemptDir, summary);
    return { ...prepared, ...processResult, jsonlPath, stderrPath, summary };
  };
  try {
    stdout = createWriteStreamImpl(jsonlPath, { flags: 'wx' });
    observeStream(stdout);
    stderr = createWriteStreamImpl(stderrPath, { flags: 'wx' });
    observeStream(stderr);
  } catch (error) {
    return failAttempt('stream', error);
  }
  try {
    child = spawnImpl(invocation.command, invocation.args, {
      cwd: prepared.workspaceDir,
      env: buildSubjectEnvironment(environment),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    return failAttempt('spawn', error);
  }
  const childOutcome = waitForClose(child).then(
    (processResult) => ({ processResult }),
    (error) => ({ phase: 'child', error }),
  );
  let stdinDone;
  try {
    observeStream(child.stdout);
    observeStream(child.stderr);
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    stdinDone = finished(child.stdin, { readable: false }).then(() => null, (error) => error);
    child.stdin.end(invocation.stdin);
  } catch (error) {
    return failAttempt('stream', error);
  }
  const never = new Promise(() => {});
  const firstOutcome = await Promise.race([
    childOutcome,
    streamError.then((error) => ({ phase: 'stream', error })),
    stdinDone.then((error) => (error === null ? never : { phase: 'stdin', error })),
  ]);
  if (firstOutcome.phase !== undefined) {
    return failAttempt(firstOutcome.phase, firstOutcome.error);
  }
  const { processResult } = firstOutcome;
  if (streamErrorSeen) {
    return failAttempt('stream', firstStreamError, processResult);
  }
  const stdinError = await stdinDone;
  if (stdinError !== null) {
    return failAttempt('stdin', stdinError, processResult);
  }
  try {
    await Promise.all([
      finished(child.stdout),
      finished(child.stderr),
      finished(stdout),
      finished(stderr),
    ]);
    if (streamErrorSeen) {
      throw firstStreamError;
    }
  } catch (error) {
    return failAttempt('stream', streamErrorSeen ? firstStreamError : error, processResult);
  }
  stopObservingStreams();
  await writeFile(path.join(prepared.attemptDir, 'exit.json'), `${JSON.stringify(processResult, null, 2)}\n`, { flag: 'wx' });

  let summary;
  let events;
  try {
    if (processResult.exitCode !== 0) {
      const error = new Error(`codex exec exited with code ${processResult.exitCode}.`);
      error.phase = 'process';
      throw error;
    }
    try {
      events = parseNativeJsonl(await readFile(jsonlPath, 'utf8'));
    } catch (error) {
      error.phase = 'parse';
      throw error;
    }
    const validated = mode === 'wait'
      ? validateWaitOverlap(events, { ...waitExpectation, requiredCommands })
      : validateNativeTrace(events, { requiredCommands });
    if (mode === 'short') {
      validateShortTrace(events);
    } else if (mode === 'worker') {
      validated.worker = validateWorkerEvidence(events, workerExpectation);
    }
    const finalTree = await hashTree(prepared.workspaceDir);
    await assertFinalSkillState(prepared.workspaceDir, variant, prepared.identities.skill_sha256);
    const allPaths = [...new Set([...Object.keys(prepared.initialFiles), ...Object.keys(finalTree.files)])].sort();
    const changedFiles = allPaths.filter((file) => prepared.initialFiles[file] !== finalTree.files[file]);
    const allowed = changedFiles.every((file) => allowedPaths.includes(file));
    if (!allowed) {
      throw new Error('Workspace changed outside the allowed file boundary.');
    }
    summary = {
      valid: true,
      eventCount: events.length,
      commands: validated.commands,
      worker: validated.worker ?? null,
      elapsed_ns: String(nowNs() - startedNs),
      process: processResult,
      identities: { ...prepared.identities, prompt_sha256: promptSha256 },
      files: { initial: prepared.initialFiles, final: finalTree.files, changed: changedFiles, allowed },
      paths: { jsonl: jsonlPath, stderr: stderrPath },
    };
  } catch (error) {
    summary = {
      valid: false,
      phase: error.phase ?? 'validation',
      error: errorText(error),
      commands: [],
      elapsed_ns: String(nowNs() - startedNs),
      process: processResult,
      identities: { ...prepared.identities, prompt_sha256: promptSha256 },
      paths: { jsonl: jsonlPath, stderr: stderrPath },
    };
  }
  await writeFile(path.join(prepared.attemptDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  return { ...prepared, ...processResult, jsonlPath, stderrPath, summary };
}
