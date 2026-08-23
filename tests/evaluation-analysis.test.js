import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { analyzeEvaluation, medianNanoseconds } from '../src/evaluation-analysis.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'evaluate-accelerator.js');
const PLAN_PATH = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'legacy-evaluation-plan.json');
const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8'));
const hardenedPlan = structuredClone(plan);
hardenedPlan.scenarios['REQ-003'].required_worker_domains = ['src/catalog', 'src/billing'];
const fixtureDigest = '1'.repeat(64);
const skillDigest = '2'.repeat(64);
const inputDigests = ['3'.repeat(64), '4'.repeat(64), '5'.repeat(64)];

function event(type, monotonicNs, fields = {}) {
  return {
    action: 'event',
    type,
    actor: fields.actor ?? 'agent',
    ...fields,
    monotonic_ns: String(monotonicNs),
    utc: '2026-08-21T00:00:00.000Z',
  };
}

function commandEvents(commands, start = 20n) {
  return commands.flatMap((command, index) => {
    const tick = start + BigInt(index * 2);
    return [
      event('command.start', tick, {
        actor: 'shell',
        command,
        input_identity: inputDigests[index],
      }),
      event('command.end', tick + 1n, {
        actor: 'shell',
        command,
        input_identity: inputDigests[index],
      }),
    ];
  });
}

function trace({
  runId,
  scenarioId,
  pairId,
  phase = 'formal',
  variant,
  durationNs,
  qualityPass = true,
  invalidReason = null,
  fixtureSha256 = fixtureDigest,
  skillSha256 = skillDigest,
  events,
  outputs,
  startNs = 0n,
}) {
  const scenario = plan.scenarios[scenarioId];
  const requiredCommands = scenario?.required_commands ?? [];
  const evidenceEvents = (events ?? commandEvents(requiredCommands)).map((item) => ({
    ...item,
    monotonic_ns: (startNs + BigInt(item.monotonic_ns)).toString(),
  }));
  const resourceOutputs = outputs ?? requiredCommands.map((command, index) => ({
    command,
    input_identity: inputDigests[index],
    exit_code: 0,
  }));
  return {
    schema_version: 1,
    run_id: runId,
    scenario_id: scenarioId,
    pair_id: pairId,
    phase,
    variant,
    fixture_sha256: fixtureSha256,
    skill_sha256: skillSha256,
    started_at_utc: '2026-08-21T00:00:00.000Z',
    finished_at_utc: '2026-08-21T00:00:01.000Z',
    duration_ns: String(durationNs),
    quality_pass: qualityPass,
    invalid_reason: invalidReason,
    outputs: resourceOutputs,
    events: [
      { action: 'start', monotonic_ns: startNs.toString(), utc: '2026-08-21T00:00:00.000Z' },
      ...evidenceEvents,
      {
        action: 'finish',
        monotonic_ns: (startNs + BigInt(durationNs)).toString(),
        utc: '2026-08-21T00:00:01.000Z',
      },
    ],
  };
}

function workerEvents() {
  return [
    event('agent.accepted', 1n, { actor: 'catalog' }),
    event('agent.accepted', 2n, { actor: 'billing' }),
    event('worker.start', 3n, { actor: 'catalog', conflict_domain: 'src/catalog' }),
    event('worker.start', 4n, { actor: 'billing', conflict_domain: 'src/billing' }),
    event('worker.end', 8n, { actor: 'catalog', conflict_domain: 'src/catalog' }),
    event('worker.end', 9n, { actor: 'billing', conflict_domain: 'src/billing' }),
    event('agent.completed', 10n, { actor: 'catalog' }),
    event('agent.completed', 11n, { actor: 'billing' }),
    ...commandEvents(plan.scenarios['REQ-003'].required_commands),
  ];
}

function req003Pairs({ skill = [60n, 70n, 80n], baseline = [90n, 100n, 110n] } = {}) {
  const draft = [85n, 95n, 105n];
  const traces = [];
  for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
    const pairId = pairIndex + 1;
    for (const [orderIndex, variant] of plan.scenarios['REQ-003'].orders[pairIndex].entries()) {
      const durationNs = variant === 'with_skill'
        ? skill[pairIndex]
        : variant === 'without_skill'
          ? baseline[pairIndex]
          : draft[pairIndex];
      traces.push(trace({
        runId: `req003-${pairId}-${variant}`,
        scenarioId: 'REQ-003',
        pairId,
        variant,
        durationNs,
        startNs: BigInt(pairIndex * 100_000 + orderIndex * 100),
        events: variant === 'with_skill' ? workerEvents() : undefined,
      }));
    }
  }
  return traces;
}

function req002Pairs({ skill = [23_000_000_000n, 23_000_000_000n, 23_000_000_000n], baseline = [20_000_000_000n, 20_000_000_000n, 20_000_000_000n] } = {}) {
  const traces = [];
  for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
    const pairId = pairIndex + 1;
    for (const [orderIndex, variant] of plan.scenarios['REQ-002'].orders[pairIndex].entries()) {
      traces.push(trace({
        runId: `req002-${pairId}-${variant}`,
        scenarioId: 'REQ-002',
        pairId,
        variant,
        durationNs: variant === 'with_skill' ? skill[pairIndex] : baseline[pairIndex],
        startNs: BigInt(pairIndex * 100_000 + orderIndex * 100),
      }));
    }
  }
  return traces;
}

function overlapEvents({
  running = true,
  sessionReturn = 1_000_000_000n,
  independentStart = 2_000_000_000n,
  independentEnd = 3_000_000_000n,
  commandEnd = 17_000_000_000n,
  intervening = [],
} = {}) {
  const [corpus, reporting, aggregate] = plan.scenarios['EVAL-008'].required_commands;
  return [
    event('command.start', 100n, {
      actor: 'shell', command: corpus, input_identity: inputDigests[0],
    }),
    event('session.return', sessionReturn, {
      actor: 'shell', command: corpus, input_identity: inputDigests[0], running,
    }),
    ...intervening,
    event('independent.start', independentStart, {
      actor: 'reporting', conflict_domain: 'src/reporting',
    }),
    event('independent.end', independentEnd, {
      actor: 'reporting', conflict_domain: 'src/reporting',
    }),
    event('command.end', commandEnd, {
      actor: 'shell', command: corpus, input_identity: inputDigests[0],
    }),
    ...[reporting, aggregate].flatMap((command, index) => {
      const tick = commandEnd + 1n + BigInt(index * 2);
      return [
        event('command.start', tick, {
          actor: 'shell', command, input_identity: inputDigests[index + 1],
        }),
        event('command.end', tick + 1n, {
          actor: 'shell', command, input_identity: inputDigests[index + 1],
        }),
      ];
    }),
  ];
}

function eval008Runs(eventOptions = {}) {
  return [1, 2, 3].map((pairId) => trace({
    runId: `eval008-${pairId}-with_skill`,
    scenarioId: 'EVAL-008',
    pairId,
    variant: 'with_skill',
    durationNs: 20_000_000_000n,
    startNs: BigInt(pairId) * 30_000_000_000n,
    events: overlapEvents(eventOptions),
  }));
}

function shiftTraceStart(item, newStart) {
  const previousStart = BigInt(item.events[0].monotonic_ns);
  const delta = newStart - previousStart;
  for (const traceEvent of item.events) {
    traceEvent.monotonic_ns = (BigInt(traceEvent.monotonic_ns) + delta).toString();
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function sortMiddleEvents(item) {
  const start = item.events[0];
  const finish = item.events.at(-1);
  const middle = item.events.slice(1, -1).sort((left, right) => (
    BigInt(left.monotonic_ns) < BigInt(right.monotonic_ns)
      ? -1
      : BigInt(left.monotonic_ns) > BigInt(right.monotonic_ns) ? 1 : 0
  ));
  item.events = [start, ...middle, finish];
}

function completeSuite() {
  return [...req003Pairs(), ...req002Pairs(), ...eval008Runs()];
}

test('forms exactly three REQ-003 pairs and rejects a valid fourth sample', () => {
  const threePassingPairs = req003Pairs();
  assert.equal(analyzeEvaluation(plan, threePassingPairs).formal_pairs.length, 3);

  const extraPair = plan.scenarios['REQ-003'].orders[0].map((variant) => trace({
    runId: `req003-extra-${variant}`,
    scenarioId: 'REQ-003',
    pairId: 4,
    variant,
    durationNs: 100n,
    events: variant === 'with_skill' ? workerEvents() : undefined,
  }));
  assert.equal(
    analyzeEvaluation(plan, [...threePassingPairs, ...extraPair]).issues[0].code,
    'FORMAL_SAMPLE_LIMIT_EXCEEDED',
  );
});

test('valid slow and quality-failed runs consume their registered slots', () => {
  const slow = req003Pairs();
  slow.find(({ variant }) => variant === 'with_skill').run_id = 'slow-with-skill';
  const slowTrace = slow.find(({ run_id }) => run_id === 'slow-with-skill');
  slowTrace.duration_ns = '999999999999999999999';
  slowTrace.events.at(-1).monotonic_ns = (
    BigInt(slowTrace.events[0].monotonic_ns) + BigInt(slowTrace.duration_ns)
  ).toString();
  const slowResult = analyzeEvaluation(plan, slow);
  assert.equal(slowResult.valid_runs.includes('slow-with-skill'), true);
  assert.equal(slowResult.formal_pairs.length, 3);
  assert.equal(slowResult.stopped.req003, true);

  const failed = completeSuite();
  failed.find(({ scenario_id, variant }) => scenario_id === 'REQ-003' && variant === 'with_skill').quality_pass = false;
  const failedResult = analyzeEvaluation(plan, failed);
  assert.equal(failedResult.maturity_pass, false);
  assert.equal(failedResult.formal_pairs.length, 6);
  assert.equal(failedResult.stopped.all, true);
});

test('preserves invalid attempts and reports reasons outside the plan allowlist', () => {
  const allowlisted = trace({
    runId: 'invalid-infrastructure-attempt', scenarioId: 'REQ-003', pairId: 1,
    variant: 'with_skill', durationNs: 100n, invalidReason: 'TRACE_MISSING',
  });
  const unknown = trace({
    runId: 'unknown-invalid-reason', scenarioId: 'REQ-003', pairId: 1,
    variant: 'with_skill', durationNs: 100n, invalidReason: 'TOO_SLOW',
  });
  const result = analyzeEvaluation(plan, [allowlisted, unknown]);
  assert.equal(result.issues[0].code, 'INVALID_REASON_UNREGISTERED');
  assert.deepEqual(result.invalid_runs.map(({ trace: item }) => item.run_id), ['invalid-infrastructure-attempt']);
  assert.deepEqual(result.invalid_runs[0], {
    attempt_index: 0,
    invalid_reason: 'TRACE_MISSING',
    trace: allowlisted,
  });
  assert.deepEqual(result.valid_runs, ['unknown-invalid-reason']);
});

test('an unregistered reason cannot discard a quality-failed formal slot', () => {
  const traces = req003Pairs();
  const target = traces.find(({ pair_id: pairId, variant }) => (
    pairId === 1 && variant === 'with_skill'
  ));
  target.invalid_reason = 'BEHAVIOR_FAILURE';
  target.quality_pass = false;
  const result = analyzeEvaluation(plan, traces);
  assert.equal(result.valid_runs.includes(target.run_id), true);
  assert.equal(result.formal_pairs.length, 3);
  assert.equal(result.stopped.req003, true);
  assert.equal(result.maturity_pass, false);
});

test('rejects corrupted closed trace schemas before aggregation', () => {
  const corruptions = [
    (item) => { item.schema_version = 2; },
    (item) => { item.extra = true; },
    (item) => { item.events[1].extra = true; },
    (item) => { item.events[1].type = 'agent.claimed'; },
    (item) => { item.events.shift(); },
    (item) => { item.events.pop(); },
    (item) => {
      const first = item.events[0];
      item.events[0] = item.events.at(-1);
      item.events[item.events.length - 1] = first;
    },
    (item) => { item.events[2].monotonic_ns = item.events[0].monotonic_ns; },
    (item) => { item.duration_ns = (BigInt(item.duration_ns) - 1n).toString(); },
    (item) => { item.started_at_utc = '2026-08-21T00:00:02.000Z'; },
  ];
  for (const corrupt of corruptions) {
    const item = structuredClone(req003Pairs()[0]);
    corrupt(item);
    assert.throws(() => analyzeEvaluation(hardenedPlan, [item]), /trace|event|duration|schema|lifecycle/iu);
  }
});

test('rejects malformed required command intervals and command order', () => {
  const mutations = [
    (item) => {
      item.events = item.events.filter(({ command }) => command !== 'npm run test:catalog');
    },
    (item) => {
      const start = item.events.find(({ type }) => type === 'command.start');
      const end = item.events.find(({ type }) => type === 'command.end');
      start.type = 'command.end';
      end.type = 'command.start';
    },
    (item) => {
      for (const commandEvent of item.events.filter(({ command }) => (
        command === 'npm run test:catalog' || command === 'npm run test:billing'
      ))) {
        commandEvent.command = commandEvent.command === 'npm run test:catalog'
          ? 'npm run test:billing'
          : 'npm run test:catalog';
        commandEvent.input_identity = commandEvent.command === 'npm run test:catalog'
          ? inputDigests[0]
          : inputDigests[1];
      }
    },
    (item) => {
      const index = item.events.findIndex(({ type }) => type === 'command.end');
      item.events.splice(index, 1);
    },
    (item) => {
      const start = item.events.find(({ type }) => type === 'command.start');
      const end = item.events.find(({ type }) => type === 'command.end');
      item.events.splice(-1, 0,
        { ...start, monotonic_ns: (BigInt(item.events.at(-1).monotonic_ns) - 2n).toString() },
        { ...end, monotonic_ns: (BigInt(item.events.at(-1).monotonic_ns) - 1n).toString() });
    },
    (item) => {
      const finish = BigInt(item.events.at(-1).monotonic_ns);
      item.events.splice(-1, 0,
        event('command.start', finish - 2n, {
          actor: 'shell', command: 'npm run extra', input_identity: '6'.repeat(64),
        }),
        event('command.end', finish - 1n, {
          actor: 'shell', command: 'npm run extra', input_identity: '6'.repeat(64),
        }));
    },
  ];
  for (const mutate of mutations) {
    const item = structuredClone(req003Pairs()[1]);
    mutate(item);
    assert.throws(() => analyzeEvaluation(hardenedPlan, [item]), /command|interval|order|event/iu);
  }
});

test('rejects incomplete or ambiguous worker intervals', () => {
  const orphan = structuredClone(req003Pairs()[0]);
  orphan.events.splice(orphan.events.findIndex(({ type }) => type === 'worker.end'), 1);
  assert.throws(() => analyzeEvaluation(hardenedPlan, [orphan]), /worker|interval/iu);

  const orphanEnd = structuredClone(req003Pairs()[0]);
  orphanEnd.events.splice(orphanEnd.events.findIndex(({ type }) => type === 'worker.start'), 1);
  assert.throws(() => analyzeEvaluation(hardenedPlan, [orphanEnd]), /worker|interval/iu);

  const duplicate = structuredClone(req003Pairs()[0]);
  duplicate.events.splice(-1, 0,
    event('worker.start', BigInt(duplicate.events.at(-1).monotonic_ns) - 2n, {
      actor: 'catalog', conflict_domain: 'src/catalog',
    }),
    event('worker.end', BigInt(duplicate.events.at(-1).monotonic_ns) - 1n, {
      actor: 'catalog', conflict_domain: 'src/catalog',
    }));
  assert.throws(() => analyzeEvaluation(hardenedPlan, [duplicate]), /worker|interval|duplicate/iu);
});

test('worker proof requires plan domains, one actor per domain, and complete agent lifecycle', () => {
  assert.equal(analyzeEvaluation(hardenedPlan, req003Pairs()).req003.worker_parallelism_pass, true);

  const sequentialDifferentActor = req003Pairs();
  for (const item of sequentialDifferentActor.filter(({ variant }) => variant === 'with_skill')) {
    for (const workerEvent of item.events.filter(({ actor, type }) => (
      actor === 'billing' && type?.startsWith('worker.')
    ))) {
      workerEvent.conflict_domain = 'src/catalog';
      workerEvent.monotonic_ns = (BigInt(item.events[0].monotonic_ns)
        + (workerEvent.type === 'worker.start' ? 11n : 12n)).toString();
    }
    item.events.find(({ type, actor }) => type === 'agent.completed' && actor === 'billing').monotonic_ns = (
      BigInt(item.events[0].monotonic_ns) + 13n
    ).toString();
    sortMiddleEvents(item);
  }
  assert.equal(
    analyzeEvaluation(hardenedPlan, sequentialDifferentActor).req003.worker_parallelism_pass,
    false,
  );

  for (const lifecycleType of ['agent.accepted', 'agent.completed']) {
    const missingLifecycle = req003Pairs();
    for (const item of missingLifecycle.filter(({ variant }) => variant === 'with_skill')) {
      item.events.splice(item.events.findIndex(({ type }) => type === lifecycleType), 1);
    }
    assert.equal(
      analyzeEvaluation(hardenedPlan, missingLifecycle).req003.worker_parallelism_pass,
      false,
    );
  }

  const wrongDomains = req003Pairs();
  for (const item of wrongDomains.filter(({ variant }) => variant === 'with_skill')) {
    for (const workerEvent of item.events.filter(({ type }) => type?.startsWith('worker.'))) {
      workerEvent.conflict_domain = `${workerEvent.conflict_domain}-wrong`;
    }
  }
  assert.equal(analyzeEvaluation(hardenedPlan, wrongDomains).req003.worker_parallelism_pass, false);
});

test('requires scenario-specific order and matching fixture, resource, and Skill identities', () => {
  const wrongOrder = req003Pairs();
  const firstStart = BigInt(wrongOrder[0].events[0].monotonic_ns);
  const secondStart = BigInt(wrongOrder[1].events[0].monotonic_ns);
  shiftTraceStart(wrongOrder[0], secondStart);
  shiftTraceStart(wrongOrder[1], firstStart);
  assert.equal(analyzeEvaluation(plan, wrongOrder).formal_pairs.length, 2);
  assert.equal(analyzeEvaluation(plan, wrongOrder).issues.some(({ code }) => code === 'PAIR_ORDER_MISMATCH'), true);

  for (const mutate of [
    (item) => { item.fixture_sha256 = '9'.repeat(64); },
    (item) => { item.skill_sha256 = '8'.repeat(64); },
    (item) => {
      for (const commandEvent of item.events.filter(({ command }) => command === 'npm run test:catalog')) {
        commandEvent.input_identity = '7'.repeat(64);
      }
    },
  ]) {
    const mismatched = req003Pairs();
    mutate(mismatched[1]);
    const result = analyzeEvaluation(plan, mismatched);
    assert.equal(result.formal_pairs.length, 2);
    assert.equal(result.issues.some(({ code }) => code === 'PAIR_IDENTITY_MISMATCH'), true);
  }

  const mislabeled = req003Pairs();
  mislabeled[0].scenario_id = 'REQ-002';
  assert.throws(() => analyzeEvaluation(plan, mislabeled), /command|order/iu);
});

test('rejects identity drift between otherwise complete formal pairs', () => {
  for (const mutatePair of [
    (pair) => pair.forEach((item) => { item.fixture_sha256 = '9'.repeat(64); }),
    (pair) => pair.forEach((item) => { item.skill_sha256 = '8'.repeat(64); }),
    (pair) => pair.forEach((item) => {
      for (const commandEvent of item.events.filter(({ command }) => command === 'npm run test:catalog')) {
        commandEvent.input_identity = '7'.repeat(64);
      }
    }),
  ]) {
    const traces = req003Pairs();
    mutatePair(traces.filter(({ pair_id: pairId }) => pairId === 2));
    const result = analyzeEvaluation(plan, traces);
    assert.equal(result.issues.some(({ code }) => code === 'FORMAL_IDENTITY_MISMATCH'), true);
    assert.equal(result.req003.pass, false);
    assert.equal(result.req003.speedup_percent, null);
    assert.equal(result.stopped.req003, false);
  }
});

test('uses controller-stamped command events rather than untyped outputs for resource identity', () => {
  const traces = req003Pairs();
  for (const item of traces) {
    item.outputs = item.outputs.map(({ command, exit_code: exitCode }) => ({
      command,
      exit_code: exitCode,
    }));
  }
  const result = analyzeEvaluation(plan, traces);
  assert.equal(result.formal_pairs.length, 3);
  assert.equal(result.req003.identity_pass, true);
});

test('excludes pilot runs from formal medians and stop counts', () => {
  const formal = req003Pairs();
  const pilot = trace({
    runId: 'pilot-with-skill', scenarioId: 'REQ-003', pairId: 1, phase: 'pilot',
    variant: 'with_skill', durationNs: 999_999_999_999n, events: workerEvents(),
  });
  const result = analyzeEvaluation(plan, [pilot, ...formal]);
  assert.equal(result.req003.skill_median_ns, '70');
  assert.equal(result.stopped.req003, true);
  assert.equal(result.valid_runs.includes('pilot-with-skill'), true);
});

test('rejects unregistered scenarios after validating every interval lifecycle', () => {
  const valid = structuredClone(req003Pairs()[0]);
  valid.scenario_id = 'EVAL-011';
  assert.throws(() => analyzeEvaluation(hardenedPlan, [valid]), /scenario.*registered/iu);

  const malformed = [
    ['worker', structuredClone(req003Pairs()[0]), 'worker.end'],
    ['independent', structuredClone(eval008Runs()[0]), 'independent.end'],
    ['command', structuredClone(req003Pairs()[0]), 'command.end'],
  ];
  for (const [label, item, missingType] of malformed) {
    item.scenario_id = 'EVAL-011';
    item.events.splice(item.events.findIndex(({ type }) => type === missingType), 1);
    assert.throws(() => analyzeEvaluation(hardenedPlan, [item]), new RegExp(`${label}|interval`, 'iu'));
  }
});

test('derives pair execution order only from unique controller start stamps', () => {
  const ordered = req003Pairs();
  const reversedInput = [...ordered].reverse();
  const result = analyzeEvaluation(hardenedPlan, reversedInput);
  assert.equal(result.formal_pairs.length, 3);
  assert.deepEqual(result.formal_pairs[0].run_ids, [
    'req003-1-with_skill',
    'req003-1-without_skill',
    'req003-1-draft_a34625a',
  ]);

  const ambiguous = req003Pairs();
  shiftTraceStart(ambiguous[1], BigInt(ambiguous[0].events[0].monotonic_ns));
  const ambiguousResult = analyzeEvaluation(hardenedPlan, ambiguous);
  assert.equal(ambiguousResult.formal_pairs.length, 2);
  assert.equal(
    ambiguousResult.issues.some(({ code }) => code === 'PAIR_START_ORDER_AMBIGUOUS'),
    true,
  );
});

test('stops only after three distinct complete preregistered pair slots', () => {
  const pairOne = req003Pairs().filter(({ pair_id: pairId }) => pairId === 1);
  const duplicates = [];
  for (let repeat = 0; repeat < 3; repeat += 1) {
    for (const source of pairOne) {
      const item = structuredClone(source);
      item.run_id = `${item.run_id}-duplicate-${repeat}`;
      shiftTraceStart(item, BigInt(item.events[0].monotonic_ns) + BigInt(repeat * 1_000));
      duplicates.push(item);
    }
  }
  assert.equal(analyzeEvaluation(hardenedPlan, duplicates).stopped.req003, false);
  assert.equal(analyzeEvaluation(hardenedPlan, req003Pairs()).stopped.req003, true);
});

test('does not mutate deeply frozen plan or trace inputs', () => {
  const frozenPlan = deepFreeze(structuredClone(hardenedPlan));
  const frozenTraces = deepFreeze(completeSuite());
  const beforePlan = structuredClone(frozenPlan);
  const beforeTraces = structuredClone(frozenTraces);
  assert.doesNotThrow(() => analyzeEvaluation(frozenPlan, frozenTraces));
  assert.deepEqual(frozenPlan, beforePlan);
  assert.deepEqual(frozenTraces, beforeTraces);
});

test('rejects accessors and proxies without executing caller code', () => {
  const accessorTrace = req003Pairs()[0];
  let accessorReads = 0;
  Object.defineProperty(accessorTrace.outputs[0], 'derived', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 'caller-code-ran';
    },
  });
  assert.throws(() => analyzeEvaluation(hardenedPlan, [accessorTrace]), /accessor|JSON data/iu);
  assert.equal(accessorReads, 0);

  const proxyTrace = req003Pairs()[0];
  let proxyReads = 0;
  proxyTrace.outputs = [new Proxy({}, {
    ownKeys() {
      proxyReads += 1;
      return [];
    },
  })];
  assert.throws(() => analyzeEvaluation(hardenedPlan, [proxyTrace]), /proxy|JSON data/iu);
  assert.equal(proxyReads, 0);
});

test('normalizes the top-level trace array before any caller-controlled access', () => {
  const source = req003Pairs()[0];
  let proxyReads = 0;
  const proxy = new Proxy([source], {
    get(target, key, receiver) {
      proxyReads += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => analyzeEvaluation(hardenedPlan, proxy), /proxy|JSON data/iu);
  assert.equal(proxyReads, 0);

  let indexedReads = 0;
  const accessor = [source];
  Object.defineProperty(accessor, '0', {
    enumerable: true,
    get() {
      indexedReads += 1;
      return source;
    },
  });
  assert.throws(() => analyzeEvaluation(hardenedPlan, accessor), /accessor|JSON property/iu);
  assert.equal(indexedReads, 0);

  const invalidContainers = [
    (() => {
      const sparse = [];
      sparse.length = 1;
      return sparse;
    })(),
    Object.assign([source], { [Symbol('foreign')]: true }),
    (() => {
      const hidden = [source];
      Object.defineProperty(hidden, 'foreign', { value: true });
      return hidden;
    })(),
  ];
  for (const traces of invalidContainers) {
    assert.throws(() => analyzeEvaluation(hardenedPlan, traces), /array|string keys|JSON property/iu);
  }
});

test('normalizes the plan without executing caller accessors', () => {
  const accessorPlan = structuredClone(hardenedPlan);
  let accessorReads = 0;
  Object.defineProperty(accessorPlan, 'thresholds', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return hardenedPlan.thresholds;
    },
  });
  assert.throws(() => analyzeEvaluation(accessorPlan, []), /accessor|JSON data/iu);
  assert.equal(accessorReads, 0);
});

test('preserves inert __proto__ keys and rejects other non-JSON container shapes', () => {
  const protoTrace = trace({
    runId: 'proto-output', scenarioId: 'REQ-003', pairId: 1,
    variant: 'with_skill', durationNs: 100n, invalidReason: 'TRACE_MISSING',
    outputs: [JSON.parse('{"__proto__":{"safe":true}}')],
  });
  const protoResult = analyzeEvaluation(hardenedPlan, [protoTrace]);
  assert.deepEqual(protoResult.invalid_runs[0].trace.outputs, protoTrace.outputs);

  const invalidOutputs = [
    () => {
      const sparse = [];
      sparse.length = 2;
      return sparse;
    },
    () => {
      const cyclic = {};
      cyclic.self = cyclic;
      return cyclic;
    },
    () => {
      const symbolic = {};
      symbolic[Symbol('hidden')] = true;
      return symbolic;
    },
    () => {
      const hidden = {};
      Object.defineProperty(hidden, 'value', { enumerable: false, value: true });
      return hidden;
    },
  ];
  for (const makeOutput of invalidOutputs) {
    const item = structuredClone(protoTrace);
    item.outputs = [makeOutput()];
    assert.throws(() => analyzeEvaluation(hardenedPlan, [item]), /array|cycle|string keys|JSON property/iu);
  }
});

test('computes BigInt medians without Number precision loss', () => {
  assert.equal(medianNanoseconds([
    '90071992547409930001',
    '90071992547409930005',
    '90071992547409930003',
    '90071992547409930007',
  ]), '90071992547409930004');
});

test('formats speedup as a finite canonical decimal for zero and enormous ratios', async () => {
  const { formatSpeedupPercent } = await import('../src/evaluation-analysis.js');
  assert.equal(formatSpeedupPercent('1', '0'), null);
  assert.equal(
    formatSpeedupPercent((10n ** 400n + 1n).toString(), '1'),
    `-1${'0'.repeat(402)}`,
  );
});

test('REQ-003 passes a 30 percent speedup and fails an observed 19 percent speedup', () => {
  const passing = analyzeEvaluation(plan, req003Pairs());
  assert.equal(passing.req003.skill_median_ns, '70');
  assert.equal(passing.req003.baseline_median_ns, '100');
  assert.equal(passing.req003.speedup_percent, '30');
  assert.equal(passing.req003.pass, true);

  const failing = analyzeEvaluation(plan, req003Pairs({
    skill: [80n, 81n, 82n], baseline: [90n, 100n, 110n],
  }));
  assert.equal(failing.req003.speedup_percent, '19');
  assert.equal(failing.req003.speed_pass, false);
  assert.equal(failing.req003.pass, false);
});

test('REQ-002 requires both 115 percent and three-second bounds', () => {
  const relativeOnly = analyzeEvaluation(plan, req002Pairs({
    skill: [114_000_000_000n, 114_000_000_000n, 114_000_000_000n],
    baseline: [100_000_000_000n, 100_000_000_000n, 100_000_000_000n],
  })).req002;
  assert.equal(relativeOnly.relative_pass, true);
  assert.equal(relativeOnly.absolute_pass, false);
  assert.equal(relativeOnly.pass, false);

  const absoluteOnly = analyzeEvaluation(plan, req002Pairs({
    skill: [13_000_000_000n, 13_000_000_000n, 13_000_000_000n],
    baseline: [10_000_000_000n, 10_000_000_000n, 10_000_000_000n],
  })).req002;
  assert.equal(absoluteOnly.relative_pass, false);
  assert.equal(absoluteOnly.absolute_pass, true);
  assert.equal(absoluteOnly.pass, false);

  const both = analyzeEvaluation(plan, req002Pairs()).req002;
  assert.equal(both.relative_pass, true);
  assert.equal(both.absolute_pass, true);
  assert.equal(both.pass, true);
});

test('REQ-002 explicit-load runs must use the zero-probe path', () => {
  const traces = req002Pairs();
  const withSkill = traces.find(({ variant }) => variant === 'with_skill');
  withSkill.events.splice(1, 0, event('wait', 1n));
  const result = analyzeEvaluation(plan, traces).req002;
  assert.equal(result.zero_probe_pass, false);
  assert.equal(result.pass, false);
});

test('REQ-003 worker proof requires overlapping intervals in different domains', () => {
  const positive = analyzeEvaluation(plan, req003Pairs()).req003;
  assert.equal(positive.worker_parallelism_pass, true);

  const sameDomain = req003Pairs();
  for (const item of sameDomain.filter(({ variant }) => variant === 'with_skill')) {
    for (const workerEvent of item.events.filter(({ type, actor }) => type?.startsWith('worker.') && actor === 'billing')) {
      workerEvent.conflict_domain = 'src/catalog';
    }
  }
  assert.equal(analyzeEvaluation(plan, sameDomain).req003.worker_parallelism_pass, false);

  const touching = req003Pairs();
  for (const item of touching.filter(({ variant }) => variant === 'with_skill')) {
    const start = BigInt(item.events[0].monotonic_ns);
    item.events.find(({ type, actor }) => type === 'worker.end' && actor === 'catalog').monotonic_ns = (start + 4n).toString();
    item.events.find(({ type, actor }) => type === 'worker.start' && actor === 'billing').monotonic_ns = (start + 4n).toString();
    sortMiddleEvents(item);
  }
  assert.equal(analyzeEvaluation(plan, touching).req003.worker_parallelism_pass, false);

  const concurrentSameDomain = req003Pairs();
  for (const item of concurrentSameDomain.filter(({ variant }) => variant === 'with_skill')) {
    const start = BigInt(item.events[0].monotonic_ns);
    item.events.splice(-1, 0,
      event('worker.start', start + 5n, { actor: 'catalog-2', conflict_domain: 'src/catalog' }),
      event('worker.end', start + 7n, { actor: 'catalog-2', conflict_domain: 'src/catalog' }));
    sortMiddleEvents(item);
  }
  assert.equal(analyzeEvaluation(plan, concurrentSameDomain).req003.worker_parallelism_pass, false);
});

test('EVAL-008 requires exact traced order, running state, remaining time, and 3 of 3 trials', () => {
  const positive = analyzeEvaluation(plan, eval008Runs()).eval008;
  assert.equal(positive.passed_runs, 3);
  assert.equal(positive.pass, true);

  const agentReturns = eval008Runs();
  for (const item of agentReturns) {
    item.events.find(({ type }) => type === 'session.return').actor = 'agent';
  }
  assert.equal(analyzeEvaluation(hardenedPlan, agentReturns).eval008.pass, true);

  const mutations = [{ running: false }, { commandEnd: 15_999_999_999n }];
  for (const options of mutations) {
    const result = analyzeEvaluation(plan, eval008Runs(options)).eval008;
    assert.equal(result.passed_runs, 0);
    assert.equal(result.pass, false);
  }
  const earlyIndependent = eval008Runs({ independentStart: 500_000_000n });
  for (const item of earlyIndependent) {
    sortMiddleEvents(item);
  }
  assert.equal(analyzeEvaluation(hardenedPlan, earlyIndependent).eval008.pass, false);
  for (const type of ['poll', 'wait', 'evidence']) {
    const result = analyzeEvaluation(hardenedPlan, eval008Runs({
      intervening: [event(type, 1_500_000_000n)],
    })).eval008;
    assert.equal(result.passed_runs, 0);
    assert.equal(result.pass, false);
  }
  const incomplete = eval008Runs();
  for (const item of incomplete) {
    item.events.splice(item.events.findIndex(({ type }) => type === 'independent.end'), 1);
  }
  assert.throws(() => analyzeEvaluation(hardenedPlan, incomplete), /independent|interval/iu);
  assert.equal(analyzeEvaluation(plan, eval008Runs().slice(0, 2)).eval008.pass, false);
});

test('duplicate command/input identities fail command quality', () => {
  const traces = req003Pairs();
  const withSkill = traces.find(({ variant }) => variant === 'with_skill');
  const commandStart = withSkill.events.find(({ type }) => type === 'command.start');
  const commandEnd = withSkill.events.find(({ type, command }) => (
    type === 'command.end' && command === commandStart.command
  ));
  const finish = BigInt(withSkill.events.at(-1).monotonic_ns);
  withSkill.events.splice(-1, 0,
    { ...commandStart, monotonic_ns: (finish - 2n).toString() },
    { ...commandEnd, monotonic_ns: (finish - 1n).toString() });
  assert.throws(() => analyzeEvaluation(plan, traces), /command|duplicate|ambiguous/iu);
});

test('Agent prose without controller events cannot satisfy worker or overlap evidence', () => {
  const workerProse = req003Pairs();
  for (const item of workerProse.filter(({ variant }) => variant === 'with_skill')) {
    item.events = [item.events[0], item.events.at(-1)];
    item.outputs = ['I ran two workers concurrently and all commands passed.'];
  }
  assert.throws(() => analyzeEvaluation(plan, workerProse), /command|order/iu);

  const overlapProse = eval008Runs();
  for (const item of overlapProse) {
    item.events = [item.events[0], item.events.at(-1)];
    item.outputs = ['The background command overlapped independent work for 16 seconds.'];
  }
  assert.throws(() => analyzeEvaluation(plan, overlapProse), /command|order/iu);
});

test('sorts issues and reports stably and exposes exact stop flags', () => {
  const traces = [...eval008Runs().reverse(), ...req002Pairs(), ...req003Pairs()];
  const result = analyzeEvaluation(plan, traces);
  assert.deepEqual(result.valid_runs, [...result.valid_runs].sort());
  assert.deepEqual(result.formal_pairs.map(({ id }) => ({ id })), [
    { id: 'REQ-002:1' }, { id: 'REQ-002:2' }, { id: 'REQ-002:3' },
    { id: 'REQ-003:1' }, { id: 'REQ-003:2' }, { id: 'REQ-003:3' },
  ]);
  assert.deepEqual(result.stopped, {
    req002: true,
    req003: true,
    eval008: true,
    all: true,
  });
  assert.equal(result.maturity_pass, true);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('analyze CLI reads nested controller traces and writes JSON and Markdown on maturity failure', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-'));
  const traceRoot = path.join(root, 'traces');
  const nested = path.join(traceRoot, 'run-1');
  const outputRoot = path.join(root, 'analysis');
  await mkdir(nested, { recursive: true });
  await mkdir(outputRoot);
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(nested, 'controller-trace.json'),
    `${JSON.stringify(trace({
      runId: 'pilot-only', scenarioId: 'REQ-003', pairId: 1, phase: 'pilot',
      variant: 'with_skill', durationNs: 100n, events: workerEvents(),
    }))}\n`,
    'utf8',
  );
  const output = path.join(outputRoot, 'benchmark.json');
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH, 'analyze', '--plan', PLAN_PATH, '--traces', traceRoot, '--output', output,
  ], { cwd: PROJECT_ROOT, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const analysis = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(analysis.maturity_pass, false);
  assert.equal(analysis.valid_runs.includes('pilot-only'), true);
  const markdown = await readFile(path.join(outputRoot, 'benchmark.md'), 'utf8');
  assert.match(markdown, /Maturity pass: no/iu);
  assert.match(markdown, /pilot-only/u);
});

test('analyze CLI pair order is invariant to trace directory renaming', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-order-'));
  const traceRoot = path.join(root, 'traces');
  const outputRoot = path.join(root, 'analysis');
  await mkdir(traceRoot);
  await mkdir(outputRoot);
  t.after(() => rm(root, { recursive: true, force: true }));
  const pair = req003Pairs().filter(({ pair_id: pairId }) => pairId === 1);
  for (const [directory, item] of [['z', pair[0]], ['a', pair[1]], ['m', pair[2]]]) {
    const target = path.join(traceRoot, directory);
    await mkdir(target);
    await writeFile(path.join(target, 'controller-trace.json'), `${JSON.stringify(item)}\n`, 'utf8');
  }

  async function analyze(outputName) {
    const output = path.join(outputRoot, outputName);
    const result = spawnSync(process.execPath, [
      SCRIPT_PATH, 'analyze', '--plan', PLAN_PATH, '--traces', traceRoot, '--output', output,
    ], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(await readFile(output, 'utf8')).formal_pairs[0]?.run_ids;
  }

  const before = await analyze('before.json');
  await rename(path.join(traceRoot, 'a'), path.join(traceRoot, 'x'));
  await rename(path.join(traceRoot, 'm'), path.join(traceRoot, 'a'));
  await rename(path.join(traceRoot, 'z'), path.join(traceRoot, 'm'));
  const after = await analyze('after.json');
  assert.deepEqual(before, [
    'req003-1-with_skill',
    'req003-1-without_skill',
    'req003-1-draft_a34625a',
  ]);
  assert.deepEqual(after, before);
});

test('analyze CLI rejects structurally invalid trace documents', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'accelerator-analysis-invalid-'));
  const traceRoot = path.join(root, 'traces');
  const outputRoot = path.join(root, 'analysis');
  await mkdir(traceRoot);
  await mkdir(outputRoot);
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(traceRoot, 'controller-trace.json'), '{"run_id":', 'utf8');
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    'analyze',
    '--plan', PLAN_PATH,
    '--traces', traceRoot,
    '--output', path.join(outputRoot, 'benchmark.json'),
  ], { cwd: PROJECT_ROOT, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /analysis failed/iu);
});
