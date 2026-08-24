import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { main as runLeanEvaluationCli } from '../scripts/run-lean-evaluation.js';
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
  verifySubjectHome,
  validateWaitOverlap,
  validateWorkerEvidence,
} from '../src/lean-evaluation.js';

const neutralLongPrompt = 'Implement the two approved modules, run their focused checks, then run the required aggregate check.';
const neutralShortPrompt = 'Correct the finite-number behavior and run the focused check followed by the aggregate check.';
const controlledLauncherRoot = await mkdtemp(path.join(os.tmpdir(), 'lean controlled launcher '));
const controlledEntryPath = path.join(controlledLauncherRoot, 'controlled codex entry.js');
await writeControlledCodexEntry(controlledEntryPath, 'codex-cli 0.150.0');
const controlledLauncher = await resolveCodexLaunch({
  entryPath: controlledEntryPath,
  expectedVersion: 'codex-cli 0.150.0',
});

async function writeControlledCodexEntry(entryPath, version) {
  await mkdir(path.dirname(entryPath), { recursive: true });
  await writeFile(
    entryPath,
    `if (process.argv[2] !== '--version') process.exit(64);\nprocess.stdout.write(${JSON.stringify(`${version}\n`)});\n`,
    'utf8',
  );
}

async function createControlledSubjectHome() {
  const subjectHome = await mkdtemp(path.join(os.tmpdir(), 'lean-controlled-home-'));
  await mkdir(path.join(subjectHome, '.codex'), { recursive: true });
  await writeFile(path.join(subjectHome, '.codex', 'auth.json'), 'controlled fixture', 'utf8');
  return subjectHome;
}

async function createControlledCampaignSource() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-campaign-source-'));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-campaign-output-'));
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
  return { repoRoot, outputRoot };
}

async function writeBootstrapCodexEntry(entryPath, version, {
  createSkillRoot = true,
  replaceAuthArtifact = false,
} = {}) {
  const pilotTrace = `${[
    event('thread.started'),
    event('turn.started'),
    ...completedCommand('catalog', 'npm run test:catalog'),
    ...completedCommand('billing', 'npm run test:billing'),
    ...completedCommand('gate', 'npm test'),
    event('turn.completed'),
  ].map((value) => JSON.stringify(value)).join('\n')}\n`;
  await mkdir(path.dirname(entryPath), { recursive: true });
  await writeFile(entryPath, [
    "const { mkdirSync, unlinkSync, writeFileSync } = require('node:fs');",
    "const path = require('node:path');",
    `if (process.argv[2] === '--version') { process.stdout.write(${JSON.stringify(`${version}\n`)}); process.exit(0); }`,
    "const attemptId = path.basename(path.dirname(process.cwd()));",
    "if (attemptId === 'pilot-with-skill') {",
    ...(createSkillRoot
      ? ["  mkdirSync(path.join(process.env.CODEX_HOME, 'skills'), { recursive: true });"]
      : []),
    ...(replaceAuthArtifact
      ? [
        "  const authPath = path.join(process.env.CODEX_HOME, 'auth.json');",
        '  unlinkSync(authPath);',
        "  writeFileSync(authPath, 'replacement controlled fixture', 'utf8');",
      ]
      : []),
    `  process.stdout.write(${JSON.stringify(pilotTrace)});`,
    '  process.exit(0);',
    '}',
    'process.exit(64);',
    '',
  ].join('\n'), 'utf8');
}

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
      launcher: controlledLauncher,
    });

    assert.equal(invocation.command, controlledLauncher.command);
    assert.deepEqual(invocation.args, [
      controlledLauncher.entryPath,
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
  const subjectHome = path.resolve('C:/fixture/subject-home');
  const source = {
    PATH: 'tools', PATHEXT: '.CMD', SystemRoot: 'C:/example/Windows', COMSPEC: 'C:/example/Windows/System32/cmd.exe',
    HOME: 'C:/Users/tester', USERPROFILE: 'C:/Users/tester', APPDATA: 'C:/Users/tester/AppData/Roaming', LOCALAPPDATA: 'C:/Users/tester/AppData/Local',
    TEMP: 'C:/temp', TMP: 'C:/temp', LANG: 'en_US.UTF-8', LC_ALL: 'C.UTF-8', NODE_OPTIONS: '--no-warnings',
    CODEX_HOME: 'C:/Users/tester/.codex', GIT_CONFIG_NOSYSTEM: '1', npm_config_cache: 'C:/tmp/npm-cache',
    OPENAI_API_KEY: 'secret', HTTPS_PROXY: 'credential', RANDOM_SECRET: 'secret', npm_config_token: 'secret',
  };
  assert.deepEqual(buildSubjectEnvironment(source, 'win32', subjectHome), {
    PATH: 'tools', PATHEXT: '.CMD', SystemRoot: 'C:/example/Windows', COMSPEC: 'C:/example/Windows/System32/cmd.exe',
    APPDATA: 'C:/Users/tester/AppData/Roaming', LOCALAPPDATA: 'C:/Users/tester/AppData/Local',
    TEMP: 'C:/temp', TMP: 'C:/temp', LANG: 'en_US.UTF-8', LC_ALL: 'C.UTF-8',
    npm_config_cache: 'C:/tmp/npm-cache',
    HOME: subjectHome, USERPROFILE: subjectHome, CODEX_HOME: path.join(subjectHome, '.codex'),
  });
});

test('matches Windows system environment names case-insensitively while replacing identity roots', () => {
  const subjectHome = path.resolve('C:/fixture/mixed-case-home');
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

  const subjectEnvironment = buildSubjectEnvironment(source, 'win32', subjectHome);
  assert.deepEqual(Object.keys(subjectEnvironment), [
    'Path', 'ComSpec', 'SystemRoot', 'AppData', 'LocalAppData',
    'Temp', 'Lang', 'npm_config_cache', 'HOME', 'USERPROFILE', 'CODEX_HOME',
  ]);
  assert.equal(subjectEnvironment.Path, 'C:/fixture/tools');
  assert.equal(subjectEnvironment.ComSpec, 'C:/example/Windows/System32/cmd.exe');
  assert.equal(subjectEnvironment.HOME, subjectHome);
  assert.equal(subjectEnvironment.USERPROFILE, subjectHome);
  assert.equal(subjectEnvironment.CODEX_HOME, path.join(subjectHome, '.codex'));
  for (const excluded of ['OPENAI_API_KEY', 'HTTPS_PROXY', 'npm_config_token']) {
    assert.equal(Object.hasOwn(subjectEnvironment, excluded), false);
  }

  assert.deepEqual(buildSubjectEnvironment({ Path: 'wrong-case', PATH: 'usable' }, 'linux', '/isolated/home'), {
    PATH: 'usable',
    HOME: path.resolve('/isolated/home'),
    USERPROFILE: path.resolve('/isolated/home'),
    CODEX_HOME: path.join(path.resolve('/isolated/home'), '.codex'),
  });
});

test('verifies an isolated subject home and rejects every user-global Skill root', async () => {
  const subjectHome = await mkdtemp(path.join(os.tmpdir(), 'lean-subject-home-'));
  await mkdir(path.join(subjectHome, '.codex'));
  await writeFile(path.join(subjectHome, '.codex', 'auth.json'), 'controlled fixture', 'utf8');

  assert.deepEqual(await verifySubjectHome(subjectHome), {
    home: subjectHome,
    codexHome: path.join(subjectHome, '.codex'),
  });

  for (const skillRoot of [
    path.join(subjectHome, '.agents', 'skills'),
    path.join(subjectHome, '.codex', 'skills'),
  ]) {
    await mkdir(skillRoot, { recursive: true });
    await assert.rejects(verifySubjectHome(subjectHome), /isolated subject home.*Skill/iu);
    await rm(skillRoot, { recursive: true });
  }
});

test('subject-home authentication precondition requires a regular canonical auth artifact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-subject-auth-'));
  const emptyHome = path.join(root, 'empty-home');
  await mkdir(path.join(emptyHome, '.codex'), { recursive: true });
  await assert.rejects(verifySubjectHome(emptyHome), /authentication|auth\.json/iu);

  const linkedArtifactHome = path.join(root, 'linked-artifact-home');
  const externalAuth = path.join(root, 'external-auth.json');
  await mkdir(path.join(linkedArtifactHome, '.codex'), { recursive: true });
  await writeFile(externalAuth, 'controlled fixture', 'utf8');
  await symlink(externalAuth, path.join(linkedArtifactHome, '.codex', 'auth.json'));
  await assert.rejects(
    verifySubjectHome(linkedArtifactHome),
    /authentication|auth\.json|symbolic link/iu,
  );

  const linkedAncestorHome = path.join(root, 'linked-ancestor-home');
  const externalCodexHome = path.join(root, 'external-codex-home');
  await mkdir(linkedAncestorHome);
  await mkdir(externalCodexHome);
  await writeFile(path.join(externalCodexHome, 'auth.json'), 'controlled fixture', 'utf8');
  await symlink(
    externalCodexHome,
    path.join(linkedAncestorHome, '.codex'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    verifySubjectHome(linkedAncestorHome),
    /authentication|canonical|symbolic link|junction|\.codex/iu,
  );

  const validHome = path.join(root, 'valid-home');
  await mkdir(path.join(validHome, '.codex'), { recursive: true });
  await writeFile(path.join(validHome, '.codex', 'auth.json'), 'controlled fixture', 'utf8');
  assert.deepEqual(await verifySubjectHome(validHome), {
    home: validHome,
    codexHome: path.join(validHome, '.codex'),
  });
});

test('campaign Subject Home preflight rejects a pre-existing personal Skill root', async () => {
  const { repoRoot, outputRoot } = await createControlledCampaignSource();
  const subjectHome = await createControlledSubjectHome();
  await mkdir(path.join(subjectHome, '.agents', 'skills'), { recursive: true });
  let attemptCalls = 0;

  await assert.rejects(runLeanCampaign({
    repoRoot,
    outputRoot,
    campaignName: 'preexisting-personal-skill',
    launcher: controlledLauncher,
    subjectHome,
    runAttempt: async () => {
      attemptCalls += 1;
      return { summary: { valid: true, elapsed_ns: '1' } };
    },
  }), /isolated subject home.*Skill/iu);
  assert.equal(attemptCalls, 0);
});

test('campaign Subject Home binding lets pilot runtime Skill roots survive later real attempts', async () => {
  const { repoRoot, outputRoot } = await createControlledCampaignSource();
  const subjectHome = await createControlledSubjectHome();
  const launcherRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-bootstrap-launcher-'));
  const entryPath = path.join(launcherRoot, 'bootstrap codex entry.js');
  await writeBootstrapCodexEntry(entryPath, 'codex-cli 0.150.1');
  const launcher = await resolveCodexLaunch({
    entryPath,
    expectedVersion: 'codex-cli 0.150.1',
  });

  const campaign = await runLeanCampaign({
    repoRoot,
    outputRoot,
    campaignName: 'runtime-skill-root',
    launcher,
    subjectHome,
  });

  assert.equal(campaign.result.attempts[0].summary.valid, true);
  assert.equal(campaign.result.attempts[1].summary.phase, 'process');
  assert.equal(campaign.result.attempts.length, MAX_SUBJECT_PROCESSES);
});

test('campaign Subject Home binding rejects a replaced authentication identity after pilot', async () => {
  const { repoRoot, outputRoot } = await createControlledCampaignSource();
  const subjectHome = await createControlledSubjectHome();
  const launcherRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-auth-replacement-launcher-'));
  const entryPath = path.join(launcherRoot, 'auth replacement codex entry.js');
  await writeBootstrapCodexEntry(entryPath, 'codex-cli 0.150.2', {
    createSkillRoot: false,
    replaceAuthArtifact: true,
  });
  const launcher = await resolveCodexLaunch({
    entryPath,
    expectedVersion: 'codex-cli 0.150.2',
  });

  await assert.rejects(runLeanCampaign({
    repoRoot,
    outputRoot,
    campaignName: 'replaced-auth-identity',
    launcher,
    subjectHome,
  }), /authentication.*identity/iu);
});

test('subject-home scope rejects repository and campaign-output overlap in either direction', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-subject-scope-'));
  const launcher = controlledLauncher;
  const cases = [
    {
      label: 'home-inside-repository',
      repoRoot: path.join(root, 'case-1', 'repository'),
      outputRoot: path.join(root, 'case-1', 'output'),
      subjectHome: path.join(root, 'case-1', 'repository', 'subject-home'),
    },
    {
      label: 'repository-inside-home',
      repoRoot: path.join(root, 'case-2', 'subject-home', 'repository'),
      outputRoot: path.join(root, 'case-2', 'output'),
      subjectHome: path.join(root, 'case-2', 'subject-home'),
    },
    {
      label: 'home-inside-output',
      repoRoot: path.join(root, 'case-3', 'repository'),
      outputRoot: path.join(root, 'case-3', 'output'),
      subjectHome: path.join(root, 'case-3', 'output', 'subject-home'),
    },
    {
      label: 'output-inside-home',
      repoRoot: path.join(root, 'case-4', 'repository'),
      outputRoot: path.join(root, 'case-4', 'subject-home', 'output'),
      subjectHome: path.join(root, 'case-4', 'subject-home'),
    },
  ];

  for (const value of cases) {
    await mkdir(value.repoRoot, { recursive: true });
    await mkdir(value.outputRoot, { recursive: true });
    await mkdir(path.join(value.subjectHome, '.codex'), { recursive: true });
    await writeFile(path.join(value.subjectHome, '.codex', 'auth.json'), 'controlled fixture', 'utf8');
    await assert.rejects(runLeanCampaign({
      repoRoot: value.repoRoot,
      outputRoot: value.outputRoot,
      campaignName: value.label,
      launcher,
      subjectHome: value.subjectHome,
      runAttempt: async () => {
        throw new Error('overlap validation must run before an attempt');
      },
    }), /subject home.*overlap/iu);
  }

  const directSource = path.join(root, 'direct-attempt', 'repository');
  const directOutput = path.join(root, 'direct-attempt', 'output');
  const directHome = path.join(directSource, 'subject-home');
  const skillPath = path.join(directSource, 'SKILL.md');
  await mkdir(path.join(directHome, '.codex'), { recursive: true });
  await mkdir(directOutput, { recursive: true });
  await writeFile(path.join(directHome, '.codex', 'auth.json'), 'controlled fixture', 'utf8');
  await writeFile(skillPath, 'controlled skill', 'utf8');
  let spawnCount = 0;
  await assert.rejects(runLeanAttempt({
    sourceRoot: directSource,
    outputRoot: directOutput,
    attemptDir: path.join(directOutput, 'attempt'),
    variant: 'without_skill',
    skillPath,
    prompt: neutralLongPrompt,
    launcher,
    subjectHome: directHome,
    spawnImpl() {
      spawnCount += 1;
      throw new Error('overlap validation must run before spawn');
    },
  }), /subject home.*overlap/iu);
  assert.equal(spawnCount, 0);
});

test('verifies the controller-provided Codex entry and exact version without PATH discovery', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-codex-entry-'));
  const entryPath = path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  await writeControlledCodexEntry(entryPath, 'codex-cli 0.150.0');

  assert.deepEqual(await resolveCodexLaunch({
    entryPath,
    expectedVersion: 'codex-cli 0.150.0',
  }), {
    command: await realpath(process.execPath),
    prefixArgs: [entryPath],
    entryPath,
    version: 'codex-cli 0.150.0',
  });
});

test('rejects a controller-provided Codex entry when its exact version differs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-codex-version-'));
  const entryPath = path.join(root, 'codex.js');
  await writeControlledCodexEntry(entryPath, 'codex-cli 0.149.0');

  await assert.rejects(resolveCodexLaunch({
    entryPath,
    expectedVersion: 'codex-cli 0.150.0',
  }), /version mismatch.*0\.150\.0.*0\.149\.0/iu);
});

test('does not let caller-controlled code attest an ordinary canonical entry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-codex-attestation-'));
  const entryPath = path.join(root, 'ordinary canonical file.js');
  await writeFile(entryPath, 'ordinary canonical file', 'utf8');
  let fakeProbeCalls = 0;

  await assert.rejects(resolveCodexLaunch({
    entryPath,
    expectedVersion: 'codex-cli 0.150.0',
    versionProbe: async () => {
      fakeProbeCalls += 1;
      return { stdout: 'codex-cli 0.150.0\n', stderr: '' };
    },
  }));
  assert.equal(fakeProbeCalls, 0);
});

test('rejects ancestor aliases for pinned entry and subject-home identity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-canonical-identity-'));
  const targetRoot = path.join(root, 'canonical-target');
  const aliasRoot = path.join(root, 'ancestor-alias');
  const entryPath = path.join(targetRoot, 'install', 'codex.js');
  const subjectHome = path.join(targetRoot, 'subject-home');
  await mkdir(path.dirname(entryPath), { recursive: true });
  await mkdir(path.join(subjectHome, '.codex'), { recursive: true });
  await writeControlledCodexEntry(entryPath, 'codex-cli 0.150.0');
  await writeFile(path.join(subjectHome, '.codex', 'auth.json'), 'controlled fixture', 'utf8');
  await symlink(targetRoot, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir');

  await assert.rejects(resolveCodexLaunch({
    entryPath: path.join(aliasRoot, 'install', 'codex.js'),
    expectedVersion: 'codex-cli 0.150.0',
  }), /canonical|alias|symbolic link|junction/iu);
  await assert.rejects(
    verifySubjectHome(path.join(aliasRoot, 'subject-home')),
    /canonical|alias|symbolic link|junction/iu,
  );
});

test('production boundaries reject PATH launchers and launcher-shaped impostors before dispatch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-launcher-identity-'));
  const repoRoot = path.join(root, 'repository');
  const outputRoot = path.join(root, 'output');
  const subjectHome = path.join(root, 'subject-home');
  const entryPath = path.join(root, 'pinned-codex.js');
  const skillPath = path.join(repoRoot, 'SKILL.md');
  await mkdir(path.join(subjectHome, '.codex'), { recursive: true });
  await mkdir(path.join(repoRoot, 'evals', 'fixtures'), { recursive: true });
  await mkdir(outputRoot);
  await writeFile(path.join(subjectHome, '.codex', 'auth.json'), 'controlled fixture', 'utf8');
  await writeControlledCodexEntry(entryPath, 'codex-cli 0.150.0');
  await writeFile(skillPath, 'controlled skill', 'utf8');
  const verifiedLauncher = await resolveCodexLaunch({
    entryPath,
    expectedVersion: 'codex-cli 0.150.0',
  });
  const impostors = [
    { command: 'codex', prefixArgs: [] },
    { ...verifiedLauncher, command: 'node' },
    { ...verifiedLauncher, prefixArgs: [path.join(root, 'other-entry.js')] },
    { ...verifiedLauncher, prefixArgs: [...verifiedLauncher.prefixArgs] },
  ];
  let spawnCount = 0;
  for (const [index, launcher] of impostors.entries()) {
    await assert.rejects(runLeanAttempt({
      sourceRoot: repoRoot,
      outputRoot,
      attemptDir: path.join(outputRoot, `impostor-${index}`),
      variant: 'without_skill',
      skillPath,
      prompt: neutralLongPrompt,
      launcher,
      subjectHome,
      spawnImpl() {
        spawnCount += 1;
        throw new Error('launcher validation must run before spawn');
      },
    }), /controller-verified.*launcher|verified launcher/iu);
  }
  assert.equal(spawnCount, 0);

  assert.throws(() => buildCodexInvocation({
    workspaceDir: repoRoot,
    prompt: neutralLongPrompt,
    userHome: subjectHome,
  }), /controller-verified.*launcher|verified launcher/iu);

  for (const fixture of ['long-task', 'short-task', 'wait-overlap']) {
    const fixturePath = path.join(repoRoot, 'evals', 'fixtures', fixture);
    await mkdir(fixturePath, { recursive: true });
    await writeFile(path.join(fixturePath, 'fixture.txt'), fixture, 'utf8');
  }
  const prompts = [
    ['EVAL-001', 'Approved long catalog and billing work.'],
    ['EVAL-003', 'Approved foreground fallback pilot.'],
    ['EVAL-004', 'Approved short value fix.'],
    ['EVAL-008', 'Approved wait-overlap reporting work.'],
    ['EVAL-010', 'Approved long work; execute serially with the main Agent only.'],
    ['EVAL-011', 'Approved implicit long positive.'],
  ].map(([id, prompt]) => ({ id, prompt }));
  await writeFile(path.join(repoRoot, 'evals', 'evals.json'), JSON.stringify({ evals: prompts }), 'utf8');
  let attemptCount = 0;
  await assert.rejects(runLeanCampaign({
    repoRoot,
    outputRoot,
    campaignName: 'impostor-campaign',
    launcher: { ...verifiedLauncher, prefixArgs: [...verifiedLauncher.prefixArgs] },
    subjectHome,
    runAttempt: async () => {
      attemptCount += 1;
      return { summary: { valid: false, elapsed_ns: '1' } };
    },
  }), /controller-verified.*launcher|verified launcher/iu);
  assert.equal(attemptCount, 0);
});

test('preserves a failure summary when spawn throws synchronously', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-spawn-sync-'));
  const skillPath = path.join(root, 'SKILL.md');
  const subjectHome = await createControlledSubjectHome(root);
  await writeFile(skillPath, 'skill bytes', 'utf8');

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    launcher: controlledLauncher,
    subjectHome,
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

test('redacts both subject-home path forms from persisted failure artifacts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-home-redaction-'));
  const repoRoot = path.join(root, 'repository');
  const outputRoot = path.join(root, 'output');
  const skillPath = path.join(repoRoot, 'SKILL.md');
  const subjectHome = await createControlledSubjectHome();
  const portableHome = subjectHome.split(path.sep).join('/');
  const leakedError = `controlled failure context: ${subjectHome}; portable: ${portableHome}`;
  await mkdir(repoRoot);
  await mkdir(outputRoot);
  await writeFile(skillPath, 'controlled skill', 'utf8');

  const attempt = await runLeanAttempt({
    sourceRoot: repoRoot,
    outputRoot,
    attemptDir: path.join(outputRoot, 'direct-attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    launcher: controlledLauncher,
    subjectHome,
    spawnImpl() {
      throw new Error(leakedError);
    },
  });
  const persistedSummary = await readFile(
    path.join(outputRoot, 'direct-attempt', 'summary.json'),
    'utf8',
  );
  for (const artifact of [JSON.stringify(attempt.summary), persistedSummary]) {
    assert.match(artifact, /controlled failure context/iu);
    assert.equal(artifact.includes(subjectHome), false);
    assert.equal(artifact.includes(portableHome), false);
  }

  for (const fixture of ['long-task', 'short-task', 'wait-overlap']) {
    const fixturePath = path.join(repoRoot, 'evals', 'fixtures', fixture);
    await mkdir(fixturePath, { recursive: true });
    await writeFile(path.join(fixturePath, 'fixture.txt'), fixture, 'utf8');
  }
  const prompts = [
    ['EVAL-001', 'Approved long catalog and billing work.'],
    ['EVAL-003', 'Approved foreground fallback pilot.'],
    ['EVAL-004', 'Approved short value fix.'],
    ['EVAL-008', 'Approved wait-overlap reporting work.'],
    ['EVAL-010', 'Approved long work; execute serially with the main Agent only.'],
    ['EVAL-011', 'Approved implicit long positive.'],
  ].map(([id, prompt]) => ({ id, prompt }));
  await writeFile(
    path.join(repoRoot, 'evals', 'evals.json'),
    JSON.stringify({ evals: prompts }),
    'utf8',
  );
  const campaign = await runLeanCampaign({
    repoRoot,
    outputRoot,
    campaignName: 'redacted-failure',
    launcher: controlledLauncher,
    subjectHome,
    runAttempt: async () => ({
      summary: { valid: false, phase: 'spawn', error: leakedError, elapsed_ns: '1' },
    }),
  });
  const persistedResult = await readFile(path.join(campaign.campaignDir, 'result.json'), 'utf8');
  for (const artifact of [JSON.stringify(campaign.result), persistedResult]) {
    assert.match(artifact, /controlled failure context/iu);
    assert.equal(artifact.includes(subjectHome), false);
    assert.equal(artifact.includes(portableHome), false);
  }
});

test('preserves a failure summary when the child emits error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lean-child-error-'));
  const skillPath = path.join(root, 'SKILL.md');
  const subjectHome = await createControlledSubjectHome(root);
  await writeFile(skillPath, 'skill bytes', 'utf8');

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    launcher: controlledLauncher,
    subjectHome,
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
    const subjectHome = await createControlledSubjectHome(root);
    await writeFile(skillPath, 'skill bytes', 'utf8');
    let streamIndex = 0;
    const result = await runLeanAttempt({
      sourceRoot: root,
      outputRoot: root,
      attemptDir: path.join(root, 'attempt'),
      variant: 'with_skill',
      skillPath,
      prompt: neutralLongPrompt,
      launcher: controlledLauncher,
      subjectHome,
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
  const subjectHome = await createControlledSubjectHome(root);
  await writeFile(skillPath, 'skill bytes', 'utf8');

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    launcher: controlledLauncher,
    subjectHome,
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
  const subjectHome = await createControlledSubjectHome(root);
  await writeFile(skillPath, 'skill bytes', 'utf8');
  let streamIndex = 0;

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    launcher: controlledLauncher,
    subjectHome,
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
  const subjectHome = await mkdtemp(path.join(os.tmpdir(), 'lean-campaign-home-'));
  const launcher = controlledLauncher;
  await mkdir(path.join(subjectHome, '.codex'));
  await writeFile(path.join(subjectHome, '.codex', 'auth.json'), 'controlled fixture', 'utf8');
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
    launcher,
    subjectHome,
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
  assert.equal(observed.every((config) => config.launcher === launcher), true);
  assert.equal(observed.every((config) => config.subjectHome === subjectHome), true);
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
  assert.equal(campaign.result.certified, true);
  const manifestText = await readFile(path.join(campaign.campaignDir, 'manifest.json'), 'utf8');
  assert.equal(manifestText.includes(prompts['EVAL-001']), false);
  assert.equal(manifestText.includes(subjectHome), false);
  assert.deepEqual(campaign.manifest.codex, {
    version: 'codex-cli 0.150.0',
    entry_sha256: '6e8d01030dd4c5016281f40f0c599e7e15a9f9b254d5a22a852c3eef250d64c8',
  });
  await assert.rejects(runLeanCampaign({
    repoRoot, outputRoot, campaignName: 'fixed-campaign', launcher, subjectHome, runAttempt: async () => {},
  }), /already exists/iu);
});

test('stops the campaign after an invalid pilot while preserving its result', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-pilot-gate-source-'));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'lean-pilot-gate-output-'));
  const subjectHome = await mkdtemp(path.join(os.tmpdir(), 'lean-pilot-gate-home-'));
  const launcher = controlledLauncher;
  await mkdir(path.join(subjectHome, '.codex'));
  await writeFile(path.join(subjectHome, '.codex', 'auth.json'), 'controlled fixture', 'utf8');
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
    launcher,
    subjectHome,
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

test('withholds certification from a valid campaign below the twenty-percent median threshold', () => {
  const subjects = buildSubjectPlan({
    longTaskPrompt: neutralLongPrompt,
    shortTaskPrompt: neutralShortPrompt,
    waitTaskPrompt: 'wait',
    implicitPositivePrompt: neutralLongPrompt,
    nearMissPrompt: 'execute the approved long work serially',
  });
  const attempts = subjects.map((subject) => ({
    subject,
    summary: {
      valid: true,
      elapsed_ns: subject.phase === 'formal' && subject.scenario === 'long'
        ? (subject.variant === 'with_skill' ? '81' : '100')
        : '10',
    },
  }));

  const result = summarizeCampaign(attempts, '500');

  assert.equal(result.valid, true);
  assert.equal(result.correctness_passed, true);
  assert.equal(result.performance.evaluated, true);
  assert.equal(result.performance.meets_twenty_percent, false);
  assert.equal(result.certified, false);
});

test('campaign CLI requires the pinned Codex and isolated subject-home contracts', () => {
  assert.deepEqual(parseCampaignArgs([
    '--output-root', 'C:/tmp/runs',
    '--campaign-name', 'campaign-01',
    '--codex-entry', 'C:/tmp/codex/bin/codex.js',
    '--codex-version', 'codex-cli 0.150.0',
    '--subject-home', 'C:/tmp/subject-home',
  ]), {
    outputRoot: path.resolve('C:/tmp/runs'),
    campaignName: 'campaign-01',
    codexEntry: path.resolve('C:/tmp/codex/bin/codex.js'),
    codexVersion: 'codex-cli 0.150.0',
    subjectHome: path.resolve('C:/tmp/subject-home'),
  });
  assert.throws(() => parseCampaignArgs(['config.json']), /Usage/iu);
  assert.throws(() => parseCampaignArgs([
    '--output-root', 'C:/tmp/runs', '--campaign-name', 'campaign-01',
  ]), /Usage/iu);
  assert.throws(() => parseCampaignArgs([
    '--output-root', 'C:/tmp/runs', '--campaign-name', '../escape',
    '--codex-entry', 'C:/tmp/codex/bin/codex.js', '--codex-version', 'codex-cli 0.150.0',
    '--subject-home', 'C:/tmp/subject-home',
  ]), /campaign name/iu);
});

test('campaign CLI exits zero only for the full certification predicate', async () => {
  const config = {
    outputRoot: 'controlled-output',
    campaignName: 'controlled-campaign',
    codexEntry: 'controlled-entry.js',
    codexVersion: 'codex-cli 0.150.0',
    subjectHome: 'controlled-home',
  };
  const launcher = {
    command: 'controlled-node', prefixArgs: ['controlled-entry.js'],
    entryPath: 'controlled-entry.js', version: 'codex-cli 0.150.0',
  };
  const cases = [
    [{
      valid: true, correctness_passed: true,
      performance: { evaluated: true, meets_twenty_percent: true }, certified: true,
    }, 0],
    [{
      valid: true, correctness_passed: true,
      performance: { evaluated: true, meets_twenty_percent: false }, certified: false,
    }, 1],
    [{
      valid: false, correctness_passed: false,
      performance: { evaluated: false }, certified: true,
    }, 1],
    [{
      valid: true, correctness_passed: true,
      performance: { evaluated: false, meets_twenty_percent: true }, certified: true,
    }, 1],
  ];
  for (const [result, expectedExitCode] of cases) {
    const writes = [];
    const calls = [];
    const exitCode = await runLeanEvaluationCli(['controlled'], {
      stdout: { write: (value) => writes.push(value) },
      parseArgs(argv) {
        calls.push({ step: 'parse', argv });
        return config;
      },
      async resolveLaunch(options) {
        calls.push({ step: 'resolve', options });
        return launcher;
      },
      async runCampaign(options) {
        calls.push({ step: 'campaign', options });
        return { result };
      },
      repoRoot: 'controlled-repository',
    });

    assert.equal(exitCode, expectedExitCode);
    assert.deepEqual(calls.map(({ step }) => step), ['parse', 'resolve', 'campaign']);
    assert.deepEqual(calls[1].options, {
      entryPath: config.codexEntry,
      expectedVersion: config.codexVersion,
    });
    assert.equal(calls[2].options.launcher, launcher);
    assert.equal(calls[2].options.subjectHome, config.subjectHome);
    assert.deepEqual(JSON.parse(writes.join('')), result);
  }
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
  const subjectHome = await createControlledSubjectHome(root);
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
      launcher: controlledLauncher,
      subjectHome,
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
  const subjectHome = await createControlledSubjectHome();
  await writeFile(skillPath, 'current skill bytes', 'utf8');
  const raw = [
    event('thread.started'),
    event('turn.started'),
    ...completedCommand('focused', 'npm run test:catalog'),
    ...completedCommand('gate', 'npm test'),
    event('turn.completed'),
  ].map((value) => JSON.stringify(value)).join('\n') + '\n';

  const launches = [];
  const spawnImpl = (command, args, options) => {
    launches.push({ command, args, options });
    return completedJsonlChild(Buffer.from(raw), { stderr: 'fixture stderr' });
  };

  const result = await runLeanAttempt({
    sourceRoot: root,
    outputRoot: root,
    attemptDir: path.join(root, 'attempt-1'),
    variant: 'with_skill',
    skillPath,
    prompt: neutralLongPrompt,
    requiredCommands: ['npm run test:catalog', 'npm test'],
    launcher: controlledLauncher,
    subjectHome,
    environment: {
      PATH: 'controlled-tools',
      HOME: 'C:/Users/tester',
      USERPROFILE: 'C:/Users/tester',
      CODEX_HOME: 'C:/Users/tester/.codex',
    },
    spawnImpl,
  });

  assert.equal(await readFile(result.jsonlPath, 'utf8'), raw);
  assert.equal(await readFile(result.stderrPath, 'utf8'), 'fixture stderr');
  assert.equal(result.summary.valid, true);
  assert.deepEqual(result.summary.commands, ['npm run test:catalog', 'npm test']);
  assert.equal(launches.length, 1);
  assert.deepEqual({
    HOME: launches[0].options.env.HOME,
    USERPROFILE: launches[0].options.env.USERPROFILE,
    CODEX_HOME: launches[0].options.env.CODEX_HOME,
  }, {
    HOME: subjectHome,
    USERPROFILE: subjectHome,
    CODEX_HOME: path.join(subjectHome, '.codex'),
  });
  assert.equal(launches[0].args.join('\n').includes('C:/Users/tester'), false);
  assert.equal((await readFile(path.join(root, 'attempt-1', 'summary.json'), 'utf8')).includes('C:/Users/tester'), false);
  assert.equal((await readFile(path.join(root, 'attempt-1', 'summary.json'), 'utf8')).includes(subjectHome), false);
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
  const subjectHome = await createControlledSubjectHome(root);
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
    launcher: controlledLauncher,
    subjectHome,
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
