import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createEvaluationRecorder } from '../src/evaluation-controller.js';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'evaluate-accelerator.js');
const PLAN_PATH = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'legacy-evaluation-plan.json');
const digest = 'a'.repeat(64);
const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8'));

function startCommand(overrides = {}) {
  return {
    action: 'start',
    run_id: 'r1',
    scenario_id: 'REQ-003',
    pair_id: 1,
    phase: 'pilot',
    variant: 'with_skill',
    fixture_sha256: digest,
    skill_sha256: digest,
    ...overrides,
  };
}

function createRecorder(ticks = [10n, 20n, 30n], labels = [
  '2026-08-21T00:00:10.000Z',
  '2026-08-21T00:00:05.000Z',
  '2026-08-21T00:00:00.000Z',
]) {
  return createEvaluationRecorder({
    plan,
    clock: () => ticks.shift(),
    utcNow: () => labels.shift(),
  });
}

test('recorder owns monotonic timestamps and lifecycle', () => {
  const recorder = createRecorder();

  recorder.handle(startCommand());
  recorder.handle({
    action: 'event',
    type: 'worker.start',
    actor: 'catalog',
    conflict_domain: 'src/catalog',
  });
  const result = recorder.handle({
    action: 'finish',
    quality_pass: true,
    invalid_reason: null,
    outputs: [],
  });

  assert.deepEqual(result.snapshot.events.map(({ monotonic_ns }) => monotonic_ns), [
    '10',
    '20',
    '30',
  ]);
  assert.equal(result.snapshot.duration_ns, '20');
  assert.equal(result.closed, true);
  assert.deepEqual(result.acknowledgement, {
    accepted: true,
    action: 'finish',
    monotonic_ns: '30',
  });
  assert.throws(() => {
    result.snapshot.outputs.push('changed');
  }, TypeError);
});

test('recorder rejects lifecycle violations before reading the clock', () => {
  let calls = 0;
  const recorder = createEvaluationRecorder({
    plan,
    clock: () => {
      calls += 1;
      return BigInt(calls);
    },
    utcNow: () => '2026-08-21T00:00:00.000Z',
  });

  assert.throws(
    () => recorder.handle({ action: 'event', type: 'poll', actor: 'controller' }),
    /before start/iu,
  );
  assert.equal(calls, 0);
  recorder.handle(startCommand());
  assert.throws(() => recorder.handle(startCommand()), /duplicate start/iu);
  assert.equal(calls, 1);
  recorder.handle({ action: 'finish', quality_pass: true, invalid_reason: null, outputs: [] });
  assert.throws(
    () => recorder.handle({ action: 'event', type: 'poll', actor: 'controller' }),
    /after finish/iu,
  );
  assert.equal(calls, 2);
});

test('recorder rejects a decreasing controller clock without mutating the trace', () => {
  const recorder = createRecorder([10n, 9n, 20n]);
  const started = recorder.handle(startCommand());

  assert.throws(
    () => recorder.handle({ action: 'event', type: 'poll', actor: 'controller' }),
    /decreased/iu,
  );
  const finished = recorder.handle({
    action: 'finish',
    quality_pass: false,
    invalid_reason: 'CONTROLLER_FAILURE',
    outputs: [],
  });

  assert.equal(started.snapshot.events.length, 1);
  assert.deepEqual(finished.snapshot.events.map(({ monotonic_ns }) => monotonic_ns), ['10', '20']);
  assert.equal(finished.snapshot.duration_ns, '10');
});

test('recorder validates closed command schemas and plan-derived values', () => {
  const invalidStartCommands = [
    startCommand({ extra: true }),
    startCommand({ variant: 'experimental' }),
    startCommand({ scenario_id: 'REQ-999' }),
    startCommand({ pair_id: 0 }),
    startCommand({ pair_id: 4 }),
    startCommand({ phase: 'warmup' }),
    startCommand({ run_id: 'r1\nforged' }),
    startCommand({ fixture_sha256: 'A'.repeat(64) }),
  ];
  for (const command of invalidStartCommands) {
    assert.throws(() => createRecorder().handle(command), /invalid|unknown|keys|newline/iu);
  }

  assert.throws(() => createRecorder().handle({ action: 'unknown' }), /unknown action/iu);

  const recorder = createRecorder();
  recorder.handle(startCommand());
  for (const command of [
    { action: 'event', type: 'worker.pause', actor: 'catalog' },
    { action: 'event', type: 'poll', actor: 'controller', extra: true },
    { action: 'event', type: 'poll', actor: 'controller\nforged' },
    { action: 'event', type: 'session.return', actor: 'agent', running: 'yes' },
  ]) {
    assert.throws(() => recorder.handle(command), /invalid|unknown|keys|newline/iu);
  }
});

test('recorder binds pair and variant validation to the selected scenario', () => {
  for (const command of [
    startCommand({ scenario_id: 'REQ-002', variant: 'draft_a34625a' }),
    startCommand({ scenario_id: 'EVAL-008', variant: 'without_skill' }),
    startCommand({ scenario_id: 'EVAL-008', pair_id: 4 }),
  ]) {
    assert.throws(() => createRecorder().handle(command), /scenario|variant|pair/iu);
  }

  const result = createRecorder().handle(startCommand({
    scenario_id: 'EVAL-008',
    pair_id: 3,
    variant: 'with_skill',
  }));
  assert.equal(result.snapshot.scenario_id, 'EVAL-008');
});

test('event types enforce their evidence-specific closed schemas', () => {
  const specs = [
    { type: 'agent.accepted', actor: 'agent' },
    { type: 'worker.start', actor: 'catalog', conflict_domain: 'src/catalog' },
    { type: 'worker.end', actor: 'catalog', conflict_domain: 'src/catalog' },
    { type: 'command.start', actor: 'shell', command: 'npm test', input_identity: digest },
    { type: 'session.return', actor: 'shell', command: 'npm test', input_identity: digest, running: true },
    { type: 'independent.start', actor: 'agent', conflict_domain: 'src/reporting' },
    { type: 'independent.end', actor: 'agent', conflict_domain: 'src/reporting' },
    { type: 'poll', actor: 'agent' },
    { type: 'wait', actor: 'agent' },
    { type: 'evidence', actor: 'agent' },
    { type: 'command.end', actor: 'shell', command: 'npm test', input_identity: digest },
    { type: 'agent.completed', actor: 'agent' },
  ];
  let tick = 0n;
  const recorder = createEvaluationRecorder({
    plan,
    clock: () => {
      tick += 1n;
      return tick;
    },
    utcNow: () => '2026-08-21T00:00:00.000Z',
  });
  recorder.handle(startCommand());

  for (const fields of specs) {
    const valid = { action: 'event', ...fields };
    for (const requiredField of Object.keys(fields).filter((key) => key !== 'type')) {
      const missing = { ...valid };
      delete missing[requiredField];
      assert.throws(
        () => recorder.handle(missing),
        /missing|required/iu,
        `${fields.type}: missing ${requiredField}`,
      );

      const wrongType = {
        ...valid,
        [requiredField]: requiredField === 'running' ? 'yes' : 1,
      };
      assert.throws(
        () => recorder.handle(wrongType),
        /invalid/iu,
        `${fields.type}: invalid ${requiredField}`,
      );
    }

    const forbidden = Object.hasOwn(fields, 'conflict_domain')
      ? { ...valid, running: false }
      : { ...valid, conflict_domain: 'forbidden' };
    assert.throws(() => recorder.handle(forbidden), /unknown|keys/iu, `${fields.type}: forbidden`);
    assert.equal(recorder.handle(valid).acknowledgement.accepted, true);
  }
});

test('accessors and proxies are rejected without consuming a clock tick', () => {
  let clockCalls = 0;
  let getterCalls = 0;
  let proxyTraps = 0;
  const recorder = createEvaluationRecorder({
    plan,
    clock: () => {
      clockCalls += 1;
      return BigInt(clockCalls);
    },
    utcNow: () => '2026-08-21T00:00:00.000Z',
  });
  const accessorCommand = startCommand();
  Object.defineProperty(accessorCommand, 'run_id', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'forged';
    },
  });
  assert.throws(() => recorder.handle(accessorCommand), /accessor/iu);
  assert.equal(getterCalls, 0);
  assert.equal(clockCalls, 0);

  const proxiedCommand = new Proxy(startCommand(), {
    get(target, key, receiver) {
      proxyTraps += 1;
      return Reflect.get(target, key, receiver);
    },
    ownKeys(target) {
      proxyTraps += 1;
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(() => recorder.handle(proxiedCommand), /proxy/iu);
  assert.equal(proxyTraps, 0);
  assert.equal(clockCalls, 0);
  assert.equal(recorder.handle(startCommand()).snapshot.events.length, 1);
});

test('nested hostile outputs do not consume time or partially finish the run', () => {
  for (const makeOutput of [
    () => {
      let getterCalls = 0;
      const output = {};
      Object.defineProperty(output, 'command', {
        enumerable: true,
        get() {
          getterCalls += 1;
          return 'npm test';
        },
      });
      return { output, observed: () => getterCalls };
    },
    () => {
      let proxyTraps = 0;
      const output = new Proxy({ command: 'npm test' }, {
        ownKeys(target) {
          proxyTraps += 1;
          return Reflect.ownKeys(target);
        },
      });
      return { output, observed: () => proxyTraps };
    },
  ]) {
    let clockCalls = 0;
    const recorder = createEvaluationRecorder({
      plan,
      clock: () => {
        clockCalls += 1;
        return BigInt(clockCalls);
      },
      utcNow: () => '2026-08-21T00:00:00.000Z',
    });
    recorder.handle(startCommand());
    const hostile = makeOutput();
    assert.throws(() => recorder.handle({
      action: 'finish',
      quality_pass: true,
      invalid_reason: null,
      outputs: [hostile.output],
    }), /accessor|proxy/iu);
    assert.equal(hostile.observed(), 0);
    assert.equal(clockCalls, 1);

    const safeOutputs = [{ command: 'npm test', exit_code: 0 }];
    const result = recorder.handle({
      action: 'finish',
      quality_pass: true,
      invalid_reason: null,
      outputs: safeOutputs,
    });
    safeOutputs[0].command = 'changed after handle';
    assert.equal(result.snapshot.outputs[0].command, 'npm test');
    assert.deepEqual(result.snapshot.events.map(({ monotonic_ns }) => monotonic_ns), ['1', '2']);
  }
});

test('recorder accepts only allowlisted invalid reasons and newline-free outputs', () => {
  const invalidReasonRecorder = createRecorder();
  invalidReasonRecorder.handle(startCommand());
  assert.throws(
    () => invalidReasonRecorder.handle({
      action: 'finish',
      quality_pass: false,
      invalid_reason: 'TIMEOUT',
      outputs: [],
    }),
    /invalid reason/iu,
  );

  const newlineRecorder = createRecorder();
  newlineRecorder.handle(startCommand());
  assert.throws(
    () => newlineRecorder.handle({
      action: 'finish',
      quality_pass: true,
      invalid_reason: null,
      outputs: [{ command: 'npm test\nignored', exit_code: 0 }],
    }),
    /newline/iu,
  );

  const newlineKeyRecorder = createRecorder();
  newlineKeyRecorder.handle(startCommand());
  assert.throws(
    () => newlineKeyRecorder.handle({
      action: 'finish',
      quality_pass: true,
      invalid_reason: null,
      outputs: [{ 'forged\nkey': true }],
    }),
    /newline/iu,
  );
});

test('plan allowlists cannot introduce newline-bearing command values', () => {
  const invalidReasonPlan = structuredClone(plan);
  invalidReasonPlan.invalid_reasons.push('FORGED\nREASON');
  assert.throws(
    () => createEvaluationRecorder({
      plan: invalidReasonPlan,
      clock: () => 1n,
      utcNow: () => '2026-08-21T00:00:00.000Z',
    }),
    /newline/iu,
  );

  const invalidVariantPlan = structuredClone(plan);
  invalidVariantPlan.scenarios['REQ-003'].primary_baseline = 'forged\nvariant';
  assert.throws(
    () => createEvaluationRecorder({
      plan: invalidVariantPlan,
      clock: () => 1n,
      utcNow: () => '2026-08-21T00:00:00.000Z',
    }),
    /newline/iu,
  );
});

test('record CLI persists acknowledgements and an exact closed trace', async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'accelerator-recorder-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const commands = [
    startCommand(),
    {
      action: 'event',
      type: 'session.return',
      actor: 'agent',
      command: 'npm test',
      input_identity: digest,
      running: true,
    },
    {
      action: 'finish',
      quality_pass: true,
      invalid_reason: null,
      outputs: [{ command: 'npm test', exit_code: 0 }],
    },
  ];
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, 'record', '--plan', PLAN_PATH, '--output-dir', outputDir],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      input: `${commands.map((command) => JSON.stringify(command)).join('\n')}\n`,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const acknowledgements = result.stdout.trim().split(/\r?\n/u).map(JSON.parse);
  assert.equal(acknowledgements.length, 3);
  assert.deepEqual(acknowledgements.map(({ accepted, action }) => ({ accepted, action })), [
    { accepted: true, action: 'start' },
    { accepted: true, action: 'event' },
    { accepted: true, action: 'finish' },
  ]);

  const trace = JSON.parse(await readFile(path.join(outputDir, 'controller-trace.json'), 'utf8'));
  const timestamps = acknowledgements.map(({ monotonic_ns }) => monotonic_ns);
  assert.deepEqual(trace, {
    schema_version: 1,
    run_id: 'r1',
    scenario_id: 'REQ-003',
    pair_id: 1,
    phase: 'pilot',
    variant: 'with_skill',
    fixture_sha256: digest,
    skill_sha256: digest,
    started_at_utc: trace.started_at_utc,
    finished_at_utc: trace.finished_at_utc,
    duration_ns: (BigInt(timestamps[2]) - BigInt(timestamps[0])).toString(),
    quality_pass: true,
    invalid_reason: null,
    outputs: [{ command: 'npm test', exit_code: 0 }],
    events: [
      {
        action: 'start',
        utc: trace.started_at_utc,
        monotonic_ns: timestamps[0],
      },
      {
        action: 'event',
        type: 'session.return',
        actor: 'agent',
        command: 'npm test',
        input_identity: digest,
        running: true,
        utc: trace.events[1].utc,
        monotonic_ns: timestamps[1],
      },
      {
        action: 'finish',
        utc: trace.finished_at_utc,
        monotonic_ns: timestamps[2],
      },
    ],
  });
  assert.match(trace.started_at_utc, /^\d{4}-\d{2}-\d{2}T/u);
  assert.match(trace.finished_at_utc, /^\d{4}-\d{2}-\d{2}T/u);
  assert.equal(trace.duration_ns, (BigInt(trace.events[2].monotonic_ns)
    - BigInt(trace.events[0].monotonic_ns)).toString());
  assert.deepEqual(await readdir(outputDir), ['controller-trace.json']);
});

test('record CLI leaves the last complete JSON after a rejected line', async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'accelerator-recorder-invalid-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, 'record', '--plan', PLAN_PATH, '--output-dir', outputDir],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      input: `${JSON.stringify(startCommand())}\n{"action":"event"}\n`,
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim().split(/\r?\n/u).length, 1);
  const trace = JSON.parse(await readFile(path.join(outputDir, 'controller-trace.json'), 'utf8'));
  assert.equal(trace.events.length, 1);
  assert.deepEqual(await readdir(outputDir), ['controller-trace.json']);
});

test('record CLI rejects empty and incomplete EOF while preserving complete snapshots', async (t) => {
  for (const input of ['', `${JSON.stringify(startCommand())}\n`]) {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'accelerator-recorder-eof-'));
    t.after(() => rm(outputDir, { recursive: true, force: true }));
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, 'record', '--plan', PLAN_PATH, '--output-dir', outputDir],
      { cwd: PROJECT_ROOT, encoding: 'utf8', input },
    );
    assert.equal(result.status, 1);
    if (input !== '') {
      const trace = JSON.parse(await readFile(path.join(outputDir, 'controller-trace.json'), 'utf8'));
      assert.equal(trace.events.length, 1);
    } else {
      assert.deepEqual(await readdir(outputDir), []);
    }
  }
});

test('record CLI exits after the durable finish acknowledgement without stdin EOF', async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'accelerator-recorder-open-stdin-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const child = spawn(
    process.execPath,
    [SCRIPT_PATH, 'record', '--plan', PLAN_PATH, '--output-dir', outputDir],
    { cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  t.after(() => child.kill());
  child.stdin.on('error', () => {});
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const commands = [
    startCommand(),
    { action: 'event', type: 'poll', actor: 'agent' },
    { action: 'finish', quality_pass: true, invalid_reason: null, outputs: [] },
  ];
  child.stdin.write(`${commands.map(JSON.stringify).join('\n')}\n`);

  const [exitCode] = await once(child, 'exit', { signal: AbortSignal.timeout(3000) });
  assert.equal(exitCode, 0, stderr);
  assert.equal(stdout.trim().split(/\r?\n/u).length, 3);
  assert.equal(JSON.parse(await readFile(
    path.join(outputDir, 'controller-trace.json'),
    'utf8',
  )).events.length, 3);
});

test('record CLI treats a lost acknowledgement as failure', async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'accelerator-recorder-epipe-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const child = spawn(
    process.execPath,
    [SCRIPT_PATH, 'record', '--plan', PLAN_PATH, '--output-dir', outputDir],
    { cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  t.after(() => child.kill());
  child.stdin.on('error', () => {});
  child.stdout.destroy();
  child.stdin.end(`${JSON.stringify(startCommand())}\n`);

  const [exitCode] = await once(child, 'exit', { signal: AbortSignal.timeout(3000) });
  assert.equal(exitCode, 1);
  assert.equal(JSON.parse(await readFile(
    path.join(outputDir, 'controller-trace.json'),
    'utf8',
  )).events.length, 1);
});

test('record CLI rejects malformed JSON and unresolved output directories', async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'accelerator-recorder-path-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const malformed = spawnSync(
    process.execPath,
    [SCRIPT_PATH, 'record', '--plan', PLAN_PATH, '--output-dir', outputDir],
    { cwd: PROJECT_ROOT, encoding: 'utf8', input: '{\n' },
  );
  assert.equal(malformed.status, 1);
  assert.deepEqual(await readdir(outputDir), []);

  const unresolved = `${outputDir}${path.sep}missing${path.sep}..`;
  for (const directory of ['.', unresolved]) {
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, 'record', '--plan', PLAN_PATH, '--output-dir', directory],
      { cwd: PROJECT_ROOT, encoding: 'utf8', input: '' },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /resolved absolute path/iu);
  }
});

test('record CLI preserves the accepted event snapshot after malformed JSON', async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'accelerator-recorder-event-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, 'record', '--plan', PLAN_PATH, '--output-dir', outputDir],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      input: `${JSON.stringify(startCommand())}\n${JSON.stringify({
        action: 'event',
        type: 'poll',
        actor: 'agent',
      })}\n{\n`,
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim().split(/\r?\n/u).length, 2);
  const trace = JSON.parse(await readFile(path.join(outputDir, 'controller-trace.json'), 'utf8'));
  assert.deepEqual(trace.events.map(({ action, type }) => ({ action, type })), [
    { action: 'start', type: undefined },
    { action: 'event', type: 'poll' },
  ]);
});

test('record CLI retries a temp collision without deleting the foreign file', async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'accelerator-recorder-collision-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const child = spawn(
    process.execPath,
    [SCRIPT_PATH, 'record', '--plan', PLAN_PATH, '--output-dir', outputDir],
    { cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  t.after(() => child.kill());
  child.stdin.on('error', () => {});
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const collisionPath = path.join(
    outputDir,
    `.controller-trace.json.${child.pid}.1.tmp`,
  );
  await writeFile(collisionPath, 'foreign-bytes', 'utf8');
  child.stdin.write(`${[
    startCommand(),
    { action: 'finish', quality_pass: true, invalid_reason: null, outputs: [] },
  ].map(JSON.stringify).join('\n')}\n`);

  const [exitCode] = await once(child, 'exit', { signal: AbortSignal.timeout(3000) });
  assert.equal(exitCode, 0, stderr);
  assert.equal(await readFile(collisionPath, 'utf8'), 'foreign-bytes');
  assert.deepEqual((await readdir(outputDir)).sort(), [
    path.basename(collisionPath),
    'controller-trace.json',
  ].sort());
});
