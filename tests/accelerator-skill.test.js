import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const skillPath = new URL('../SKILL.md', import.meta.url);
const statePath = new URL('../.scaffold/state.json', import.meta.url);
const briefPath = new URL('../docs/skill-brief.md', import.meta.url);
const deliveryPath = new URL('../docs/delivery-report.md', import.meta.url);
const evalsPath = new URL('../evals/evals.json', import.meta.url);
const formalPlanPath = new URL('../evals/formal-plan.json', import.meta.url);
const fixturesPath = new URL('../evals/fixtures/', import.meta.url);
const promptBudgetPath = new URL('../evals/results/prompt-budget.txt', import.meta.url);
const readmePath = new URL('../README.md', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);
const description = 'Accelerate already-decided long-running software-development implementation and verification. Use automatically for substantial multi-step coding, fixes, refactors, tests, migrations, builds, or configuration work with independent workstreams, long validation waits, or reusable verification; exclude short single-path changes, architecture, requirements, scope, planning, read-only review, and explicit serial/no-parallel requests.';
const initialFiles = {
  'LICENSE': 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4',
  'README.md': 'a6bf8f5e8e333c2c5d4f6b43f0444abf8561ad2c5af78e3b6b27b43b36e529ea',
  'SKILL.md': '3be68d2bc81ab2c481a5863cf74a4242c0da7483d5d26bffe3d605f1eb17a4d7',
  'docs/decisions.md': 'ff46c52aba621ec361f228be18b53dc6a2f64e6e71cf421b6ce0cbd907527792',
  'docs/delivery-report.md': '2dd5e95e1ab25feda48c977084a6fe0e1f93f030df44aacaff43dc373c1a7441',
  'docs/skill-brief.md': 'b8ba4281c9b7edb7a83e9d053b71c16ade6f6e750a15d4d42f881e7ca7addaa7',
  'evals/evals.json': 'c139df3c92d5e9cd20c7cd12b29a718abed2fff72937ed26c9d228cecbd41288',
  'package-lock.json': 'ea4e3e566e63d0d2b000b6ccf39cfc0d7aecdd08e8969fd971114248ca6b01ce',
  'package.json': 'a3016b15e69f9930a6ffd806ed9636b0d4573399b4006c86856dfeac41828015',
};

function frontmatter(source) {
  const match = /^---\n(?<body>[\s\S]*?)\n---\n/u.exec(source);
  assert.ok(match, 'SKILL.md must start with YAML frontmatter');
  return Object.fromEntries(match.groups.body.split('\n').map((line) => {
    const separator = line.indexOf(':');
    assert.notEqual(separator, -1, 'invalid frontmatter line: ' + line);
    return [line.slice(0, separator).trim(), JSON.parse(line.slice(separator + 1).trim())];
  }));
}

function markedJson(source, marker) {
  const match = new RegExp(marker + '\\n```json\\n(?<body>[\\s\\S]*?)\\n```', 'u').exec(source);
  assert.ok(match, `missing JSON contract after ${marker}`);
  return JSON.parse(match.groups.body);
}

function npmCommand(args, {
  npmExecPath = process.env.npm_execpath,
  nodeExecutable = process.execPath,
  exists = existsSync,
} = {}) {
  const candidates = [
    npmExecPath,
    path.join(path.dirname(nodeExecutable), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(nodeExecutable), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  const cli = candidates.find((candidate) => exists(candidate));
  return cli === undefined
    ? { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args }
    : { command: nodeExecutable, args: [cli, ...args] };
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    return entry.isDirectory() ? filesBelow(target) : [target];
  }));
  return nested.flat();
}

function cheapDerive(payload, salt, iterations, keyLength, algorithm) {
  return createHash('sha256')
    .update(JSON.stringify([payload, salt, iterations, keyLength, algorithm]))
    .digest();
}

test('metadata stays synchronized and selects long execution only', async () => {
  const [skill, stateSource, packageSource, lockSource, readme] = await Promise.all([
    readFile(skillPath, 'utf8'),
    readFile(statePath, 'utf8'),
    readFile(packagePath, 'utf8'),
    readFile(lockPath, 'utf8'),
    readFile(readmePath, 'utf8'),
  ]);
  const metadata = frontmatter(skill);
  const state = JSON.parse(stateSource);
  const pkg = JSON.parse(packageSource);
  const lock = JSON.parse(lockSource);
  assert.equal(metadata.name, 'development-execution-accelerator');
  assert.equal(metadata.description, description);
  assert.equal(state.skill.description, metadata.description);
  assert.equal(pkg.description, metadata.description);
  assert.equal(lock.packages[''].description, metadata.description);
  assert.ok(readme.includes(description), 'README selection explanation must use the exact description');
  assert.deepEqual(pkg.files, ['SKILL.md']);
  assert.deepEqual(state.initial_files, initialFiles);
});

test('npm fallback supports the Node prefix POSIX npm CLI', () => {
  const prefix = path.join(path.parse(process.execPath).root, 'opt', 'node');
  const nodeExecutable = path.join(prefix, 'bin', 'node');
  const npmCli = path.join(prefix, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const invocation = npmCommand(['--version'], {
    npmExecPath: null,
    nodeExecutable,
    exists: (candidate) => candidate === npmCli,
  });
  assert.deepEqual(invocation, {
    command: nodeExecutable,
    args: [npmCli, '--version'],
  });
});

test('npm fallback uses the platform command when no CLI file exists', () => {
  const invocation = npmCommand(['--version'], {
    npmExecPath: null,
    exists: () => false,
  });
  assert.deepEqual(invocation, {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['--version'],
  });
});

test('npm dry-run archive contains the runtime payload and npm metadata', async () => {
  const invocation = npmCommand([
    'pack', '--dry-run', '--json', '--ignore-scripts',
  ], { npmExecPath: null });
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout)[0].files.map(({ path: file }) => file).sort();
  assert.deepEqual(files, ['LICENSE', 'README.md', 'SKILL.md', 'package.json']);
  const readme = await readFile(readmePath, 'utf8');
  assert.match(readme, /SKILL\.md is the only runtime payload/iu);
  assert.match(readme, /LICENSE, README\.md, SKILL\.md, and package\.json/iu);
});

test('runtime exposes the ordered long-task protocol and freezes the upstream contract', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const headings = [
    '## Admit only long execution work',
    '## Lock the upstream contract',
    '## Choose the cheapest useful path',
    '## Validate by input identity',
    '## Keep failures local',
    '## Report only observed acceleration',
  ];
  let previous = -1;
  for (const heading of headings) {
    const position = skill.indexOf(heading);
    assert.ok(position > previous, `missing or out-of-order runtime heading: ${heading}`);
    previous = position;
  }
  assert.ok(skill.includes('Never alter goals, logic, architecture, scope, boundaries, acceptance, required checks, or unrelated worktree changes.'));
  assert.ok(skill.includes('Escalate behavior, interface, boundary, scope, or acceptance gaps upstream.'));
  assert.ok(skill.split('\n').length < 300, 'SKILL.md must stay below 300 lines');
  assert.doesNotMatch(skill, /Taskmaster|Spec Kit|OpenSpec/iu);
});

test('admission has three long routes and rejects short work without probes or state', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const longGate = 'First require materially long implementation or required verification. Only then check for an opportunity:';
  assert.ok(skill.includes(longGate), 'materially-long work must gate every acceleration opportunity');
  for (const route of [
    'two medium implementation items are dependency- and conflict-domain-independent;',
    'a long command has approved independent work and enough time beyond one tool round trip plus safety margin;',
    'a multi-stage long path can avoid repeated validation through input-identity reuse or local failure recovery.',
  ]) {
    assert.ok(skill.includes(route), `missing long-task admission route: ${route}`);
  }
  assert.ok(skill.indexOf(longGate) < skill.indexOf('two medium implementation items'));
  assert.ok(skill.includes('Short work exits despite two independent items; long work without an opportunity exits.'));
  assert.ok(skill.includes('Exit with zero worker, background, wait, or plan-state probes and no state.'));
});

test('sequential optimization requires the long-path reuse or local-recovery opportunity', async () => {
  const skill = await readFile(skillPath, 'utf8');
  assert.ok(skill.includes('Use sequential optimization for a long single critical path only under the reuse/local-recovery opportunity above.'));
});

test('worker path requires two medium independent items and one writer', async () => {
  const skill = await readFile(skillPath, 'utf8');
  assert.ok(skill.includes('Use workers only for at least two medium independent implementation items when savings exceed costs.'));
  assert.ok(skill.includes('Keep one writer per file or upstream conflict domain; reduce concurrency for contention, conflicts, flakes, or merge cost.'));
});

test('wait overlap requires margin and performs approved work before evidence or waiting', async () => {
  const skill = await readFile(skillPath, 'utf8');
  assert.ok(skill.includes('a long command has approved independent work and enough time beyond one tool round trip plus safety margin;'));
  assert.ok(skill.includes('On return, confirm it runs and act immediately—do not first organize evidence, poll, or wait.'));
  assert.ok(skill.includes('Complete it, then issue one bounded wait on that session; never busy-poll or invent work to prolong overlap.'));
  assert.ok(skill.includes('If ended, use the sequential result and claim no overlap. Never start dependent work before its result.'));
});

test('behavior contracts cover boundaries, ordered checks, zero probes, and exclusions', async () => {
  const [{ evals }, formalPlan, fixtureInstructions] = await Promise.all([
    readFile(evalsPath, 'utf8').then(JSON.parse),
    readFile(formalPlanPath, 'utf8').then(JSON.parse),
    readFile(new URL('long-task/AGENTS.md', fixturesPath), 'utf8'),
  ]);
  const byId = new Map(evals.map((evaluation) => [evaluation.id, evaluation]));
  assert.match(byId.get('EVAL-001').prompt, /src\/catalog.*src\/billing/isu);
  assert.match(byId.get('EVAL-001').prompt, /npm run test:catalog.*npm run test:billing.*npm test/isu);
  assert.equal(byId.get('EVAL-001').prompt.match(/npm test/gu)?.length, 1, 'EVAL-001 must name the aggregate gate once');
  assert.doesNotMatch(byId.get('EVAL-001').prompt, /\bworker|\bparallel|\bserial/iu);
  assert.doesNotMatch(fixtureInstructions, /\bworker|\bparallel|\bserial/iu);
  assert.match(byId.get('EVAL-001').prompt, /one writer|concurrent writers/iu);
  assert.match(fixtureInstructions, /one writer|concurrent writers/iu);
  assert.match(
    formalPlan.replacement.worker_evidence.join('\n'),
    /two real worker.*positive overlap.*one writer/isu,
  );
  assert.equal(byId.get('EVAL-004').category, 'boundary');
  assert.doesNotMatch(byId.get('EVAL-004').assertions.map(({ text }) => text).join('\n'), /does not select|description-based/iu);
  assert.match(byId.get('EVAL-004').assertions.map(({ text }) => text).join('\n'), /zero worker, background, wait, or plan-state probes/iu);
  assert.doesNotMatch(byId.get('EVAL-004').assertions.map(({ text }) => text).join('\n'), /median|overhead|115 percent|3 second/iu);
  assert.match(byId.get('EVAL-004').assertions.map(({ text }) => text).join('\n'), /no baseline.*wall-clock.*no performance claim/iu);
  assert.equal(byId.get('EVAL-011').category, 'positive');
  assert.match(byId.get('EVAL-011').prompt, /already-approved.*catalog.*billing/isu);
  assert.doesNotMatch(byId.get('EVAL-011').prompt, /\$development-execution-accelerator/iu);
  assert.match(byId.get('EVAL-011').assertions.map(({ text }) => text).join('\n'), /implicitly|description/iu);
  assert.deepEqual(byId.get('EVAL-011').result, { status: 'not-run', evidence: '' });
  assert.equal(formalPlan.replacement.explicit_short.eval_id, 'EVAL-004');
  assert.match(byId.get('EVAL-005').prompt, /current unrelated worktree change/iu);
  assert.match(byId.get('EVAL-005').assertions.map(({ text }) => text).join('\n'), /required order/iu);
  assert.match(byId.get('EVAL-005').assertions.map(({ text }) => text).join('\n'), /allowed file|file boundary/iu);
  assert.match(byId.get('EVAL-008').prompt, /npm run verify:corpus/iu);
  assert.match(byId.get('EVAL-008').prompt, /reporting.*independent/isu);
  assert.match(byId.get('EVAL-008').assertions.map(({ text }) => text).join('\n'), /strictly inside.*corpus/isu);
  assert.equal(byId.get('EVAL-009').category, 'negative');
  assert.match(byId.get('EVAL-009').prompt, /read-only code review/iu);
  assert.equal(byId.get('EVAL-010').category, 'boundary');
  assert.match(byId.get('EVAL-010').prompt, /serially|no-parallel/iu);
});

test('representative fixtures freeze dependency-free commands and real workloads', async () => {
  const requiredFiles = [
    'long-task/AGENTS.md',
    'long-task/package.json',
    'long-task/src/catalog/normalize-catalog.js',
    'long-task/src/billing/allocate-invoice.js',
    'long-task/test/catalog.test.js',
    'long-task/test/billing.test.js',
    'long-task/test/integration.test.js',
    'long-task/scripts/verify-corpus.mjs',
    'contracts/catalog-contract.js',
    'contracts/billing-contract.js',
    'contracts/corpus-runner.js',
    'short-task/package.json',
    'short-task/src/value.js',
    'short-task/test/value.test.js',
    'wait-overlap/package.json',
    'wait-overlap/src/catalog/normalize-catalog.js',
    'wait-overlap/src/billing/allocate-invoice.js',
    'wait-overlap/src/reporting/format-summary.js',
    'wait-overlap/test/catalog.test.js',
    'wait-overlap/test/billing.test.js',
    'wait-overlap/test/reporting.test.js',
    'wait-overlap/scripts/verify-corpus.mjs',
  ];
  for (const relativePath of requiredFiles) {
    assert.ok(existsSync(new URL(relativePath, fixturesPath)), `missing fixture contract: ${relativePath}`);
  }

  const [longPackage, shortPackage, waitPackage, longCorpus, waitCorpus, corpusRunner] = await Promise.all([
    readFile(new URL('long-task/package.json', fixturesPath), 'utf8').then(JSON.parse),
    readFile(new URL('short-task/package.json', fixturesPath), 'utf8').then(JSON.parse),
    readFile(new URL('wait-overlap/package.json', fixturesPath), 'utf8').then(JSON.parse),
    readFile(new URL('long-task/scripts/verify-corpus.mjs', fixturesPath), 'utf8'),
    readFile(new URL('wait-overlap/scripts/verify-corpus.mjs', fixturesPath), 'utf8'),
    readFile(new URL('contracts/corpus-runner.js', fixturesPath), 'utf8'),
  ]);
  assert.deepEqual(longPackage.scripts, {
    'test:catalog': 'node --test test/catalog.test.js',
    'test:billing': 'node --test test/billing.test.js',
    'verify:corpus': 'node scripts/verify-corpus.mjs',
    test: 'node --test test/catalog.test.js test/billing.test.js test/integration.test.js',
  });
  assert.deepEqual(shortPackage.scripts, {
    'test:value': 'node --test test/value.test.js',
    test: 'node --test test/value.test.js',
  });
  assert.deepEqual(waitPackage.scripts, {
    'test:catalog': 'node --test test/catalog.test.js',
    'test:billing': 'node --test test/billing.test.js',
    'test:reporting': 'node --test test/reporting.test.js',
    'verify:corpus': 'node scripts/verify-corpus.mjs',
    test: 'node --test test/catalog.test.js test/billing.test.js test/reporting.test.js',
  });
  for (const source of [longCorpus, waitCorpus]) {
    assert.match(source, /import \{ pbkdf2Sync \} from 'node:crypto'/u);
    assert.match(source, /import \{ allocateInvoice \} from '\.\.\/src\/billing\/allocate-invoice\.js'/u);
    assert.match(source, /import \{ normalizeCatalog \} from '\.\.\/src\/catalog\/normalize-catalog\.js'/u);
    assert.match(source, /import \{ runCorpus \} from '\.\.\/\.\.\/contracts\/corpus-runner\.js'/u);
    assert.match(source, /const result = runCorpus\(\{ normalizeCatalog, allocateInvoice, derive: pbkdf2Sync \}\)/u);
    assert.match(source, /assert\.equal\(result\.digest, 'a96001e44b98186c6d70698bfb28faff9db79803fb618bfb0b7218d2e944bc69'\)/u);
    assert.match(source, /JSON\.stringify\(result\)/u);
  }
  assert.equal(waitCorpus, longCorpus, 'long-task and wait-overlap must run the same frozen corpus bytes');
  assert.doesNotMatch(waitCorpus, /reporting|formatSummary/iu, 'reporting must not be a corpus input');
  assert.match(corpusRunner, /normalizeCatalog\(records\)/u);
  assert.match(corpusRunner, /allocateInvoice\(98765, weights\)/u);

  const fixtureFiles = await filesBelow(fixturesPath);
  for (const fixtureFile of fixtureFiles) {
    const source = await readFile(fixtureFile, 'utf8');
    assert.doesNotMatch(
      source,
      /\bsleep\b|Date\.now|\bnew\s+Date\b|\bgetTime\s*\(|\bperformance\b|process\.hrtime|hrtime\.bigint|process\.uptime|setTimeout|setInterval|Atomics\.wait|\belapsed\b|\badaptive\b/iu,
      `${fixtureFile.pathname} contains an adaptive or clock-based workload`,
    );
    assert.doesNotMatch(source, /writeFile[^\n]*(?:note|evidence)/iu, `${fixtureFile.pathname} writes note/evidence as workload`);
  }
});

test('corpus runner invokes derivation 96 times with frozen inputs', async () => {
  const [{ runCorpus }, { normalizeCatalog }, { allocateInvoice }] = await Promise.all([
    import(new URL('../evals/fixtures/contracts/corpus-runner.js', import.meta.url)),
    import(new URL('../evals/fixtures/wait-overlap/src/catalog/normalize-catalog.js', import.meta.url)),
    import(new URL('../evals/fixtures/wait-overlap/src/billing/allocate-invoice.js', import.meta.url)),
  ]);
  const calls = [];
  const result = runCorpus({
    normalizeCatalog,
    allocateInvoice,
    derive: (...args) => {
      calls.push(args);
      return cheapDerive(...args);
    },
  });

  assert.equal(calls.length, 96);
  assert.ok(calls.every(([, , iterations, keyLength, algorithm]) => (
    iterations === 2400000 && keyLength === 32 && algorithm === 'sha256'
  )));
  assert.deepEqual(calls[0], [
    '{"index":0,"source":{"sku":" sku-000 ","quantity":1,"tags":[" GROUP-0 ","featured"]},"normalized":{"sku":"SKU-000","quantity":9,"tags":["featured","group-0"]},"allocated_cents":188}',
    'development-execution-accelerator:000',
    2400000,
    32,
    'sha256',
  ]);
  assert.deepEqual(calls[95], [
    '{"index":95,"source":{"sku":" sku-031 ","quantity":1,"tags":[" GROUP-3 "," Featured "]},"normalized":{"sku":"SKU-031","quantity":7,"tags":["featured","group-3"]},"allocated_cents":4689}',
    'development-execution-accelerator:095',
    2400000,
    32,
    'sha256',
  ]);
  assert.deepEqual(Object.keys(result).sort(), ['algorithm', 'digest', 'iterations', 'records']);
  assert.match(result.digest, /^[a-f0-9]{64}$/u);
});

test('corpus digest depends on derived bytes and public catalog and billing results', async () => {
  const [{ runCorpus }, { normalizeCatalog }, { allocateInvoice }] = await Promise.all([
    import(new URL('../evals/fixtures/contracts/corpus-runner.js', import.meta.url)),
    import(new URL('../evals/fixtures/wait-overlap/src/catalog/normalize-catalog.js', import.meta.url)),
    import(new URL('../evals/fixtures/wait-overlap/src/billing/allocate-invoice.js', import.meta.url)),
  ]);
  const baseline = runCorpus({ normalizeCatalog, allocateInvoice, derive: cheapDerive }).digest;
  const changedDerivation = runCorpus({
    normalizeCatalog,
    allocateInvoice,
    derive: (...args) => {
      const bytes = Buffer.from(cheapDerive(...args));
      bytes[0] ^= 1;
      return bytes;
    },
  }).digest;
  const changedCatalog = runCorpus({
    normalizeCatalog: (records) => normalizeCatalog(records).map((record, index) => (
      index === 0 ? { ...record, tags: [...record.tags, 'changed'] } : record
    )),
    allocateInvoice,
    derive: cheapDerive,
  }).digest;
  const changedBilling = runCorpus({
    normalizeCatalog,
    allocateInvoice: (totalCents, weights) => {
      const allocations = allocateInvoice(totalCents, weights);
      return [allocations[0] - 1, allocations[1] + 1, ...allocations.slice(2)];
    },
    derive: cheapDerive,
  }).digest;

  assert.equal(new Set([baseline, changedDerivation, changedCatalog, changedBilling]).size, 4);
});

test('retired controller plan points only to the fixed lean campaign contract', async () => {
  const plan = JSON.parse(await readFile(formalPlanPath, 'utf8'));
  assert.deepEqual(plan, {
    schema_version: 2,
    skill: 'development-execution-accelerator',
    status: 'superseded',
    superseded_contract: 'legacy paired controller plan',
    replacement: {
      runner: 'scripts/run-lean-evaluation.js',
      process_limit: 11,
      subject_order: [
        'pilot-with-skill',
        'long-1-with',
        'long-1-without',
        'long-2-without',
        'long-2-with',
        'long-3-with',
        'long-3-without',
        'short-explicit',
        'wait-overlap',
        'implicit-positive',
        'near-miss-negative',
      ],
      non_scoring_pilot: {
        eval_id: 'EVAL-003',
        variant: 'with_skill',
        multi_agent: false,
      },
      long_pairs: {
        eval_id: 'EVAL-001',
        count: 3,
        variants: ['with_skill', 'without_skill'],
        paired_prompt_identity: 'byte-identical',
        median_speedup_percent: 20,
      },
      explicit_short: {
        eval_id: 'EVAL-004',
        count: 1,
        baseline: false,
        wall_clock_claim: false,
      },
      wait_overlap: {
        eval_id: 'EVAL-008',
        count: 1,
      },
      implicit_positive: {
        eval_id: 'EVAL-011',
        count: 1,
      },
      explicit_serial_near_miss: {
        eval_id: 'EVAL-010',
        count: 1,
      },
      worker_evidence: [
        'Two real worker calls implement the disjoint catalog and billing conflict domains.',
        'The catalog and billing implementation intervals have positive overlap.',
        'Each conflict domain keeps one writer, and background validation is not counted as a worker.',
      ],
    },
    legacy_cli_scope: 'Repository-local one-version analysis only; not an active campaign contract.',
    known_limitation: 'Completed publication tombstones are retained and may accumulate.',
  });
  assert.doesNotMatch(JSON.stringify(plan), /draft_a34625a|short_relative_percent|short_absolute_seconds/iu);
});

test('validation binds reusable results to input identity and runs one integrated gate', async () => {
  const skill = await readFile(skillPath, 'utf8');
  assert.ok(skill.includes('Execute every captured required check in original order.'));
  assert.ok(skill.includes('Bind results to normalized command/workdir, relevant change/config/dependency identity, environment, outcome, and order.'));
  assert.ok(skill.includes('Reuse only a passing result at the same order position with full identity match.'));
  assert.ok(skill.includes('Run the integrated gate once per final input identity; repair or change that alters identity requires another run.'));
  assert.ok(skill.includes('A change invalidates only affected results; shared foundations, dependency/config changes, or gate inputs expand invalidation.'));
});

test('local failure recovery preserves valid independent results', async () => {
  const skill = await readFile(skillPath, 'utf8');
  assert.ok(skill.includes('Block only dependents. Repair the earliest failure; rerun invalidated checks.'));
  assert.ok(skill.includes('Preserve independent passing results with matching identity.'));
  assert.ok(skill.includes('Never repeat an unchanged failure without a new hypothesis.'));
});

test('evidence report names only observed modes and acceleration', async () => {
  const skill = await readFile(skillPath, 'utf8');
  assert.ok(skill.includes('Report result, mode (worker parallelism, wait overlap, sequential optimization), work, checks, reuse, fallbacks, and limits.'));
  assert.ok(skill.includes('Never label background validation worker development or claim overlap after completion.'));
  assert.ok(skill.includes('Without a same-condition external baseline, report modes/actions only: no qualitative or quantitative speedup/faster claim.'));
  assert.ok(skill.includes('With no observed optimization, report `normal sequential / no observed acceleration`.'));
});

test('prompt input keeps at least 50 tokens of conservative margin', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const conservativeUpperBound = Math.ceil([...description + skill].length / 2);
  assert.ok(
    conservativeUpperBound <= 2200,
    `conservative prompt bound ${conservativeUpperBound} leaves less than 50 tokens under 2250`,
  );
});

test('Brief prompt budget evidence matches the current description and Skill bytes', async () => {
  const [skill, briefSource, artifact] = await Promise.all([
    readFile(skillPath, 'utf8'),
    readFile(briefPath, 'utf8'),
    readFile(promptBudgetPath, 'utf8'),
  ]);
  const skillDigest = createHash('sha256').update(skill).digest('hex');
  const measured = Math.ceil([...description + skill].length / 2);
  const evidenceDigest = createHash('sha256').update(artifact).digest('hex');
  assert.ok(artifact.includes(`Exact description: ${description}`));
  assert.ok(artifact.includes(`Skill SHA-256: ${skillDigest}`));
  assert.ok(artifact.includes('Formula: ceil(combined Unicode characters / 2)'));
  assert.ok(artifact.includes(`Combined Unicode characters: ${[...description + skill].length}`));
  assert.ok(artifact.includes(`Measured conservative bound: ${measured}`));
  assert.ok(artifact.includes('Limit: 2250'));
  assert.ok(artifact.includes(`Margin: ${2250 - measured}`));
  assert.ok(artifact.includes('Current structure: PASS'));
  const brief = markedJson(briefSource, '<!-- scaffold-contract:skill-brief:v1 -->');
  assert.deepEqual(brief.prompt_budget, {
    limit_tokens: 2250,
    measured_tokens: measured,
    evidence: `artifact:evals/results/prompt-budget.txt#sha256:${evidenceDigest}`,
  });
});

test('README documents the real local lifecycle without invented commands', async () => {
  const readme = await readFile(readmePath, 'utf8');
  assert.ok(readme.startsWith('# development\\-execution\\-accelerator\n'));
  for (const heading of [
    'Purpose',
    'Prerequisites',
    'Local installation',
    'Minimal example',
    'Execution behavior',
    'Planning boundary',
    'Validation',
    'Troubleshooting',
    'Removal',
    'Security',
    'License',
  ]) {
    assert.match(readme, new RegExp('^## ' + heading + '$', 'mu'));
  }
  assert.match(readme, /npm run check/u);
  assert.match(readme, /npm run gate:delivery/u);
  assert.doesNotMatch(readme, /npm run (?:install|publish|release)/u);
  assert.doesNotMatch(readme, /formally supports (?:Codex|Claude|Cursor)/iu);
  assert.doesNotMatch(readme, /7\.442%/u);
  assert.match(readme, /pending and blocked current-byte behavior evidence/iu);
  for (const blocker of [
    'single short-task zero-probe/state boundary',
    'fallback and explicit-serial behavior',
    'worker correctness and performance',
    'validation reuse and local recovery',
    'platform-neutral capability behavior',
    'real-work wait overlap',
  ]) {
    assert.ok(readme.includes(blocker), `README omits current-byte blocker: ${blocker}`);
  }
});

test('REQ-005 and its Delivery trace await current-byte fallback evidence', async () => {
  const [briefSource, deliverySource] = await Promise.all([
    readFile(briefPath, 'utf8'),
    readFile(deliveryPath, 'utf8'),
  ]);
  const brief = markedJson(briefSource, '<!-- scaffold-contract:skill-brief:v1 -->');
  const delivery = markedJson(deliverySource, '<!-- scaffold-contract:delivery-report:v1 -->');
  const fallback = brief.acceptance_criteria.find(({ id }) => id === 'REQ-005');
  assert.equal(fallback.status, 'pending');
  assert.match(fallback.verification, /current-byte/iu);
  assert.doesNotMatch(fallback.verification, /passed by preserved/iu);
  assert.deepEqual(delivery.requirements.find(({ id }) => id === 'REQ-005'), {
    id: 'REQ-005',
    implementation: 'path:SKILL.md',
    verification: 'eval:EVAL-003,EVAL-010',
    status: 'blocked',
    blocker: 'Current-byte fallback and explicit-serial behavior evidence has not been rerun for the rewritten runtime.',
    unblock_condition: 'Attach passing current-byte EVAL-003 and EVAL-010 evidence for safe fallback and prohibited acceleration operations.',
  });
});

test('Delivery makes no capability claim while its enhancement tracks are blocked', async () => {
  const deliverySource = await readFile(deliveryPath, 'utf8');
  const delivery = markedJson(deliverySource, '<!-- scaffold-contract:delivery-report:v1 -->');
  assert.deepEqual(delivery.capability_claims, []);
});

test('REQ-003 performance block keeps the Brief and state draft', async () => {
  const [briefSource, stateSource] = await Promise.all([
    readFile(briefPath, 'utf8'),
    readFile(statePath, 'utf8'),
  ]);
  const brief = markedJson(briefSource, '<!-- scaffold-contract:skill-brief:v1 -->');
  const state = JSON.parse(stateSource);
  const parallelism = brief.acceptance_criteria.find(({ id }) => id === 'REQ-003');
  assert.equal(parallelism.status, 'blocked');
  assert.equal(brief.status, 'draft');
  assert.equal(state.status, 'draft');
});

test('historical wait attempts remain prose while the changed evaluation is not run', async () => {
  const evals = JSON.parse(await readFile(evalsPath, 'utf8'));
  const waitOverlap = evals.evals.find(({ id }) => id === 'EVAL-008');
  assert.deepEqual(waitOverlap.result, { status: 'not-run', evidence: '' });
  const historicalArtifact = await readFile(
    new URL('../evals/results/EVAL-008.txt', import.meta.url),
    'utf8',
  );
  assert.match(historicalArtifact, /Outcome: FAIL/iu);
  assert.match(historicalArtifact, /historical|attempt/iu);

  const capabilityProtocol = await readFile(
    new URL('../evals/results/capability-protocol.txt', import.meta.url),
    'utf8',
  );
  assert.match(capabilityProtocol, /REQ-006 remains blocked until EVAL-008 passes\./u);

  const brief = markedJson(
    await readFile(briefPath, 'utf8'),
    '<!-- scaffold-contract:skill-brief:v1 -->',
  );
  assert.equal(brief.acceptance_criteria.find(({ id }) => id === 'REQ-001').status, 'pending');
  assert.equal(brief.acceptance_criteria.find(({ id }) => id === 'REQ-002').status, 'pending');
  assert.equal(brief.acceptance_criteria.find(({ id }) => id === 'REQ-005').status, 'pending');
  for (const id of ['REQ-003', 'REQ-004', 'REQ-006']) {
    assert.equal(brief.acceptance_criteria.find((item) => item.id === id).status, 'blocked');
  }
});
