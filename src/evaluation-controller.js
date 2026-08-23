import { types } from 'node:util';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const PHASES = new Set(['pilot', 'formal']);
const START_KEYS = new Set([
  'action',
  'run_id',
  'scenario_id',
  'pair_id',
  'phase',
  'variant',
  'fixture_sha256',
  'skill_sha256',
]);
const FINISH_KEYS = new Set(['action', 'quality_pass', 'invalid_reason', 'outputs']);
const EVENT_SCHEMAS = new Map([
  ['agent.accepted', ['action', 'type', 'actor']],
  ['worker.start', ['action', 'type', 'actor', 'conflict_domain']],
  ['worker.end', ['action', 'type', 'actor', 'conflict_domain']],
  ['command.start', ['action', 'type', 'actor', 'command', 'input_identity']],
  ['session.return', ['action', 'type', 'actor', 'command', 'input_identity', 'running']],
  ['independent.start', ['action', 'type', 'actor', 'conflict_domain']],
  ['independent.end', ['action', 'type', 'actor', 'conflict_domain']],
  ['poll', ['action', 'type', 'actor']],
  ['wait', ['action', 'type', 'actor']],
  ['evidence', ['action', 'type', 'actor']],
  ['command.end', ['action', 'type', 'actor', 'command', 'input_identity']],
  ['agent.completed', ['action', 'type', 'actor']],
].map(([type, keys]) => [type, new Set(keys)]));

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertDataDescriptor(descriptor, field) {
  if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
    throw new TypeError(`${field} contains an accessor or non-JSON property.`);
  }
}

function normalizeInert(value, field, ancestors = new Set()) {
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (/\r|\n/u.test(value)) {
      throw new TypeError(`${field} cannot contain a newline.`);
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${field} must contain finite JSON numbers.`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${field} must contain JSON-like data.`);
  }
  // Proxy 会把枚举、描述符和属性读取变成调用方代码；在任何反射前直接拒绝。
  if (types.isProxy(value)) {
    throw new TypeError(`${field} cannot contain a proxy.`);
  }
  const array = Array.isArray(value);
  if (!array && !isPlainObject(value)) {
    throw new TypeError(`${field} must contain plain JSON-like data.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${field} cannot contain cycles.`);
  }

  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new TypeError(`${field} must contain string keys.`);
  }
  if (!array) {
    for (const key of ownKeys) {
      assertOneLine(key, `${field} key`);
    }
  }

  let normalized;
  if (array) {
    const elementKeys = ownKeys.filter((key) => key !== 'length');
    if (elementKeys.length !== value.length
      || elementKeys.some((key, index) => key !== String(index))) {
      throw new TypeError(`${field} arrays must be dense and contain no extra properties.`);
    }
    normalized = elementKeys.map((key) => {
      assertDataDescriptor(descriptors[key], field);
      return normalizeInert(descriptors[key].value, `${field}[${key}]`, ancestors);
    });
  } else {
    normalized = {};
    for (const key of ownKeys) {
      const descriptor = descriptors[key];
      assertDataDescriptor(descriptor, `${field}.${key}`);
      Object.defineProperty(normalized, key, {
        value: normalizeInert(descriptor.value, `${field}.${key}`, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  ancestors.delete(value);
  return normalized;
}

function assertExactKeys(value, required) {
  if (!isPlainObject(value)) {
    throw new TypeError('Command must be a plain object.');
  }
  const keys = Object.keys(value);
  if (keys.some((key) => !required.has(key))) {
    throw new TypeError('Command contains unknown keys.');
  }
  if ([...required].some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError('Command is missing required keys.');
  }
}

function assertOneLine(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Invalid ${field}.`);
  }
  if (/\r|\n/u.test(value)) {
    throw new TypeError(`${field} cannot contain a newline.`);
  }
}

function assertDigest(value, field) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`Invalid ${field}.`);
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

function collectPlanLimits(sourcePlan) {
  const plan = normalizeInert(sourcePlan, 'plan');
  if (!isPlainObject(plan) || !isPlainObject(plan.scenarios)) {
    throw new TypeError('Plan must contain scenarios.');
  }
  if (!Array.isArray(plan.invalid_reasons) || plan.invalid_reasons.length === 0) {
    throw new TypeError('Plan must contain invalid reasons.');
  }
  for (const reason of plan.invalid_reasons) {
    assertOneLine(reason, 'plan invalid reason');
  }

  const scenarios = new Map();
  for (const [scenarioId, scenario] of Object.entries(plan.scenarios)) {
    assertOneLine(scenarioId, 'scenario_id');
    if (!isPlainObject(scenario)) {
      throw new TypeError('Plan scenarios must be objects.');
    }
    if (Array.isArray(scenario.orders) && scenario.orders.length > 0) {
      const pairs = scenario.orders.map((order) => {
        if (!Array.isArray(order) || order.length === 0) {
          throw new TypeError('Plan orders must be non-empty arrays.');
        }
        for (const variant of order) {
          assertOneLine(variant, 'plan variant');
        }
        return new Set(order);
      });
      scenarios.set(scenarioId, Object.freeze({ kind: 'orders', pairs }));
      continue;
    }
    if (Array.isArray(scenario.variants)
      && scenario.variants.length > 0
      && Number.isInteger(scenario.required_valid_runs)
      && scenario.required_valid_runs > 0) {
      for (const variant of scenario.variants) {
        assertOneLine(variant, 'plan variant');
      }
      scenarios.set(scenarioId, Object.freeze({
        kind: 'runs',
        maximumPairId: scenario.required_valid_runs,
        variants: new Set(scenario.variants),
      }));
      continue;
    }
    throw new TypeError(`Scenario ${scenarioId} has no supported pair contract.`);
  }
  if (scenarios.size === 0) {
    throw new TypeError('Plan must define scenarios.');
  }
  return Object.freeze({
    scenarios,
    invalidReasons: new Set(plan.invalid_reasons),
  });
}

function validateStart(command, limits) {
  assertExactKeys(command, START_KEYS);
  assertOneLine(command.run_id, 'run_id');
  assertOneLine(command.scenario_id, 'scenario_id');
  const scenario = limits.scenarios.get(command.scenario_id);
  if (scenario === undefined) {
    throw new TypeError('Invalid scenario_id.');
  }
  if (!Number.isInteger(command.pair_id) || command.pair_id < 1) {
    throw new TypeError('Invalid pair_id.');
  }
  const variants = scenario.kind === 'orders'
    ? scenario.pairs[command.pair_id - 1]
    : command.pair_id <= scenario.maximumPairId
      ? scenario.variants
      : undefined;
  if (variants === undefined) {
    throw new TypeError('Invalid pair_id for scenario.');
  }
  if (!variants.has(command.variant)) {
    throw new TypeError('Invalid variant for scenario pair.');
  }
  if (!PHASES.has(command.phase)) {
    throw new TypeError('Invalid phase.');
  }
  assertDigest(command.fixture_sha256, 'fixture_sha256');
  assertDigest(command.skill_sha256, 'skill_sha256');
}

function validateEvent(command) {
  if (typeof command.type !== 'string' || !EVENT_SCHEMAS.has(command.type)) {
    throw new TypeError('Unknown event type.');
  }
  assertExactKeys(command, EVENT_SCHEMAS.get(command.type));
  assertOneLine(command.actor, 'actor');
  for (const field of ['conflict_domain', 'command', 'input_identity']) {
    if (Object.hasOwn(command, field)) {
      assertOneLine(command[field], field);
    }
  }
  if (Object.hasOwn(command, 'running') && typeof command.running !== 'boolean') {
    throw new TypeError('Invalid running value.');
  }
}

function validateFinish(command, limits) {
  assertExactKeys(command, FINISH_KEYS);
  if (typeof command.quality_pass !== 'boolean') {
    throw new TypeError('Invalid quality_pass value.');
  }
  if (command.invalid_reason !== null && !limits.invalidReasons.has(command.invalid_reason)) {
    throw new TypeError('Invalid reason is not registered by the plan.');
  }
  if (!Array.isArray(command.outputs)) {
    throw new TypeError('Invalid outputs value.');
  }
  for (const output of command.outputs) {
    if (typeof output === 'string') {
      assertOneLine(output, 'outputs');
    }
  }
}

function makeSnapshot(state) {
  return deepFreeze({
    schema_version: 1,
    run_id: state.run.run_id,
    scenario_id: state.run.scenario_id,
    pair_id: state.run.pair_id,
    phase: state.run.phase,
    variant: state.run.variant,
    fixture_sha256: state.run.fixture_sha256,
    skill_sha256: state.run.skill_sha256,
    started_at_utc: state.startedAtUtc,
    finished_at_utc: state.finishedAtUtc,
    duration_ns: state.durationNs,
    quality_pass: state.qualityPass,
    invalid_reason: state.invalidReason,
    outputs: state.outputs,
    events: state.events,
  });
}

/**
 * 创建由控制器独占时钟的评测记录器；调用方命令不能注入或改写计时证据。
 */
export function createEvaluationRecorder({ plan, clock, utcNow }) {
  if (typeof clock !== 'function' || typeof utcNow !== 'function') {
    throw new TypeError('clock and utcNow must be functions.');
  }
  const limits = collectPlanLimits(plan);
  let state = Object.freeze({
    phase: 'idle',
    run: null,
    startedAtUtc: null,
    startedAtNs: null,
    finishedAtUtc: null,
    durationNs: null,
    qualityPass: null,
    invalidReason: null,
    outputs: deepFreeze([]),
    events: deepFreeze([]),
    lastTick: null,
  });

  function readStamp() {
    const tick = clock();
    if (typeof tick !== 'bigint' || tick < 0n) {
      throw new TypeError('Clock must return a non-negative bigint.');
    }
    // 只拒绝倒退；同一纳秒内的相邻事件仍是合法的单调时钟观测。
    if (state.lastTick !== null && tick < state.lastTick) {
      throw new RangeError('Controller clock decreased.');
    }
    const utc = utcNow();
    assertOneLine(utc, 'UTC label');
    return { tick, monotonic_ns: tick.toString(), utc };
  }

  function commit(candidate, action, stamp) {
    const snapshot = makeSnapshot(candidate);
    const acknowledgement = deepFreeze({
      accepted: true,
      action,
      monotonic_ns: stamp.monotonic_ns,
    });
    const result = deepFreeze({
      acknowledgement,
      snapshot,
      closed: candidate.phase === 'finished',
    });
    // 候选结果完全构造并冻结后再一次替换状态，任何前置异常都保持上一快照可重试。
    state = Object.freeze(candidate);
    return result;
  }

  return Object.freeze({
    handle(sourceCommand) {
      // 先复制成无 getter/Proxy 的普通数据，再校验生命周期和读取控制器时钟。
      const command = normalizeInert(sourceCommand, 'command');
      if (!isPlainObject(command) || typeof command.action !== 'string') {
        throw new TypeError('Unknown action.');
      }
      if (!['start', 'event', 'finish'].includes(command.action)) {
        throw new TypeError('Unknown action.');
      }
      if (state.phase === 'finished') {
        throw new Error('Command is not allowed after finish.');
      }

      if (command.action === 'start') {
        if (state.phase !== 'idle') {
          throw new Error('Duplicate start is not allowed.');
        }
        validateStart(command, limits);
        const stamp = readStamp();
        const event = deepFreeze({
          action: 'start',
          utc: stamp.utc,
          monotonic_ns: stamp.monotonic_ns,
        });
        return commit({
          phase: 'started',
          run: deepFreeze({
            run_id: command.run_id,
            scenario_id: command.scenario_id,
            pair_id: command.pair_id,
            phase: command.phase,
            variant: command.variant,
            fixture_sha256: command.fixture_sha256,
            skill_sha256: command.skill_sha256,
          }),
          startedAtUtc: stamp.utc,
          startedAtNs: stamp.tick,
          finishedAtUtc: null,
          durationNs: null,
          qualityPass: null,
          invalidReason: null,
          outputs: deepFreeze([]),
          events: deepFreeze([event]),
          lastTick: stamp.tick,
        }, command.action, stamp);
      }

      if (state.phase === 'idle') {
        throw new Error(`${command.action} is not allowed before start.`);
      }
      if (command.action === 'event') {
        validateEvent(command);
        const stamp = readStamp();
        const event = deepFreeze({
          ...command,
          utc: stamp.utc,
          monotonic_ns: stamp.monotonic_ns,
        });
        return commit({
          ...state,
          events: deepFreeze([...state.events, event]),
          lastTick: stamp.tick,
        }, command.action, stamp);
      }

      validateFinish(command, limits);
      const stamp = readStamp();
      const event = deepFreeze({
        action: 'finish',
        utc: stamp.utc,
        monotonic_ns: stamp.monotonic_ns,
      });
      return commit({
        ...state,
        phase: 'finished',
        finishedAtUtc: stamp.utc,
        // UTC 只作为审计标签，所有耗时都由单调纳秒差计算。
        durationNs: (stamp.tick - state.startedAtNs).toString(),
        qualityPass: command.quality_pass,
        invalidReason: command.invalid_reason,
        outputs: deepFreeze(command.outputs),
        events: deepFreeze([...state.events, event]),
        lastTick: stamp.tick,
      }, command.action, stamp);
    },
  });
}
