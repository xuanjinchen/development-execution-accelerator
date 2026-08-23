import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  MAX_SUBJECT_PROCESSES,
  assertProcessBudget,
  buildCodexInvocation,
  buildSubjectEnvironment,
  buildSubjectPlan,
  parseNativeJsonl,
  parseCampaignArgs,
  prepareAttempt,
  resolveCodexLaunch,
  runLeanAttempt,
  runLeanCampaign,
  summarizeCampaign,
  validateNativeTrace,
  validateShortTrace,
  validateWaitOverlap,
  validateWorkerEvidence,
} from '../src/lean-evaluation.js';

const neutralLongPrompt = 'Implement the two approved modules, run their focused checks, then run the required aggregate check.';
const neutralShortPrompt = 'Correct the finite-number behavior and run the focused check followed by the aggregate check.';

function event(type, item) {
  return item === undefined ? { type } : { type, item };
}

function completedCommand(id, command) {
  return [
    event('item.started', { id, type: 'command_execution', command }),
    event('item.completed', {
      id, type: 'command_execution', command, status: 'completed', exit_code: 0,
    }),
  ];
}

function completedWorkerTrace() {
  return [
    event('thread.started'),
    event('turn.started'),
    event('item.started', {
      id: 'spawn-catalog',
      type: 'collab_agent_tool_call',
      tool: 'spawn_agent',
      prompt: 'Own src/catalog only and return its focused-check evidence.',
    }),
    event('item.completed', {
      id: 'spawn-catalog',
      type: 'collab_agent_tool_call',
      tool: 'spawn_agent',
      status: 'completed',
      receiver_thread_ids: ['worker-catalog'],
      prompt: 'Own src/catalog only and return its focused-check evidence.',
      agents_states: { 'worker-catalog': { status: 'running', message: null } },
    }),
    event('item.started', {
      id: 'spawn-billing',
      type: 'collab_agent_tool_call',
      tool: 'spawn_agent',
      prompt: 'Own src/billing only and return its focused-check evidence.',
    }),
    event('item.completed', {
      id: 'spawn-billing',
      type: 'collab_agent_tool_call',
      tool: 'spawn_agent',
      status: 'completed',
      receiver_thread_ids: ['worker-billing'],
      prompt: 'Own src/billing only and return its focused-check evidence.',
      agents_states: { 'worker-billing': { status: 'running', message: null } },
    }),
    event('item.started', {
      id: 'wait-workers',
      type: 'collab_agent_tool_call',
      tool: 'wait',
      receiver_thread_ids: ['worker-catalog', 'worker-billing'],
    }),
    event('item.completed', {
      id: 'wait-workers',
      type: 'collab_agent_tool_call',
      tool: 'wait',
      status: 'completed',
      receiver_thread_ids: ['worker-catalog', 'worker-billing'],
      agents_states: {
        'worker-catalog': { status: 'completed', message: 'catalog complete' },
        'worker-billing': { status: 'completed', message: 'billing complete' },
      },
    }),
    event('turn.completed'),
  ];
}

function completedJsonlChild(raw, { beforeClose = async () => {}, stderr = '' } = {}) {
  const child = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  queueMicrotask(async () => {
    try {
      await beforeClose();
      child.stdout.end(raw);
      child.stderr.end(stderr);
      child.emit('close', 0, null);
    } catch (error) {
      child.emit('error', error);
    }
  });
  return child;
}

for (const [mode, multiAgent] of [['pilot', false], ['formal', true]]) {
  test(`builds the fixed restricted codex exec JSONL invocation for ${mode}`, () => {
    const invocation = buildCodexInvocation({
      workspaceDir: path.resolve('subject-workspace'),
      prompt: neutralLongPrompt,
      userHome: 'C:/Users/tester',
      multiAgent,
    });

    assert.equal(invocation.command, 'codex');
    assert.deepEqual(invocation.args, [
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
      `skills.config=[{path=${JSON.stringify(path.resolve('C:/Users/tester/.agents/skills/development-execution-accelerator').split(path.sep).join('/'))},enabled=false},{path=${JSON.stringify(path.resolve('C:/Users/tester/.codex/skills/development-execution-accelerator').split(path.sep).join('/'))},enabled=false}]`,
      '--config',
      `features.multi_agent=${multiAgent}`,
      '--config',
      `agents.enabled=${multiAgent}`,
      '--config',
      'approval_policy="never"',
      '--cd',
      path.resolve('subject-workspace'),
      '--skip-git-repo-check',
      '-',
    ]);
    assert.equal(invocation.stdin, neutralLongPrompt);
  });
}

test('passes only the documented subject environment allowlist', () => {
  const source = {
    PATH: 'tools', PATHEXT: '.CMD', SystemRoot: 'C:/example/Windows', COMSPEC: 'C:/example/Windows/System32/cmd.exe',
    USERPROFILE: 'C:/Users/tester', APPDATA: 'C:/Users/tester/AppData/Roaming', LOCALAPPDATA: 'C:/Users/tester/AppData/Local',
    TEMP: 'C:/temp', TMP: 'C:/temp', LANG: 'en_US.UTF-8', LC_ALL: 'C.UTF-8', NODE_OPTIONS: '--no-warnings',
    CODEX_HOME: 'C:/Users/tester/.codex', GIT_CONFIG_NOSYSTEM: '1', npm_config_cache: 'C:/tmp/npm-cache',
    OPENAI_API_KEY: 'secret', HTTPS_PROXY: 'credential', RANDOM_SECRET: 'secret', npm_config_token: 'secret',
  };
  assert.deepEqual(buildSubjectEnvironment(source), {
    PATH: 'tools', PATHEXT: '.CMD', SystemRoot: 'C:/example/Windows', COMSPEC: 'C:/example/Windows/System32/cmd.exe',
    USERPROFILE: 'C:/Users/tester', APPDATA: 'C:/Users/tester/AppData/Roaming', LOCALAPPDATA: 'C:/Users/tester/AppData/Local',
    TEMP: 'C:/temp', TMP: 'C:/temp', LANG: 'en_US.UTF-8', LC_ALL: 'C.UTF-8',
    CODEX_HOME: 'C:/Users/tester/.codex', npm_config_cache: 'C:/tmp/npm-cache',
  });
});

test('matches Windows subject environment names case-insensitively while preserving host spelling', () => {
  const source = {
    Path: 'C:/fixture/tools',
    ComSpec: 'C:/example/Windows/System32/cmd.exe',
    SystemRoot: 'C:/example/Windows',
    UserProfile: 'C:/Users/tester',
    AppData: 'C:/Users/tester/AppData/Roaming',
    LocalAppData: 'C:/Users/tester/AppData/Local',
    Codex_Home: 'C:/Users/tester/.codex',
    Temp: 'C:/temp',
    Lang: 'en_US.UTF-8',
    npm_config_cache: 'C:/tmp/npm-cache',
    OPENAI_API_KEY: 'redacted-fixture',
    HTTPS_PROXY: 'redacted-fixture',
    npm_config_token: 'redacted-fixture',
  };

  const subjectEnvironment = buildSubjectEnvironment(source, 'win32');
  assert.deepEqual(Object.keys(subjectEnvironment), [
    'Path', 'ComSpec', 'SystemRoot', 'UserProfile', 'AppData', 'LocalAppData',
    'Codex_Home', 'Temp', 'Lang', 'npm_config_cache',
  ]);
  assert.equal(subjectEnvironment.Path, 'C:/fixture/tools');
  assert.equal(subjectEnvironment.ComSpec, 'C:/example/Windows/System32/cmd.exe');
  for (const excluded of ['OPENAI_API_KEY', 'HTTPS_PROXY', 'npm_config_token']) {
    assert.equal(Object.hasOwn(subjectEnvironment, excluded), false);
  }

  assert.deepEqual(buildSubjectEnvironment({ Path: 'wrong-case', PATH: 'usable' }, 'linux'), {
    PATH: 'usable',
  });
});

test('resolves a Windows npm shim to the real Codex JavaScript entry without a shell', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-codex-shim-'));
  const entryPath = path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  await mkdir(path.dirname(entryPath), { recursive: true });
  await writeFile(path.join(root, 'codex.cmd'), '@echo off', 'utf8');
  await writeFile(entryPath, '#!/usr/bin/env node', 'utf8');

  assert.deepEqual(await resolveCodexLaunch({
    platform: 'win32',
    pathValue: root,
    pathExt: '.COM;.EXE;.BAT;.CMD',
    execPath: 'C:/fixture/runtime/node.exe',
  }), {
    command: path.resolve('C:/fixture/runtime/node.exe'),
    prefixArgs: [entryPath],
    entryPath,
  });
});

test('preserves a failure summary when spawn throws synchronously', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-spawn-sync-'));
  const skillPath = path.join(root, 'SKILL.md');
  await writeFile(skillPath, 'skill bytes', 'utf8');

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    spawnImpl() {
      const error = new Error('Windows shim rejected');
      error.code = 'EPERM';
      throw error;
    },
  });

  assert.equal(result.summary.valid, false);
  assert.equal(result.summary.phase, 'spawn');
  assert.match(result.summary.error, /EPERM|Windows shim rejected/iu);
  assert.equal(typeof result.summary.elapsed_ns, 'string');
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'attempt', 'summary.json'), 'utf8')), result.summary);
});

test('preserves a failure summary when the child emits error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-child-error-'));
  const skillPath = path.join(root, 'SKILL.md');
  await writeFile(skillPath, 'skill bytes', 'utf8');

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    spawnImpl() {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      queueMicrotask(() => {
        const error = new Error('child launch failed');
        error.code = 'ENOENT';
        child.emit('error', error);
      });
      return child;
    },
  });

  assert.equal(result.summary.valid, false);
  assert.equal(result.summary.phase, 'child');
  assert.match(result.summary.error, /ENOENT|child launch failed/iu);
  assert.equal(typeof result.summary.elapsed_ns, 'string');
});

test('stream failure summary handles early stdout and stderr errors', async () => {
  const raw = `${[
    event('thread.started'), event('turn.started'), event('turn.completed'),
  ].map((value) => JSON.stringify(value)).join('\n')}\n`;
  for (const [label, failingIndex] of [['stdout', 0], ['stderr', 1]]) {
    const root = await mkdtemp(path.join(os.tmpdir(), `lean-${label}-error-`));
    const skillPath = path.join(root, 'SKILL.md');
    await writeFile(skillPath, 'skill bytes', 'utf8');
    let streamIndex = 0;
    const result = await runLeanAttempt({
      sourceRoot: root,
      outputRoot: root,
      attemptDir: path.join(root, 'attempt'),
      variant: 'with_skill',
      skillPath,
      prompt: neutralLongPrompt,
      launcher: { command: 'codex', prefixArgs: [] },
      createWriteStreamImpl() {
        const stream = new PassThrough();
        const currentIndex = streamIndex;
        streamIndex += 1;
        if (currentIndex === failingIndex) {
          queueMicrotask(() => {
            const error = new Error(`${label} open failed`);
            error.code = label === 'stdout' ? 'EACCES' : 'ENOSPC';
            stream.emit('error', error);
          });
        }
        return stream;
      },
      spawnImpl() {
        return completedJsonlChild(raw);
      },
    });

    assert.equal(result.summary.valid, false);
    assert.equal(result.summary.phase, 'stream');
    assert.match(result.summary.error, /EACCES|ENOSPC|open failed/iu);
    assert.equal(typeof result.summary.elapsed_ns, 'string');
    assert.deepEqual(result.summary.paths, {
      jsonl: path.join(root, 'attempt', 'native-events.jsonl'),
      stderr: path.join(root, 'attempt', 'stderr.txt'),
    });
    assert.deepEqual(
      JSON.parse(await readFile(path.join(root, 'attempt', 'summary.json'), 'utf8')),
      result.summary,
    );
  }
});

test('stream failure summary contains a source-stream EIO without crashing or hanging', { timeout: 2000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-source-stream-error-'));
  const skillPath = path.join(root, 'SKILL.md');
  await writeFile(skillPath, 'skill bytes', 'utf8');

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    launcher: { command: 'codex', prefixArgs: [] },
    spawnImpl() {
      const child = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      queueMicrotask(() => {
        const error = new Error('source read failed');
        error.code = 'EIO';
        try {
          child.stdout.emit('error', error);
        } finally {
          child.stdout.end();
          child.stderr.end();
          child.emit('close', 1, null);
        }
      });
      return child;
    },
  });

  assert.equal(result.summary.valid, false);
  assert.equal(result.summary.phase, 'stream');
  assert.match(result.summary.error, /EIO.*source read failed/iu);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, 'attempt', 'summary.json'), 'utf8')),
    result.summary,
  );
});

test('stream failure summary preserves the first of two destination errors', { timeout: 2000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-repeated-stream-error-'));
  const skillPath = path.join(root, 'SKILL.md');
  await writeFile(skillPath, 'skill bytes', 'utf8');
  let streamIndex = 0;

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    launcher: { command: 'codex', prefixArgs: [] },
    createWriteStreamImpl() {
      const stream = new PassThrough();
      if (streamIndex === 0) {
        queueMicrotask(() => {
          const first = new Error('first destination failure');
          first.code = 'ENOSPC';
          const second = new Error('second destination failure');
          second.code = 'EIO';
          stream.emit('error', first);
          stream.emit('error', second);
        });
      }
      streamIndex += 1;
      return stream;
    },
    spawnImpl() {
      const child = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      return child;
    },
  });

  assert.equal(result.summary.valid, false);
  assert.equal(result.summary.phase, 'stream');
  assert.match(result.summary.error, /ENOSPC.*first destination failure/iu);
  assert.doesNotMatch(result.summary.error, /second destination failure/iu);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, 'attempt', 'summary.json'), 'utf8')),
    result.summary,
  );
});

test('freezes the 11-process allocation and keeps only long pairs neutral', () => {
  const plan = buildSubjectPlan({
    longTaskPrompt: neutralLongPrompt,
    fallbackPilotPrompt: 'Complete the approved work with multi-agent disabled.',
    shortTaskPrompt: neutralShortPrompt,
    waitTaskPrompt: 'Complete the approved reporting change and all required checks.',
    implicitPositivePrompt: 'Implement the approved multi-module change and its required verification chain.',
    nearMissPrompt: 'Implement both approved modules serially with the main Agent only and do not use parallel execution.',
  });

  assert.equal(plan.length, MAX_SUBJECT_PROCESSES);
  assert.equal(plan[0].prompt, 'Complete the approved work with multi-agent disabled.');
  assert.deepEqual(
    plan.filter(({ scenario }) => scenario === 'long').map(({ variant }) => variant),
    ['with_skill', 'with_skill', 'without_skill', 'without_skill', 'with_skill', 'with_skill', 'without_skill'],
  );
  for (const pairId of ['long-1', 'long-2', 'long-3']) {
    const pair = plan.filter((subject) => subject.pairId === pairId);
    assert.equal(pair.length, 2);
    assert.equal(Buffer.compare(Buffer.from(pair[0].prompt), Buffer.from(pair[1].prompt)), 0);
    assert.doesNotMatch(pair[0].prompt, /skill|worker|parallel|serial/iu);
  }
  const shortSubjects = plan.filter(({ scenario }) => scenario === 'short');
  assert.equal(shortSubjects.length, 1);
  assert.equal(shortSubjects[0].variant, 'with_skill');
  assert.match(shortSubjects[0].prompt, /^\$development-execution-accelerator\b/u);
  assert.match(plan.at(-1).prompt, /serially|main Agent only/iu);
  assert.throws(() => assertProcessBudget([...plan, { id: 'subject-12' }]), /11 subject processes/iu);
});

test('runs only the fixed fresh 11-subject campaign and excludes pilot from timing', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-campaign-source-'));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-campaign-output-'));
  await writeFile(path.join(repoRoot, 'SKILL.md'), 'current skill', 'utf8');
  for (const fixture of ['long-task', 'short-task', 'wait-overlap']) {
    const fixturePath = path.join(repoRoot, 'evals', 'fixtures', fixture);
    await mkdir(fixturePath, { recursive: true });
    await writeFile(path.join(fixturePath, 'fixture.txt'), fixture, 'utf8');
  }
  const prompts = {
    'EVAL-001': 'Approved long catalog and billing work.',
    'EVAL-003': 'Approved foreground fallback pilot.',
    'EVAL-004': 'Approved short value fix.',
    'EVAL-008': 'Approved wait-overlap reporting work.',
    'EVAL-010': 'Approved long work; execute serially with the main Agent only.',
    'EVAL-011': 'Approved implicit long positive.',
  };
  await writeFile(path.join(repoRoot, 'evals', 'evals.json'), JSON.stringify({
    evals: Object.entries(prompts).map(([id, prompt]) => ({ id, prompt })),
  }), 'utf8');
  const observed = [];
  const durations = {
    'pilot-with-skill': 9999,
    'long-1-with': 80, 'long-1-without': 100,
    'long-2-with': 70, 'long-2-without': 90,
    'long-3-with': 90, 'long-3-without': 110,
  };
  const campaign = await runLeanCampaign({
    repoRoot,
    outputRoot,
    campaignName: 'fixed-campaign',
    runAttempt: async (config) => {
      observed.push(config);
      return { summary: { valid: true, elapsed_ns: String(durations[config.subject.id] ?? 10) } };
    },
  });

  assert.deepEqual(observed.map(({ subject }) => subject.id), [
    'pilot-with-skill', 'long-1-with', 'long-1-without', 'long-2-without', 'long-2-with',
    'long-3-with', 'long-3-without', 'short-explicit', 'wait-overlap', 'implicit-positive', 'near-miss-negative',
  ]);
  assert.equal(observed[0].multiAgent, false);
  assert.equal(observed[0].prompt, prompts['EVAL-003']);
  assert.equal(observed.slice(1).every(({ multiAgent }) => multiAgent === true), true);
  const workerSubjects = observed.filter(({ mode }) => mode === 'worker');
  assert.deepEqual(workerSubjects.map(({ subject }) => subject.id), [
    'long-1-with', 'long-2-with', 'long-3-with', 'implicit-positive',
  ]);
  assert.equal(workerSubjects.every(({ workerExpectation }) => (
    workerExpectation.expectedDomains.join(',') === 'src/catalog,src/billing'
  )), true);
  assert.equal(observed.at(-1).prompt, prompts['EVAL-010']);
  assert.equal(observed.find(({ subject }) => subject.id === 'implicit-positive').prompt, prompts['EVAL-011']);
  assert.equal(campaign.result.performance.pilot_excluded, true);
  assert.equal(campaign.result.performance.with_skill_median_ns, '80');
  assert.equal(campaign.result.performance.without_skill_median_ns, '100');
  assert.equal(campaign.result.performance.meets_twenty_percent, true);
  assert.equal((await readFile(path.join(campaign.campaignDir, 'manifest.json'), 'utf8')).includes(prompts['EVAL-001']), false);
  await assert.rejects(runLeanCampaign({
    repoRoot, outputRoot, campaignName: 'fixed-campaign', runAttempt: async () => {},
  }), /already exists/iu);
});

test('stops the campaign after an invalid pilot while preserving its result', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-pilot-gate-source-'));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-pilot-gate-output-'));
  await writeFile(path.join(repoRoot, 'SKILL.md'), 'current skill', 'utf8');
  for (const fixture of ['long-task', 'short-task', 'wait-overlap']) {
    const fixturePath = path.join(repoRoot, 'evals', 'fixtures', fixture);
    await mkdir(fixturePath, { recursive: true });
    await writeFile(path.join(fixturePath, 'fixture.txt'), fixture, 'utf8');
  }
  await writeFile(path.join(repoRoot, 'evals', 'evals.json'), JSON.stringify({
    evals: [
      { id: 'EVAL-001', prompt: 'Approved long catalog and billing work.' },
      { id: 'EVAL-003', prompt: 'Approved foreground fallback pilot.' },
      { id: 'EVAL-004', prompt: 'Approved short value fix.' },
      { id: 'EVAL-008', prompt: 'Approved wait-overlap reporting work.' },
      { id: 'EVAL-010', prompt: 'Approved long work; execute serially with the main Agent only.' },
      { id: 'EVAL-011', prompt: 'Approved implicit long positive.' },
    ],
  }), 'utf8');
  const observed = [];

  const campaign = await runLeanCampaign({
    repoRoot,
    outputRoot,
    campaignName: 'invalid-pilot',
    runAttempt: async (config) => {
      observed.push(config);
      return { summary: { valid: false, elapsed_ns: '1' } };
    },
  });

  assert.deepEqual(observed.map(({ subject }) => subject.id), ['pilot-with-skill']);
  assert.equal(observed[0].attemptDir.endsWith(path.join('invalid-pilot', 'pilot-with-skill')), true);
  assert.equal(campaign.result.attempts.length, 1);
  assert.equal(campaign.result.attempts[0].summary.valid, false);
  assert.equal(campaign.result.correctness_passed, false);
  assert.deepEqual(campaign.result.performance, { evaluated: false, pilot_excluded: true });
  const recordedResult = JSON.parse(await readFile(path.join(campaign.campaignDir, 'result.json'), 'utf8'));
  assert.equal(recordedResult.valid, false);
  assert.deepEqual(recordedResult.attempts.map(({ subject }) => subject.id), ['pilot-with-skill']);
  assert.deepEqual(recordedResult.performance, { evaluated: false, pilot_excluded: true });
});

test('campaign summary preserves failed attempts and withholds timing until correctness passes', () => {
  const subjects = buildSubjectPlan({
    longTaskPrompt: neutralLongPrompt,
    shortTaskPrompt: neutralShortPrompt,
    waitTaskPrompt: 'wait',
    implicitPositivePrompt: neutralLongPrompt,
    nearMissPrompt: 'execute the approved long work serially',
  });
  const attempts = subjects.map((subject) => ({
    subject,
    summary: { valid: subject.id !== 'long-2-with', elapsed_ns: '100' },
  }));
  const result = summarizeCampaign(attempts, '500');
  assert.equal(result.attempts.length, 11);
  assert.equal(result.correctness_passed, false);
  assert.deepEqual(result.performance, { evaluated: false, pilot_excluded: true });
});

test('campaign CLI accepts only safe output-root and campaign-name inputs', () => {
  assert.deepEqual(parseCampaignArgs(['--output-root', 'C:/tmp/runs', '--campaign-name', 'campaign-01']), {
    outputRoot: path.resolve('C:/tmp/runs'), campaignName: 'campaign-01',
  });
  assert.throws(() => parseCampaignArgs(['config.json']), /Usage/iu);
  assert.throws(() => parseCampaignArgs(['--output-root', 'C:/tmp/runs', '--campaign-name', '../escape']), /campaign name/iu);
  assert.throws(() => parseCampaignArgs(['--output-root', 'C:/tmp/runs', '--campaign-name', 'ok', '--subject', 'extra']), /Usage/iu);
});

test('creates a fresh isolated attempt and exposes only the current repo-scoped Skill', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-eval-'));
  const skillPath = path.join(root, 'SKILL.md');
  const fixturePath = path.join(root, 'evals', 'fixtures', 'fixture');
  const outputRoot = path.join(root, 'campaign');
  await mkdir(fixturePath, { recursive: true });
  await mkdir(outputRoot);
  await writeFile(path.join(fixturePath, 'fixture.txt'), 'frozen fixture', 'utf8');
  await writeFile(skillPath, 'current skill bytes', 'utf8');
  const withAttempt = path.join(outputRoot, 'with-skill');
  const baselineAttempt = path.join(outputRoot, 'baseline');

  const prepared = await prepareAttempt({
    sourceRoot: root, outputRoot, attemptDir: withAttempt, variant: 'with_skill', skillPath, fixturePath,
  });
  const stagedSkill = path.join(
    prepared.workspaceDir,
    '.codex',
    'skills',
    'development-execution-accelerator',
    'SKILL.md',
  );
  assert.equal(await readFile(stagedSkill, 'utf8'), 'current skill bytes');
  assert.equal(await readFile(path.join(prepared.workspaceDir, 'fixture.txt'), 'utf8'), 'frozen fixture');
  assert.equal(prepared.identities.skill_sha256, prepared.identities.staged_skill_sha256);
  assert.equal(prepared.identities.fixture_source_sha256, prepared.identities.fixture_copy_sha256);

  const baseline = await prepareAttempt({
    sourceRoot: root, outputRoot, attemptDir: baselineAttempt, variant: 'without_skill', skillPath, fixturePath,
  });
  for (const userDirectory of ['.agents', '.codex']) {
    await assert.rejects(readFile(path.join(baseline.workspaceDir, userDirectory, 'skills', 'development-execution-accelerator', 'SKILL.md')), /ENOENT/u);
  }
  await assert.rejects(prepareAttempt({
    sourceRoot: root, outputRoot, attemptDir: withAttempt, variant: 'with_skill', skillPath, fixturePath,
  }), /already exists/iu);
});

test('rejects fixture payloads, symlinks, and canonical root escapes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-identity-'));
  const outputRoot = path.join(root, 'output');
  const fixturesRoot = path.join(root, 'evals', 'fixtures');
  const skillPath = path.join(root, 'SKILL.md');
  await mkdir(outputRoot);
  await mkdir(fixturesRoot, { recursive: true });
  await writeFile(skillPath, 'skill', 'utf8');

  for (const userDirectory of ['.agents', '.codex']) {
    const fixturePath = path.join(fixturesRoot, `payload-${userDirectory.slice(1)}`);
    await mkdir(path.join(fixturePath, userDirectory, 'skills', 'development-execution-accelerator'), { recursive: true });
    await writeFile(path.join(fixturePath, userDirectory, 'skills', 'development-execution-accelerator', 'SKILL.md'), 'payload', 'utf8');
    await assert.rejects(prepareAttempt({
      sourceRoot: root, outputRoot, attemptDir: path.join(outputRoot, `payload-${userDirectory.slice(1)}`),
      variant: 'without_skill', skillPath, fixturePath,
    }), /payload/iu);
  }

  const linkedFixture = path.join(fixturesRoot, 'linked');
  await mkdir(linkedFixture);
  await writeFile(path.join(root, 'outside.txt'), 'outside', 'utf8');
  await symlink(path.join(root, 'outside.txt'), path.join(linkedFixture, 'link.txt'));
  await assert.rejects(prepareAttempt({
    sourceRoot: root, outputRoot, attemptDir: path.join(outputRoot, 'linked'),
    variant: 'without_skill', skillPath, fixturePath: linkedFixture,
  }), /symbolic link/iu);

  await assert.rejects(prepareAttempt({
    sourceRoot: root, outputRoot, attemptDir: path.join(root, 'escaped-attempt'),
    variant: 'without_skill', skillPath, fixturePath: linkedFixture,
  }), /output root/iu);
  await assert.rejects(prepareAttempt({
    sourceRoot: root, outputRoot, attemptDir: path.join(outputRoot, 'escaped-source'),
    variant: 'without_skill', skillPath: path.join(root, '..', 'SKILL.md'), fixturePath: linkedFixture,
  }), /repository root/iu);
});

test('fixture root identity rejects a source root that is a symlink or junction', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-root-link-'));
  const outputRoot = path.join(root, 'output');
  const fixturesRoot = path.join(root, 'evals', 'fixtures');
  const targetFixture = path.join(fixturesRoot, 'target');
  const linkedFixture = path.join(fixturesRoot, 'root-link');
  const skillPath = path.join(root, 'SKILL.md');
  await mkdir(targetFixture, { recursive: true });
  await mkdir(outputRoot);
  await writeFile(path.join(targetFixture, 'fixture.txt'), 'fixture', 'utf8');
  await writeFile(skillPath, 'skill', 'utf8');
  await symlink(targetFixture, linkedFixture, process.platform === 'win32' ? 'junction' : 'dir');

  await assert.rejects(prepareAttempt({
    sourceRoot: root,
    outputRoot,
    attemptDir: path.join(outputRoot, 'attempt'),
    variant: 'without_skill',
    skillPath,
    fixturePath: linkedFixture,
  }), /fixture root|symbolic link|junction/iu);
});

test('final-state identity rejects staged Skill deletion, tampering, extra state, and baseline state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-final-skill-'));
  const skillPath = path.join(root, 'SKILL.md');
  await writeFile(skillPath, 'current skill bytes', 'utf8');
  const raw = `${[
    event('thread.started'), event('turn.started'), event('turn.completed'),
  ].map((value) => JSON.stringify(value)).join('\n')}\n`;
  const stagedRelative = path.join('.codex', 'skills', 'development-execution-accelerator');

  async function runMutation(label, variant, mutate) {
    const attemptDir = path.join(root, label);
    return runLeanAttempt({
      sourceRoot: root,
      outputRoot: root,
      attemptDir,
      variant,
      skillPath,
      prompt: neutralLongPrompt,
      launcher: { command: 'codex', prefixArgs: [] },
      spawnImpl() {
        return completedJsonlChild(raw, {
          beforeClose() {
            return mutate(path.join(attemptDir, 'workspace'));
          },
        });
      },
    });
  }

  const attempts = [
    await runMutation('deleted', 'with_skill', (workspace) => (
      rm(path.join(workspace, stagedRelative, 'SKILL.md'))
    )),
    await runMutation('tampered', 'with_skill', (workspace) => (
      writeFile(path.join(workspace, stagedRelative, 'SKILL.md'), 'tampered', 'utf8')
    )),
    await runMutation('extra-state', 'with_skill', (workspace) => (
      writeFile(path.join(workspace, stagedRelative, 'state.json'), '{}', 'utf8')
    )),
    await runMutation('baseline-state', 'without_skill', async (workspace) => {
      const statePath = path.join(workspace, stagedRelative, 'state.json');
      await mkdir(path.dirname(statePath), { recursive: true });
      await writeFile(statePath, '{}', 'utf8');
    }),
  ];
  for (const result of attempts) {
    assert.equal(result.summary.valid, false);
    assert.match(result.summary.error, /Skill|state|boundary|identity|changed/iu);
  }
});

test('captures native JSONL bytes directly and summarizes only the fresh attempt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-eval-run-'));
  const skillPath = path.join(root, 'SKILL.md');
  await writeFile(skillPath, 'current skill bytes', 'utf8');
  const raw = [
    event('thread.started'),
    event('turn.started'),
    ...completedCommand('focused', 'npm run test:catalog'),
    ...completedCommand('gate', 'npm test'),
    event('turn.completed'),
  ].map((value) => JSON.stringify(value)).join('\n') + '\n';

  const spawnImpl = () => completedJsonlChild(Buffer.from(raw), { stderr: 'fixture stderr' });

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt-1'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    requiredCommands: ['npm run test:catalog', 'npm test'],
    spawnImpl,
  });

  assert.equal(await readFile(result.jsonlPath, 'utf8'), raw);
  assert.equal(await readFile(result.stderrPath, 'utf8'), 'fixture stderr');
  assert.equal(result.summary.valid, true);
  assert.deepEqual(result.summary.commands, ['npm run test:catalog', 'npm test']);
});

test('rejects malformed JSONL and lifecycle or required-command order violations', () => {
  assert.throws(() => parseNativeJsonl('{"type":"thread.started"}\nnot-json\n'), /line 2/iu);
  assert.throws(
    () => validateNativeTrace([
      event('turn.started'),
      event('thread.started'),
      ...completedCommand('gate', 'npm test'),
      ...completedCommand('focused', 'npm run test:catalog'),
      event('turn.completed'),
    ], { requiredCommands: ['npm run test:catalog', 'npm test'] }),
    /thread.started|order/iu,
  );
});

test('rejects top-level and turn failures plus incomplete command lifecycles', () => {
  const cases = [
    [event('thread.started'), event('turn.started'), { type: 'error', message: 'transport failed' }, event('turn.completed')],
    [event('thread.started'), event('turn.started'), { type: 'turn.failed', error: { message: 'model failed' } }],
    [event('thread.started'), event('turn.started'), event('item.started', { id: 'orphan', type: 'command_execution', command: 'npm test' }), event('turn.completed')],
    [
      event('thread.started'),
      event('turn.started'),
      event('item.started', { id: 'failed-command', type: 'command_execution', command: 'npm test' }),
      event('item.completed', { id: 'failed-command', type: 'command_execution', command: 'npm test', status: 'completed', exit_code: 1 }),
      event('turn.completed'),
    ],
  ];
  for (const events of cases) {
    assert.throws(() => validateNativeTrace(events), /error|failed|orphan|exit|lifecycle/iu);
  }
});

test('trace boundary requires exactly one terminal turn completion with no later lifecycle evidence', () => {
  const duplicateCompletion = [
    event('thread.started'),
    event('turn.started'),
    ...completedCommand('gate', 'npm test'),
    event('turn.completed'),
    event('turn.completed'),
  ];
  const commandAfterCompletion = [
    event('thread.started'),
    event('turn.started'),
    event('turn.completed'),
    ...completedCommand('late-gate', 'npm test'),
  ];

  assert.throws(() => validateNativeTrace(duplicateCompletion), /turn|terminal|completion/iu);
  assert.throws(() => validateNativeTrace(commandAfterCompletion), /turn|terminal|lifecycle/iu);
});

test('trace boundary requires explicit command success status and numeric zero exit_code', () => {
  const missingExitCode = [
    event('thread.started'),
    event('turn.started'),
    event('item.started', { id: 'missing-exit', type: 'command_execution', command: 'npm test' }),
    event('item.completed', {
      id: 'missing-exit', type: 'command_execution', command: 'npm test', status: 'completed',
    }),
    event('turn.completed'),
  ];
  const missingStatus = [
    event('thread.started'),
    event('turn.started'),
    event('item.started', { id: 'missing-status', type: 'command_execution', command: 'npm test' }),
    event('item.completed', {
      id: 'missing-status', type: 'command_execution', command: 'npm test', exit_code: 0,
    }),
    event('turn.completed'),
  ];
  const explicitSuccess = [
    event('thread.started'),
    event('turn.started'),
    event('item.started', { id: 'success', type: 'command_execution', command: 'npm test' }),
    event('item.completed', {
      id: 'success', type: 'command_execution', command: 'npm test', status: 'success', exit_code: 0,
    }),
    event('turn.completed'),
  ];

  assert.throws(() => validateNativeTrace(missingExitCode), /exit_code|success/iu);
  assert.throws(() => validateNativeTrace(missingStatus), /status|success/iu);
  assert.doesNotThrow(() => validateNativeTrace(explicitSuccess));
});

test('trace boundary rejects an id-less exact required command without native success evidence', () => {
  const events = [
    event('thread.started'),
    event('turn.started'),
    event('item.started', { type: 'command_execution', command: 'npm test' }),
    event('item.completed', { type: 'command_execution', command: 'npm test' }),
    event('turn.completed'),
  ];

  assert.throws(
    () => validateNativeTrace(events, { requiredCommands: ['npm test'] }),
    /command.*id|lifecycle/iu,
  );
});

test('trace boundary rejects trailing shell background commands even when the required command completes', () => {
  const events = [
    event('thread.started'),
    event('turn.started'),
    ...completedCommand('background', 'npm test &'),
    ...completedCommand('gate', 'npm test'),
    event('turn.completed'),
  ];

  assert.throws(
    () => validateNativeTrace(events, { requiredCommands: ['npm test'] }),
    /background|substitute|command/iu,
  );
});

test('trace boundary rejects a cross-type completion that leaves a background command unclosed', () => {
  const events = [
    event('thread.started'),
    event('turn.started'),
    event('item.started', { id: 'hidden', type: 'command_execution', command: 'npm test &' }),
    event('item.completed', { id: 'hidden', type: 'agent_message', text: 'Done.' }),
    ...completedCommand('gate', 'npm test'),
    event('turn.completed'),
  ];

  assert.throws(
    () => validateNativeTrace(events, { requiredCommands: ['npm test'] }),
    /cross-type|orphan|lifecycle/iu,
  );
});

test('requires each normalized exact command once and rejects substitutes', () => {
  const requiredCommands = ['npm run test:catalog', 'npm test'];
  const invalidCommandSets = [
    ['npm run test:catalog', 'npm run test:catalog', 'npm test'],
    ['echo npm run test:catalog', 'npm test'],
    ['npm run test:catalog || exit 0', 'npm test'],
    ['npm run test:catalog', 'npm test -- --help'],
  ];
  for (const commands of invalidCommandSets) {
    const events = [event('thread.started'), event('turn.started')];
    commands.forEach((command, index) => events.push(...completedCommand(`command-${index}`, command)));
    events.push(event('turn.completed'));
    assert.throws(() => validateNativeTrace(events, { requiredCommands }), /exact|required|duplicate|order/iu);
  }
});

test('allows native message items that have no started lifecycle event', () => {
  assert.doesNotThrow(() => validateNativeTrace([
    event('thread.started'),
    event('turn.started'),
    event('item.completed', { id: 'message', type: 'agent_message', text: 'Done.' }),
    event('turn.completed'),
  ]));
});

test('short trace rejects worker, background, wait, and plan-state probes', () => {
  const base = [event('thread.started'), event('turn.started')];
  for (const tool of ['spawn_agent', 'exec_background', 'wait_agent', 'update_plan']) {
    assert.throws(
      () => validateShortTrace([
        ...base,
        event('item.started', { id: tool, type: 'tool_call', tool }),
        event('item.completed', { id: tool, type: 'tool_call', tool, status: 'completed' }),
        event('turn.completed'),
      ]),
      /forbidden acceleration probe/iu,
    );
  }
  assert.throws(() => validateShortTrace([
    event('thread.started'),
    event('turn.started'),
    ...completedCommand('background-command', 'Start-Process npm -ArgumentList "test" -WindowStyle Hidden'),
    event('turn.completed'),
  ]), /forbidden acceleration probe/iu);
});

test('worker evidence rejects spawn and late-wait envelopes that cannot prove execution or write ownership', () => {
  const workerEvents = [
    event('thread.started'),
    event('turn.started'),
    event('item.started', { id: 'spawn-catalog', type: 'collab_agent_tool_call', tool: 'spawn_agent', prompt: 'Own src/catalog only.' }),
    event('item.completed', {
      id: 'spawn-catalog', type: 'collab_agent_tool_call', tool: 'spawn_agent', status: 'completed',
      receiver_thread_ids: ['worker-catalog'], prompt: 'Own src/catalog only.',
      agents_states: { 'worker-catalog': { status: 'running', message: null } },
    }),
    event('item.started', { id: 'spawn-billing', type: 'collab_agent_tool_call', tool: 'spawn_agent', prompt: 'Own src/billing only.' }),
    event('item.completed', {
      id: 'spawn-billing', type: 'collab_agent_tool_call', tool: 'spawn_agent', status: 'completed',
      receiver_thread_ids: ['worker-billing'], prompt: 'Own src/billing only.',
      agents_states: { 'worker-billing': { status: 'running', message: null } },
    }),
    event('item.started', { id: 'wait-workers', type: 'collab_agent_tool_call', tool: 'wait', receiver_thread_ids: ['worker-catalog', 'worker-billing'] }),
    event('item.completed', {
      id: 'wait-workers',
      type: 'collab_agent_tool_call',
      tool: 'wait',
      status: 'completed',
      receiver_thread_ids: ['worker-catalog', 'worker-billing'],
      agents_states: {},
    }),
    event('turn.completed'),
  ];
  assert.throws(() => validateWorkerEvidence(workerEvents, {
    expectedDomains: ['src/catalog', 'src/billing'],
  }), /execution interval|write ownership|evidence.*missing/iu);

  const proseOnly = [
    event('thread.started'),
    event('turn.started'),
    event('item.completed', { id: 'message', type: 'agent_message', text: 'Both workers completed in parallel.' }),
    event('turn.completed'),
  ];
  assert.throws(() => validateWorkerEvidence(proseOnly, {
    expectedDomains: ['src/catalog', 'src/billing'],
  }), /native worker evidence/iu);

  const missingRunningState = completedWorkerTrace();
  delete missingRunningState.find(({ item }) => item?.id === 'spawn-catalog'
    && item.status === 'completed').item.agents_states;
  assert.throws(() => validateWorkerEvidence(missingRunningState, {
    expectedDomains: ['src/catalog', 'src/billing'],
  }), /spawn.*(?:running|lifecycle|state)/iu);
});

test('worker evidence accepts two owned native lifecycles with a positive overlap interval', () => {
  const worker = validateWorkerEvidence(completedWorkerTrace(), {
    expectedDomains: ['src/catalog', 'src/billing'],
  });

  assert.deepEqual(worker.domains, ['src/billing', 'src/catalog']);
  assert.deepEqual(worker.intervals.map(({ thread_id, conflict_domain }) => ({
    thread_id,
    conflict_domain,
  })), [
    { thread_id: 'worker-billing', conflict_domain: 'src/billing' },
    { thread_id: 'worker-catalog', conflict_domain: 'src/catalog' },
  ]);
  assert.equal(worker.positive_overlap, true);
});

test('worker evidence rejects sequential lifecycles and duplicate conflict-domain writers', () => {
  const sequential = [
    event('thread.started'),
    event('turn.started'),
    event('item.started', {
      id: 'spawn-catalog', type: 'collab_agent_tool_call', tool: 'spawn_agent', prompt: 'Own src/catalog only.',
    }),
    event('item.completed', {
      id: 'spawn-catalog', type: 'collab_agent_tool_call', tool: 'spawn_agent', status: 'completed',
      receiver_thread_ids: ['worker-catalog'], prompt: 'Own src/catalog only.',
      agents_states: { 'worker-catalog': { status: 'running', message: null } },
    }),
    event('item.started', {
      id: 'wait-catalog', type: 'collab_agent_tool_call', tool: 'wait', receiver_thread_ids: ['worker-catalog'],
    }),
    event('item.completed', {
      id: 'wait-catalog', type: 'collab_agent_tool_call', tool: 'wait', status: 'completed',
      receiver_thread_ids: ['worker-catalog'], agents_states: { 'worker-catalog': { status: 'completed', message: null } },
    }),
    event('item.started', {
      id: 'spawn-billing', type: 'collab_agent_tool_call', tool: 'spawn_agent', prompt: 'Own src/billing only.',
    }),
    event('item.completed', {
      id: 'spawn-billing', type: 'collab_agent_tool_call', tool: 'spawn_agent', status: 'completed',
      receiver_thread_ids: ['worker-billing'], prompt: 'Own src/billing only.',
      agents_states: { 'worker-billing': { status: 'running', message: null } },
    }),
    event('item.started', {
      id: 'wait-billing', type: 'collab_agent_tool_call', tool: 'wait', receiver_thread_ids: ['worker-billing'],
    }),
    event('item.completed', {
      id: 'wait-billing', type: 'collab_agent_tool_call', tool: 'wait', status: 'completed',
      receiver_thread_ids: ['worker-billing'], agents_states: { 'worker-billing': { status: 'completed', message: null } },
    }),
    event('turn.completed'),
  ];
  assert.throws(() => validateWorkerEvidence(sequential, {
    expectedDomains: ['src/catalog', 'src/billing'],
  }), /overlap|interval/iu);

  const duplicateWriter = completedWorkerTrace();
  duplicateWriter.find(({ item }) => item?.id === 'spawn-billing' && item.prompt).item.prompt = 'Own src/catalog only.';
  assert.throws(() => validateWorkerEvidence(duplicateWriter, {
    expectedDomains: ['src/catalog', 'src/billing'],
  }), /conflict domain|writer|ownership/iu);
});

test('wait protocol accepts honest overlap without weakening ordinary command completion order', async () => {
  const passing = [
    event('thread.started'),
    event('turn.started'),
    event('item.started', { id: 'corpus', type: 'command_execution', command: 'npm run verify:corpus' }),
    ...completedCommand('reporting', 'npm run test:reporting'),
    event('item.completed', {
      id: 'corpus', type: 'command_execution', command: 'npm run verify:corpus', status: 'completed', exit_code: 0,
    }),
    ...completedCommand('gate', 'npm test'),
    event('turn.completed'),
  ];
  const requiredCommands = ['npm run verify:corpus', 'npm run test:reporting', 'npm test'];
  const waitExpectation = {
    longCommand: 'npm run verify:corpus',
    usefulWorkCommand: 'npm run test:reporting',
    testCommand: 'npm test',
  };
  assert.throws(
    () => validateNativeTrace(passing, { requiredCommands }),
    /command order/iu,
  );
  assert.doesNotThrow(() => validateWaitOverlap(passing, waitExpectation));

  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-wait-protocol-'));
  const skillPath = path.join(root, 'SKILL.md');
  await writeFile(skillPath, 'skill bytes', 'utf8');
  const raw = `${passing.map((value) => JSON.stringify(value)).join('\n')}\n`;
  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    requiredCommands,
    mode: 'wait',
    waitExpectation,
    launcher: { command: 'codex', prefixArgs: [] },
    spawnImpl() {
      return completedJsonlChild(raw);
    },
  });
  assert.equal(result.summary.valid, true, result.summary.error);
});

test('wait protocol rejects swapped command identities across lifecycle IDs', () => {
  const events = [
    event('thread.started'),
    event('turn.started'),
    event('item.started', {
      id: 'corpus', type: 'command_execution', command: 'npm run verify:corpus',
    }),
    event('item.started', {
      id: 'reporting', type: 'command_execution', command: 'npm run test:reporting',
    }),
    event('item.completed', {
      id: 'corpus', type: 'command_execution', command: 'npm run test:reporting',
      status: 'completed', exit_code: 0,
    }),
    event('item.completed', {
      id: 'reporting', type: 'command_execution', command: 'npm run verify:corpus',
      status: 'completed', exit_code: 0,
    }),
    ...completedCommand('gate', 'npm test'),
    event('turn.completed'),
  ];

  assert.throws(() => validateWaitOverlap(events, {
    longCommand: 'npm run verify:corpus',
    usefulWorkCommand: 'npm run test:reporting',
    testCommand: 'npm test',
  }), /command.*identity|lifecycle/iu);
});

test('wait protocol rejects reporting and test boundary or order violations', () => {
  const waitExpectation = {
    longCommand: 'npm run verify:corpus',
    usefulWorkCommand: 'npm run test:reporting',
    testCommand: 'npm test',
  };
  const cases = [
    [
      event('thread.started'), event('turn.started'),
      ...completedCommand('reporting', 'npm run test:reporting'),
      ...completedCommand('corpus', 'npm run verify:corpus'),
      ...completedCommand('gate', 'npm test'), event('turn.completed'),
    ],
    [
      event('thread.started'), event('turn.started'),
      event('item.started', { id: 'corpus', type: 'command_execution', command: 'npm run verify:corpus' }),
      event('item.started', { id: 'reporting', type: 'command_execution', command: 'npm run test:reporting' }),
      event('item.completed', {
        id: 'corpus', type: 'command_execution', command: 'npm run verify:corpus', status: 'completed', exit_code: 0,
      }),
      event('item.completed', {
        id: 'reporting', type: 'command_execution', command: 'npm run test:reporting', status: 'completed', exit_code: 0,
      }),
      ...completedCommand('gate', 'npm test'), event('turn.completed'),
    ],
    [
      event('thread.started'), event('turn.started'),
      event('item.started', { id: 'corpus', type: 'command_execution', command: 'npm run verify:corpus' }),
      ...completedCommand('reporting', 'npm run test:reporting'),
      event('item.started', { id: 'gate', type: 'command_execution', command: 'npm test' }),
      event('item.completed', {
        id: 'corpus', type: 'command_execution', command: 'npm run verify:corpus', status: 'completed', exit_code: 0,
      }),
      event('item.completed', {
        id: 'gate', type: 'command_execution', command: 'npm test', status: 'completed', exit_code: 0,
      }),
      event('turn.completed'),
    ],
  ];
  for (const events of cases) {
    assert.throws(() => validateWaitOverlap(events, waitExpectation), /strictly|order|protocol/iu);
  }
});
