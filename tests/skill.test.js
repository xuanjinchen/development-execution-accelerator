import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_PROJECT_FILES = [
  'AGENTS.md',
  'LICENSE',
  'README.md',
  'SKILL.md',
  'evals/evals.json',
  'package-lock.json',
  'package.json',
  'tests/skill.test.js',
];
const TRANSIENT_DIRECTORIES = new Set(['.git', '.superpowers', '.tmp', '.tmp-task10g-probe-a', 'node_modules']);
const TRANSIENT_PLANNING_FILES = new Set([
  'docs/superpowers/plans/2026-09-05-development-speed-only-refactor.md',
  'docs/superpowers/specs/2026-09-05-development-speed-only-refactor-design.md',
]);

function read(relativePath) {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
}

function listProjectFiles(directory = REPOSITORY_ROOT, prefix = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (prefix === '' && TRANSIENT_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listProjectFiles(absolutePath, relativePath));
    } else if (!TRANSIENT_PLANNING_FILES.has(relativePath)) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function skillDescription(skill) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/u.exec(skill);
  assert.ok(frontmatter, 'SKILL.md must start with YAML frontmatter.');
  assert.match(frontmatter[1], /^name:\s*["']?development-execution-accelerator["']?\s*$/mu);
  const description = /^description:\s*["']?(.+?)["']?\s*$/mu.exec(frontmatter[1]);
  assert.ok(description, 'SKILL.md must define a description.');
  return description[1];
}

test('repository contains only goal-serving files', () => {
  assert.deepEqual(listProjectFiles(), EXPECTED_PROJECT_FILES);
});

test('Skill has one acceleration objective and preserves upstream decisions', () => {
  const skill = read('SKILL.md');
  const description = skillDescription(skill);

  assert.match(description, /already-decided software-development implementation and verification/u);
  assert.match(description, /eliminating redundant work/u);
  assert.match(description, /useful parallelism/u);
  assert.match(description, /rerunning only invalidated validation/u);
  assert.match(description, /leaving public interfaces, task goals, business logic, required behavior, scope, mandatory checks, architecture, requirements, planning, and business decisions unchanged/u);
  assert.match(skill, /only objective is to accelerate task progress/iu);
  assert.match(skill, /Never change public interfaces, task goal, business logic, required behavior, scope, or mandatory checks/u);
  assert.match(skill, /Never change public interfaces/u);
  assert.match(skill, /architecture, requirements, planning, and business decisions remain upstream/iu);
  assert.match(skill, /consumes only approved outputs/iu);
});

test('Skill selects the cheapest useful execution path', () => {
  const skill = read('SKILL.md');

  assert.match(skill, /zero-overhead sequential path/u);
  assert.match(skill, /one writer per conflict domain/u);
  assert.match(skill, /coordination benefit exceeds its overhead/u);
  assert.match(skill, /Do not probe worker, background, wait, or plan-state capabilities/u);
  assert.match(skill, /Do not invent parallel work/u);
});

test('Skill removes repeated work and validates only invalidated inputs', () => {
  const skill = read('SKILL.md');

  for (const phrase of [
    'repeated repository scans',
    'duplicate investigation',
    'duplicate implementation',
    'busy polling',
    'input identity',
    'rerun only invalidated checks',
    'final input identity',
  ]) {
    assert.match(skill, new RegExp(phrase, 'u'));
  }
  assert.match(skill, /Run the required integrated gate once/u);
  assert.match(skill, /Never remove, weaken, or reorder an upstream-required check/u);
});

test('minimal metadata and evals describe only the current Skill', () => {
  const packageJson = JSON.parse(read('package.json'));
  const packageLock = JSON.parse(read('package-lock.json'));
  const evals = JSON.parse(read('evals/evals.json'));
  const coreText = [read('AGENTS.md'), read('README.md'), read('SKILL.md'), read('evals/evals.json')].join('\n');
  const scenarioBoundaries = new Map([
    ['parallel-independent', /independent|separate conflict-domain/u],
    ['sequential-critical-path', /depends on the previous result|sequential critical path/u],
    ['small-fast-path', /no capability probes|no worker, background session, persistent state, or extra validation/u],
    ['local-failure-recovery', /invalidated checks|mandatory final gate/u],
    ['upstream-decision-boundary', /upstream|architecture|interface|planning/u],
    ['explicit-serial-boundary', /serial order/u],
  ]);

  assert.deepEqual(packageJson.scripts, { test: 'node --test tests/skill.test.js' });
  assert.deepEqual(packageJson.files, ['SKILL.md']);
  assert.equal(packageJson.scaffold, undefined);
  assert.equal(packageLock.packages[''].scripts.test, packageJson.scripts.test);
  assert.equal(evals.skill_name, 'development-execution-accelerator');
  assert.deepEqual(evals.evals.map(({ id }) => id), [
    'parallel-independent',
    'sequential-critical-path',
    'small-fast-path',
    'local-failure-recovery',
    'upstream-decision-boundary',
    'explicit-serial-boundary',
  ]);
  for (const evalEntry of evals.evals) {
    assert.equal(typeof evalEntry.prompt, 'string');
    assert.ok(evalEntry.prompt.trim().length > 0, `${evalEntry.id} prompt must be non-empty`);
    assert.equal(typeof evalEntry.expected_output, 'string');
    assert.ok(evalEntry.expected_output.trim().length > 0, `${evalEntry.id} expected_output must be non-empty`);
    assert.ok(scenarioBoundaries.get(evalEntry.id).test(`${evalEntry.prompt}\n${evalEntry.expected_output}`), `${evalEntry.id} must retain its intended boundary`);
  }
  assert.doesNotMatch(coreText, /11-subject|20(?:-percent|%)|campaign|certification|scaffold|delivery[ -]gate/iu);
});

test('license remains byte-for-byte unchanged', () => {
  const digest = createHash('sha256').update(readFileSync(path.join(REPOSITORY_ROOT, 'LICENSE'))).digest('hex');
  assert.equal(digest, 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4');
});
