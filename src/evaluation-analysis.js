import { types } from 'node:util';

const DECIMAL_NANOSECONDS = /^(0|[1-9][0-9]*)$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const TRACE_KEYS = new Set([
  'schema_version',
  'run_id',
  'scenario_id',
  'pair_id',
  'phase',
  'variant',
  'fixture_sha256',
  'skill_sha256',
  'started_at_utc',
  'finished_at_utc',
  'duration_ns',
  'quality_pass',
  'invalid_reason',
  'outputs',
  'events',
]);
const EVENT_FIELDS = new Map([
  ['agent.accepted', ['action', 'type', 'actor', 'utc', 'monotonic_ns']],
  ['agent.completed', ['action', 'type', 'actor', 'utc', 'monotonic_ns']],
  ['worker.start', ['action', 'type', 'actor', 'conflict_domain', 'utc', 'monotonic_ns']],
  ['worker.end', ['action', 'type', 'actor', 'conflict_domain', 'utc', 'monotonic_ns']],
  ['command.start', ['action', 'type', 'actor', 'command', 'input_identity', 'utc', 'monotonic_ns']],
  ['command.end', ['action', 'type', 'actor', 'command', 'input_identity', 'utc', 'monotonic_ns']],
  ['session.return', ['action', 'type', 'actor', 'command', 'input_identity', 'running', 'utc', 'monotonic_ns']],
  ['independent.start', ['action', 'type', 'actor', 'conflict_domain', 'utc', 'monotonic_ns']],
  ['independent.end', ['action', 'type', 'actor', 'conflict_domain', 'utc', 'monotonic_ns']],
  ['poll', ['action', 'type', 'actor', 'utc', 'monotonic_ns']],
  ['wait', ['action', 'type', 'actor', 'utc', 'monotonic_ns']],
  ['evidence', ['action', 'type', 'actor', 'utc', 'monotonic_ns']],
].map(([type, fields]) => [type, new Set(fields)]));
const START_EVENT_KEYS = new Set(['action', 'utc', 'monotonic_ns']);
const FINISH_EVENT_KEYS = new Set(['action', 'utc', 'monotonic_ns']);
const BLOCKING_EVENT_TYPES = new Set(['poll', 'wait', 'evidence']);
const ZERO_PROBE_EVENT_TYPES = new Set([
  'worker.start',
  'worker.end',
  'session.return',
  'poll',
  'wait',
  'evidence',
]);
const ISSUE_PRIORITY = new Map([
  ['FORMAL_SAMPLE_LIMIT_EXCEEDED', 0],
  ['INVALID_REASON_UNREGISTERED', 1],
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPlan(plan) {
  if (!isObject(plan) || !isObject(plan.scenarios) || !Array.isArray(plan.invalid_reasons)) {
    throw new TypeError('Evaluation plan is structurally invalid.');
  }
  if (!isObject(plan.thresholds)) {
    throw new TypeError('Evaluation plan thresholds are missing.');
  }
  const workerDomains = plan.scenarios['REQ-003']?.required_worker_domains;
  if (!Array.isArray(workerDomains)
    || workerDomains.length !== 2
    || new Set(workerDomains).size !== 2
    || workerDomains.some((domain) => typeof domain !== 'string' || domain.length === 0)) {
    throw new TypeError('REQ-003 must declare two distinct required_worker_domains.');
  }
  return plan;
}

function assertExactKeys(value, expected, label) {
  if (!isObject(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const keys = Object.keys(value);
  if (keys.length !== expected.size
    || keys.some((key) => !expected.has(key))
    || [...expected].some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} has an invalid closed schema.`);
  }
}

function assertOneLine(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /\r|\n/u.test(value)) {
    throw new TypeError(`${label} must be a non-empty one-line string.`);
  }
}

function cloneJson(value, label = 'trace', ancestors = new Set()) {
  // Proxy 判定必须先于 Array.isArray、原型或描述符读取，避免顶层容器也能触发调用方陷阱。
  if (types.isProxy(value)) {
    throw new TypeError(`${label} cannot contain a proxy.`);
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError(`${label} contains a non-finite number.`);
    }
    return value;
  }
  if (typeof value === 'string') {
    if (/\r|\n/u.test(value)) {
      throw new TypeError(`${label} contains a newline.`);
    }
    return value;
  }
  const array = Array.isArray(value);
  if (!isObject(value) && !array) {
    throw new TypeError(`${label} must contain plain JSON data.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if ((!array && prototype !== Object.prototype && prototype !== null)
    || (array && prototype !== Array.prototype)) {
    throw new TypeError(`${label} must contain plain JSON data.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${label} cannot contain cycles.`);
  }
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new TypeError(`${label} must contain string keys.`);
  }
  const dataKeys = array ? ownKeys.filter((key) => key !== 'length') : ownKeys;
  const arrayLength = array ? descriptors.length?.value : undefined;
  if (array && (dataKeys.length !== arrayLength
    || dataKeys.some((key, index) => key !== String(index)))) {
    throw new TypeError(`${label} arrays must be dense and contain no extra properties.`);
  }
  const clone = array ? [] : {};
  for (const key of dataKeys) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new TypeError(`${label}.${key} contains an accessor or non-JSON property.`);
    }
    if (!array) {
      assertOneLine(key, `${label} key`);
    }
    Object.defineProperty(clone, key, {
      value: cloneJson(descriptor.value, `${label}.${key}`, ancestors),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  ancestors.delete(value);
  return clone;
}

function assertTrace(sourceTrace) {
  const trace = cloneJson(sourceTrace);
  assertExactKeys(trace, TRACE_KEYS, 'Trace');
  if (trace.schema_version !== 1) {
    throw new TypeError('Trace schema_version must be 1.');
  }
  if (!isObject(trace)) {
    throw new TypeError('Each trace must be an object.');
  }
  for (const field of [
    'run_id',
    'scenario_id',
    'phase',
    'variant',
    'fixture_sha256',
    'skill_sha256',
    'duration_ns',
  ]) {
    if (typeof trace[field] !== 'string' || trace[field].length === 0) {
      throw new TypeError(`Trace ${field} is structurally invalid.`);
    }
  }
  if (!Number.isInteger(trace.pair_id) || trace.pair_id < 1) {
    throw new TypeError('Trace pair_id is structurally invalid.');
  }
  if (!DECIMAL_NANOSECONDS.test(trace.duration_ns)) {
    throw new TypeError('Trace duration_ns is structurally invalid.');
  }
  if (typeof trace.quality_pass !== 'boolean') {
    throw new TypeError('Trace quality_pass is structurally invalid.');
  }
  if (trace.invalid_reason !== null && typeof trace.invalid_reason !== 'string') {
    throw new TypeError('Trace invalid_reason is structurally invalid.');
  }
  if (!Array.isArray(trace.outputs) || !Array.isArray(trace.events)) {
    throw new TypeError('Trace outputs and events must be arrays.');
  }
  if (!['pilot', 'formal'].includes(trace.phase)
    || !DIGEST.test(trace.fixture_sha256)
    || !DIGEST.test(trace.skill_sha256)) {
    throw new TypeError('Trace phase or digest is structurally invalid.');
  }
  assertOneLine(trace.started_at_utc, 'Trace started_at_utc');
  assertOneLine(trace.finished_at_utc, 'Trace finished_at_utc');
  if (trace.events.length < 2) {
    throw new TypeError('Trace lifecycle must contain start and finish.');
  }
  let previous = null;
  for (let index = 0; index < trace.events.length; index += 1) {
    const item = trace.events[index];
    if (!isObject(item) || !DECIMAL_NANOSECONDS.test(item.monotonic_ns)) {
      throw new TypeError('Trace event is structurally invalid.');
    }
    assertOneLine(item.utc, 'Trace event UTC');
    if (index === 0) {
      assertExactKeys(item, START_EVENT_KEYS, 'Trace start event');
      if (item.action !== 'start') {
        throw new TypeError('Trace lifecycle must begin with start.');
      }
    } else if (index === trace.events.length - 1) {
      assertExactKeys(item, FINISH_EVENT_KEYS, 'Trace finish event');
      if (item.action !== 'finish') {
        throw new TypeError('Trace lifecycle must end with finish.');
      }
    } else {
      const fields = EVENT_FIELDS.get(item.type);
      if (fields === undefined) {
        throw new TypeError('Trace contains an unknown event type.');
      }
      assertExactKeys(item, fields, `Trace ${item.type} event`);
      if (item.action !== 'event') {
        throw new TypeError('Trace middle lifecycle entries must be events.');
      }
      assertOneLine(item.actor, 'Trace event actor');
      for (const field of ['conflict_domain', 'command', 'input_identity']) {
        if (Object.hasOwn(item, field)) {
          assertOneLine(item[field], `Trace event ${field}`);
        }
      }
      if (Object.hasOwn(item, 'running') && typeof item.running !== 'boolean') {
        throw new TypeError('Trace session running flag must be boolean.');
      }
    }
    const tick = BigInt(item.monotonic_ns);
    if (previous !== null && tick < previous) {
      throw new TypeError('Trace event monotonic order is invalid.');
    }
    previous = tick;
  }
  const start = trace.events[0];
  const finish = trace.events.at(-1);
  if (trace.started_at_utc !== start.utc || trace.finished_at_utc !== finish.utc) {
    throw new TypeError('Trace UTC lifecycle labels do not match.');
  }
  if (BigInt(trace.duration_ns) !== BigInt(finish.monotonic_ns) - BigInt(start.monotonic_ns)) {
    throw new TypeError('Trace duration does not match its monotonic lifecycle.');
  }
  return trace;
}

function parseNanoseconds(value) {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new TypeError('Nanoseconds must be non-negative.');
    }
    return value;
  }
  if (typeof value !== 'string' || !DECIMAL_NANOSECONDS.test(value)) {
    throw new TypeError('Nanoseconds must be a non-negative decimal string.');
  }
  return BigInt(value);
}

function medianBigInt(values) {
  if (values.length === 0) {
    return null;
  }
  // 纳秒先按 BigInt 排序；偶数样本的整数中点避免 Number 精度和 JSON 序列化问题。
  const ordered = values.map(parseNanoseconds).sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2n;
}

export function medianNanoseconds(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('Median input must be an array.');
  }
  return medianBigInt(values)?.toString() ?? null;
}

function issue(code, fields = {}) {
  return { code, ...fields };
}

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'en');
}

function sortIssues(issues) {
  return issues.sort((left, right) => {
    const priority = (ISSUE_PRIORITY.get(left.code) ?? 10) - (ISSUE_PRIORITY.get(right.code) ?? 10);
    return priority
      || compareText(left.code, right.code)
      || compareText(left.scenario_id, right.scenario_id)
      || Number(left.pair_id ?? 0) - Number(right.pair_id ?? 0)
      || compareText(left.run_id, right.run_id);
  });
}

function resourceIdentity(trace, requiredCommands) {
  const identities = [];
  for (const command of requiredCommands) {
    const matches = trace.events.filter((event) => (
      event.type === 'command.start'
      && event.command === command
      && typeof event.input_identity === 'string'
      && event.input_identity.length > 0
    ));
    if (matches.length !== 1) {
      return null;
    }
    identities.push({ command, input_identity: matches[0].input_identity });
  }
  return identities;
}

function strictIntervals(trace, startType, endType, label, keyFor) {
  const starts = new Map();
  const ends = new Map();
  for (let index = 0; index < trace.events.length; index += 1) {
    const event = trace.events[index];
    if (event.type !== startType && event.type !== endType) {
      continue;
    }
    const target = event.type === startType ? starts : ends;
    const key = keyFor(event);
    if (target.has(key)) {
      throw new TypeError(`${label} interval is duplicate or ambiguous.`);
    }
    target.set(key, { event, index, tick: BigInt(event.monotonic_ns) });
  }
  if (starts.size !== ends.size
    || [...starts.keys()].some((key) => !ends.has(key))) {
    throw new TypeError(`${label} interval has an orphan boundary.`);
  }
  return [...starts.entries()].map(([key, start]) => {
    const end = ends.get(key);
    if (start.index >= end.index || start.tick >= end.tick) {
      throw new TypeError(`${label} interval is reversed or has no positive duration.`);
    }
    return {
      key,
      actor: start.event.actor,
      conflict_domain: start.event.conflict_domain,
      command: start.event.command,
      input_identity: start.event.input_identity,
      start_index: start.index,
      end_index: end.index,
      start_ns: start.tick,
      end_ns: end.tick,
    };
  });
}

function workerIntervals(trace) {
  return strictIntervals(
    trace,
    'worker.start',
    'worker.end',
    'Worker',
    (event) => `${event.actor}\u0000${event.conflict_domain}`,
  );
}

function independentIntervals(trace) {
  return strictIntervals(
    trace,
    'independent.start',
    'independent.end',
    'Independent',
    (event) => `${event.actor}\u0000${event.conflict_domain}`,
  );
}

function validateCommandLifecycle(trace) {
  const intervals = strictIntervals(
    trace,
    'command.start',
    'command.end',
    'Command',
    (event) => `${event.actor}\u0000${event.command}\u0000${event.input_identity}`,
  ).sort((left, right) => left.start_index - right.start_index);
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index - 1].end_index >= intervals[index].start_index
      || intervals[index - 1].end_ns >= intervals[index].start_ns) {
      throw new TypeError('Required command intervals overlap or are out of order.');
    }
  }
  const returns = trace.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === 'session.return');
  const usedIntervals = new Set();
  for (const returned of returns) {
    const intervalIndex = intervals.findIndex((interval) => (
      interval.command === returned.event.command
      && interval.input_identity === returned.event.input_identity
      && interval.start_index < returned.index
      && returned.index < interval.end_index
      && interval.start_ns < BigInt(returned.event.monotonic_ns)
      && BigInt(returned.event.monotonic_ns) < interval.end_ns
    ));
    if (intervalIndex === -1 || usedIntervals.has(intervalIndex)) {
      throw new TypeError('Session return does not identify one open command interval.');
    }
    usedIntervals.add(intervalIndex);
  }
  return intervals;
}

function validateCommandEvidence(intervals, requiredCommands, requireComplete) {
  const actualCommands = intervals.map(({ command }) => command);
  if (actualCommands.some((command) => !requiredCommands.includes(command))
    || actualCommands.some((command, index) => command !== requiredCommands[index])
    || (requireComplete && actualCommands.length !== requiredCommands.length)) {
    throw new TypeError('Command evidence does not match the required command order.');
  }
}

function intersects(left, right) {
  const latestStart = left.start_ns > right.start_ns ? left.start_ns : right.start_ns;
  const earliestEnd = left.end_ns < right.end_ns ? left.end_ns : right.end_ns;
  return earliestEnd > latestStart;
}

function hasWorkerParallelism(trace, requiredDomains) {
  const intervals = workerIntervals(trace);
  // 精确两个计划域、每域一个区间且 actor 各异，共同固定一域一 writer。
  if (intervals.length !== requiredDomains.length
    || new Set(intervals.map(({ conflict_domain: domain }) => domain)).size !== requiredDomains.length
    || requiredDomains.some((domain) => !intervals.some((interval) => interval.conflict_domain === domain))
    || new Set(intervals.map(({ actor }) => actor)).size !== intervals.length) {
    return false;
  }
  const accepted = trace.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === 'agent.accepted');
  const completed = trace.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === 'agent.completed');
  if (accepted.length !== intervals.length || completed.length !== intervals.length) {
    return false;
  }
  for (const interval of intervals) {
    const matchingAccepted = accepted.filter(({ event }) => event.actor === interval.actor);
    const matchingCompleted = completed.filter(({ event }) => event.actor === interval.actor);
    if (matchingAccepted.length !== 1
      || matchingCompleted.length !== 1
      || matchingAccepted[0].index >= interval.start_index
      || matchingCompleted[0].index <= interval.end_index
      || BigInt(matchingAccepted[0].event.monotonic_ns) >= interval.start_ns
      || BigInt(matchingCompleted[0].event.monotonic_ns) <= interval.end_ns) {
      return false;
    }
  }
  if (accepted.some(({ event }) => !intervals.some(({ actor }) => actor === event.actor))
    || completed.some(({ event }) => !intervals.some(({ actor }) => actor === event.actor))) {
    return false;
  }
  for (let leftIndex = 0; leftIndex < intervals.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < intervals.length; rightIndex += 1) {
      const left = intervals[leftIndex];
      const right = intervals[rightIndex];
      if (left.actor !== right.actor
        && left.conflict_domain !== right.conflict_domain
        && intersects(left, right)) {
        return true;
      }
    }
  }
  return false;
}

function hasWaitOverlap(trace, requiredCommand, minimumRemainingNs) {
  const events = trace.events;
  for (let startIndex = 0; startIndex < events.length; startIndex += 1) {
    const start = events[startIndex];
    if (start.type !== 'command.start' || start.command !== requiredCommand) {
      continue;
    }
    const returnIndex = events.findIndex((item, index) => (
      index > startIndex
      && item.type === 'session.return'
      && item.command === start.command
      && item.input_identity === start.input_identity
      && item.running === true
    ));
    const endIndex = events.findIndex((item, index) => (
      index > returnIndex
      && item.type === 'command.end'
      && item.command === start.command
      && item.input_identity === start.input_identity
    ));
    if (returnIndex === -1 || endIndex === -1) {
      continue;
    }
    const sessionReturn = events[returnIndex];
    const commandEnd = events[endIndex];
    const returnNs = parseNanoseconds(sessionReturn.monotonic_ns);
    const commandEndNs = parseNanoseconds(commandEnd.monotonic_ns);
    const intervals = independentIntervals(trace);
    for (const independent of intervals) {
      const independentStartIndex = independent.start_index;
      const independentEndIndex = independent.end_index;
      const exactOrder = startIndex < returnIndex
        && returnIndex < independentStartIndex
        && independentStartIndex < independentEndIndex
        && independentEndIndex < endIndex;
      const strictTime = parseNanoseconds(start.monotonic_ns) < returnNs
        && returnNs < independent.start_ns
        && independent.start_ns < independent.end_ns
        && independent.end_ns < commandEndNs;
      // 独立动作结束前出现轮询、等待或证据整理，不能证明“先做有用工作再等待”。
      const blocked = events.slice(returnIndex + 1, independentEndIndex + 1)
        .some(({ type }) => BLOCKING_EVENT_TYPES.has(type));
      if (exactOrder
        && strictTime
        && commandEndNs - returnNs >= minimumRemainingNs
        && !blocked) {
        return true;
      }
    }
  }
  return false;
}

export function formatSpeedupPercent(skillNanoseconds, baselineNanoseconds) {
  const skill = parseNanoseconds(skillNanoseconds);
  const baseline = parseNanoseconds(baselineNanoseconds);
  if (baseline === 0n) {
    return null;
  }
  const numerator = (baseline - skill) * 100n;
  const denominator = baseline;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const scale = 1_000_000n;
  const scaled = absolute * scale / denominator;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(6, '0').replace(/0+$/u, '');
  const magnitude = fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
  return negative && scaled !== 0n ? `-${magnitude}` : magnitude;
}

function pairIdentityMatches(traces, requiredCommands) {
  const fixture = traces[0]?.fixture_sha256;
  const skill = traces[0]?.skill_sha256;
  const resource = resourceIdentity(traces[0], requiredCommands);
  if (resource === null) {
    return false;
  }
  return traces.every((trace) => (
    trace.fixture_sha256 === fixture
    && trace.skill_sha256 === skill
    && JSON.stringify(resourceIdentity(trace, requiredCommands)) === JSON.stringify(resource)
  ));
}

function formalIdentityMatches(traces, requiredCommands) {
  if (traces.length === 0) {
    return false;
  }
  const fingerprints = new Set(traces.map((trace) => JSON.stringify({
    fixture_sha256: trace.fixture_sha256,
    skill_sha256: trace.skill_sha256,
    resources: resourceIdentity(trace, requiredCommands),
  })));
  return fingerprints.size === 1
    && traces.every((trace) => resourceIdentity(trace, requiredCommands) !== null);
}

function analyzeOrderedScenario(scenarioId, scenario, formalTraces, issues) {
  const reports = [];
  const tracesByPair = new Map();
  for (const trace of formalTraces) {
    const existing = tracesByPair.get(trace.pair_id) ?? [];
    existing.push(trace);
    tracesByPair.set(trace.pair_id, existing);
  }
  for (let index = 0; index < scenario.orders.length; index += 1) {
    const pairId = index + 1;
    const traces = [...(tracesByPair.get(pairId) ?? [])];
    const expectedOrder = scenario.orders[index];
    const startStamps = traces.map((trace) => BigInt(trace.events[0].monotonic_ns));
    if (new Set(startStamps.map(String)).size !== startStamps.length) {
      issues.push(issue('PAIR_START_ORDER_AMBIGUOUS', { scenario_id: scenarioId, pair_id: pairId }));
      continue;
    }
    // 跨进程执行顺序只认控制器单调 start stamp，数组、路径、run_id 和 UTC 都不是证据。
    traces.sort((left, right) => {
      const leftStart = BigInt(left.events[0].monotonic_ns);
      const rightStart = BigInt(right.events[0].monotonic_ns);
      return leftStart < rightStart ? -1 : leftStart > rightStart ? 1 : 0;
    });
    const actualOrder = traces.map(({ variant }) => variant);
    const orderMatches = traces.length === expectedOrder.length
      && actualOrder.every((variant, variantIndex) => variant === expectedOrder[variantIndex]);
    if (!orderMatches) {
      issues.push(issue('PAIR_ORDER_MISMATCH', { scenario_id: scenarioId, pair_id: pairId }));
      continue;
    }
    if (!pairIdentityMatches(traces, scenario.required_commands)) {
      issues.push(issue('PAIR_IDENTITY_MISMATCH', { scenario_id: scenarioId, pair_id: pairId }));
      continue;
    }
    const variants = Object.fromEntries(traces.map((trace) => [trace.variant, {
      run_id: trace.run_id,
      duration_ns: trace.duration_ns,
      quality_pass: trace.quality_pass,
    }]));
    reports.push({
      id: `${scenarioId}:${pairId}`,
      scenario_id: scenarioId,
      pair_id: pairId,
      run_ids: traces.map(({ run_id }) => run_id),
      fixture_sha256: traces[0].fixture_sha256,
      skill_sha256: traces[0].skill_sha256,
      resources: resourceIdentity(traces[0], scenario.required_commands),
      variants,
      quality_pass: traces.every(({ quality_pass: qualityPass }) => qualityPass),
    });
  }
  return reports;
}

function thresholdInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`Plan threshold ${field} must be a non-negative integer.`);
  }
  return BigInt(value);
}

function scenarioFormalTraces(validTraces, scenarioId) {
  return validTraces.filter((trace) => trace.scenario_id === scenarioId && trace.phase === 'formal');
}

/**
 * 纯分析控制器 trace；非基础设施质量失败仍保留为正式槽位，避免事后挑样。
 */
export function analyzeEvaluation(sourcePlan, sourceTraces) {
  const plan = assertPlan(cloneJson(sourcePlan, 'plan'));
  const traces = cloneJson(sourceTraces, 'traces');
  if (!Array.isArray(traces)) {
    throw new TypeError('Evaluation traces must be an array.');
  }
  const issues = [];
  const validTraces = [];
  const invalidRuns = [];
  const invalidReasons = new Set(plan.invalid_reasons);
  const seenRunIds = new Set();

  for (const [attemptIndex, sourceTrace] of traces.entries()) {
    const trace = assertTrace(sourceTrace);
    // 所有 interval 生命周期先完成结构验证，未知场景不能借路由过滤隐藏损坏证据。
    workerIntervals(trace);
    independentIntervals(trace);
    const commandIntervals = validateCommandLifecycle(trace);
    if (!Object.hasOwn(plan.scenarios, trace.scenario_id)) {
      throw new TypeError('Trace scenario_id is not registered in the evaluation plan.');
    }
    const infrastructureInvalid = trace.invalid_reason !== null
      && invalidReasons.has(trace.invalid_reason);
    validateCommandEvidence(
      commandIntervals,
      plan.scenarios[trace.scenario_id].required_commands,
      !infrastructureInvalid,
    );
    if (seenRunIds.has(trace.run_id)) {
      issues.push(issue('RUN_ID_DUPLICATE', { run_id: trace.run_id, scenario_id: trace.scenario_id }));
    }
    seenRunIds.add(trace.run_id);
    if (trace.invalid_reason !== null) {
      if (!invalidReasons.has(trace.invalid_reason)) {
        issues.push(issue('INVALID_REASON_UNREGISTERED', {
          run_id: trace.run_id,
          scenario_id: trace.scenario_id,
          invalid_reason: trace.invalid_reason,
        }));
      } else {
        // 只有计划允许的基础设施原因才释放槽位；未知标签仍占槽，防止借标签替换慢样本。
        invalidRuns.push({
          attempt_index: attemptIndex,
          invalid_reason: trace.invalid_reason,
          trace,
        });
        continue;
      }
    }
    validTraces.push(trace);
  }

  const formalByScenario = new Map(Object.keys(plan.scenarios).map((scenarioId) => [
    scenarioId,
    scenarioFormalTraces(validTraces, scenarioId),
  ]));
  for (const [scenarioId, scenario] of Object.entries(plan.scenarios)) {
    const expected = Array.isArray(scenario.orders)
      ? scenario.orders.reduce((sum, order) => sum + order.length, 0)
      : scenario.required_valid_runs * scenario.variants.length;
    const actual = formalByScenario.get(scenarioId).length;
    if (actual > expected) {
      issues.push(issue('FORMAL_SAMPLE_LIMIT_EXCEEDED', {
        scenario_id: scenarioId,
        expected_runs: expected,
        actual_runs: actual,
      }));
    }
  }

  const orderedReports = new Map();
  const formalPairs = [];
  for (const [scenarioId, scenario] of Object.entries(plan.scenarios)) {
    if (!Array.isArray(scenario.orders)) {
      continue;
    }
    const reports = analyzeOrderedScenario(
      scenarioId,
      scenario,
      formalByScenario.get(scenarioId),
      issues,
    );
    orderedReports.set(scenarioId, reports);
    formalPairs.push(...reports);
  }

  const commandIdentityPass = true;

  const req003Scenario = plan.scenarios['REQ-003'];
  const req003Reports = orderedReports.get('REQ-003') ?? [];
  const req003Traces = formalByScenario.get('REQ-003') ?? [];
  const req003ExpectedPairs = req003Scenario?.orders?.length ?? 0;
  const req003PairsComplete = req003Reports.length === req003ExpectedPairs
    && req003ExpectedPairs === 3;
  const req003IdentityPass = formalIdentityMatches(
    req003Traces,
    req003Scenario.required_commands,
  );
  if (req003PairsComplete && !req003IdentityPass) {
    issues.push(issue('FORMAL_IDENTITY_MISMATCH', { scenario_id: 'REQ-003' }));
  }
  const req003QualityPass = req003PairsComplete
    && req003Reports.every(({ quality_pass: qualityPass }) => qualityPass);
  const req003WithSkill = req003Traces.filter(({ variant }) => variant === 'with_skill');
  const workerParallelismPass = req003WithSkill.length === 3
    && req003WithSkill.every((trace) => hasWorkerParallelism(
      trace,
      req003Scenario.required_worker_domains,
    ));
  const req003CommandPass = true;
  const req003SkillMedian = req003PairsComplete
    ? medianBigInt(req003Reports.map(({ variants }) => variants.with_skill.duration_ns))
    : null;
  const req003BaselineMedian = req003PairsComplete
    ? medianBigInt(req003Reports.map(({ variants }) => variants.without_skill.duration_ns))
    : null;
  let req003SpeedupPercent = null;
  let req003SpeedPass = false;
  if (req003IdentityPass
    && req003QualityPass
    && req003BaselineMedian !== null
    && req003BaselineMedian > 0n) {
    const improvement = req003BaselineMedian - req003SkillMedian;
    const speedThreshold = thresholdInteger(
      plan.thresholds.median_speedup_percent,
      'median_speedup_percent',
    );
    req003SpeedPass = improvement * 100n >= req003BaselineMedian * speedThreshold;
    req003SpeedupPercent = formatSpeedupPercent(req003SkillMedian, req003BaselineMedian);
  }
  const req003 = {
    pass: req003PairsComplete
      && req003IdentityPass
      && req003QualityPass
      && req003SpeedPass
      && workerParallelismPass
      && req003CommandPass,
    pairs: req003Reports.length,
    quality_pass: req003QualityPass,
    identity_pass: req003IdentityPass,
    command_identity_pass: req003CommandPass,
    worker_parallelism_pass: workerParallelismPass,
    speed_pass: req003SpeedPass,
    skill_median_ns: req003SkillMedian?.toString() ?? null,
    baseline_median_ns: req003BaselineMedian?.toString() ?? null,
    speedup_percent: req003SpeedupPercent,
  };

  const req002Scenario = plan.scenarios['REQ-002'];
  const req002Reports = orderedReports.get('REQ-002') ?? [];
  const req002Traces = formalByScenario.get('REQ-002') ?? [];
  const req002PairsComplete = req002Reports.length === (req002Scenario?.orders?.length ?? 0)
    && req002Reports.length === 3;
  const req002IdentityPass = formalIdentityMatches(
    req002Traces,
    req002Scenario.required_commands,
  );
  if (req002PairsComplete && !req002IdentityPass) {
    issues.push(issue('FORMAL_IDENTITY_MISMATCH', { scenario_id: 'REQ-002' }));
  }
  const req002QualityPass = req002PairsComplete
    && req002Reports.every(({ quality_pass: qualityPass }) => qualityPass);
  const req002WithSkill = req002Traces.filter(({ variant }) => variant === 'with_skill');
  // 短任务显式加载不得先探测 worker、后台会话或等待状态，这些事件任一出现即非零探测。
  const zeroProbePass = req002WithSkill.length === 3
    && req002WithSkill.every((trace) => (
      trace.events.every(({ type }) => !ZERO_PROBE_EVENT_TYPES.has(type))
    ));
  const req002CommandPass = true;
  const req002SkillMedian = req002PairsComplete
    ? medianBigInt(req002Reports.map(({ variants }) => variants.with_skill.duration_ns))
    : null;
  const req002BaselineMedian = req002PairsComplete
    ? medianBigInt(req002Reports.map(({ variants }) => variants.without_skill.duration_ns))
    : null;
  let req002RelativePass = false;
  let req002AbsolutePass = false;
  if (req002QualityPass && req002SkillMedian !== null && req002BaselineMedian !== null) {
    const relativeThreshold = thresholdInteger(
      plan.thresholds.short_relative_percent,
      'short_relative_percent',
    );
    const absoluteThreshold = thresholdInteger(
      plan.thresholds.short_absolute_seconds,
      'short_absolute_seconds',
    ) * 1_000_000_000n;
    // 两个上限独立比较，不能用较宽的一项替代另一项。
    req002RelativePass = req002SkillMedian * 100n <= req002BaselineMedian * relativeThreshold;
    req002AbsolutePass = req002SkillMedian <= req002BaselineMedian + absoluteThreshold;
  }
  const req002 = {
    pass: req002PairsComplete
      && req002IdentityPass
      && req002QualityPass
      && req002RelativePass
      && req002AbsolutePass
      && zeroProbePass
      && req002CommandPass,
    pairs: req002Reports.length,
    quality_pass: req002QualityPass,
    identity_pass: req002IdentityPass,
    command_identity_pass: req002CommandPass,
    zero_probe_pass: zeroProbePass,
    relative_pass: req002RelativePass,
    absolute_pass: req002AbsolutePass,
    skill_median_ns: req002SkillMedian?.toString() ?? null,
    baseline_median_ns: req002BaselineMedian?.toString() ?? null,
  };

  const eval008Scenario = plan.scenarios['EVAL-008'];
  const eval008Traces = formalByScenario.get('EVAL-008') ?? [];
  const minimumRemainingNs = thresholdInteger(
    plan.thresholds.wait_min_remaining_seconds,
    'wait_min_remaining_seconds',
  ) * 1_000_000_000n;
  const eval008RunReports = eval008Traces.map((trace) => {
    const commandPass = true;
    const overlapPass = hasWaitOverlap(
      trace,
      eval008Scenario.required_commands[0],
      minimumRemainingNs,
    );
    return {
      run_id: trace.run_id,
      pair_id: trace.pair_id,
      pass: trace.quality_pass && commandPass && overlapPass,
      quality_pass: trace.quality_pass,
      command_identity_pass: commandPass,
      overlap_pass: overlapPass,
    };
  }).sort((left, right) => compareText(left.run_id, right.run_id));
  const eval008Required = eval008Scenario?.required_valid_runs ?? 0;
  const eval008Slots = new Set(eval008Traces.map(({ pair_id }) => pair_id));
  const eval008Complete = eval008Traces.length === eval008Required
    && eval008Slots.size === eval008Required
    && eval008Traces.every(({ pair_id, variant }) => (
      pair_id <= eval008Required && eval008Scenario.variants.includes(variant)
    ));
  const eval008IdentityPass = formalIdentityMatches(
    eval008Traces,
    eval008Scenario.required_commands,
  );
  if (eval008Complete && !eval008IdentityPass) {
    issues.push(issue('FORMAL_IDENTITY_MISMATCH', { scenario_id: 'EVAL-008' }));
  }
  const eval008PassedRuns = eval008RunReports.filter(({ pass }) => pass).length;
  const eval008 = {
    pass: eval008Complete && eval008IdentityPass && eval008PassedRuns === eval008Required,
    required_runs: eval008Required,
    valid_runs: eval008Traces.length,
    passed_runs: eval008PassedRuns,
    identity_pass: eval008IdentityPass,
    runs: eval008RunReports,
  };

  // 停止只看已注册的有效槽位；慢或质量失败均占槽，基础设施无效尝试不占槽。
  const stopped = {
    req002: req002Reports.length === req002Scenario.orders.length && req002IdentityPass,
    req003: req003Reports.length === req003Scenario.orders.length && req003IdentityPass,
    eval008: eval008Complete && eval008IdentityPass,
    all: false,
  };
  stopped.all = stopped.req002 && stopped.req003 && stopped.eval008;

  const sortedIssues = sortIssues(issues);
  const result = {
    issues: sortedIssues,
    valid_runs: validTraces.map(({ run_id }) => run_id).sort(compareText),
    invalid_runs: invalidRuns.sort((left, right) => compareText(left.trace.run_id, right.trace.run_id)),
    formal_pairs: formalPairs.sort((left, right) => compareText(left.id, right.id)),
    req002,
    req003,
    eval008,
    stopped,
    maturity_pass: sortedIssues.length === 0
      && commandIdentityPass
      && stopped.all
      && req002.pass
      && req003.pass
      && eval008.pass,
  };
  return result;
}
