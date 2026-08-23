# Development Execution Accelerator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a platform-neutral Skill that automatically accelerates execution and verification of already-decided software-project work without changing architecture, scope, file boundaries, or required acceptance criteria.

**Architecture:** Keep the deliverable self-contained in one SKILL.md so compatible Agents use the same capability-based protocol without loading adapters. Select the lowest-overhead execution mode, safely overlap independent work and long-running commands, preserve one writer per conflict domain, and run the smallest sufficient validation above the upstream-required floor. Scaffold contracts and isolated paired evaluations must prove correctness and measurable speed.

**Tech Stack:** Agent Skills Markdown/YAML, Node.js 22+, npm, ES modules, node:test, Git, PowerShell, and Evidence Contract v1.

**Spec:** docs/superpowers/specs/2026-08-19-development-execution-accelerator-design.md

## Global Constraints

- Run the scaffold initializer exactly once with name development-execution-accelerator and license Apache-2.0.
- Trigger for every software-project execution task after its implementation direction is decided; do not own architecture, requirements, or project-task planning.
- Preserve all upstream-required checks. Targeted validation may add or reorder checks but may not remove the required floor.
- Use capability detection instead of hard-coded Agent product branches; do not claim named-Agent support without a real discovery and execution run.
- Use the fast path when coordination would cost more than it saves; do not create persistent state or workers for a local single-path task.
- Allow only one writer per file or upstream-declared conflict domain.
- Do not add runtime dependencies, helper scripts, assets, an installer, global rules, platform metadata, or release automation in the first implementation.
- Keep SKILL.md below 300 lines and preserve the scaffold publication whitelist containing only SKILL.md.
- Correctness is a hard gate. The representative parallel evaluation must reduce median wall-clock time by at least 20%; small-task median overhead must be at most 15% and at most 3 seconds absolute.
- Use at least three samples when elapsed-time variance exceeds 10%; report median and range.
- Do not push, create a Tag or Release, publish a package, use credentials, or make a paid external Agent call without explicit user authorization.
- Preserve initial digests in .scaffold/state.json; normal file evolution may produce digest-drift warnings.
- New source comments use scoped simplified-Chinese maintenance comments only for non-obvious concurrency, recovery, ownership, or compatibility constraints.

## File Map

| Path | Responsibility |
| --- | --- |
| SKILL.md | Capability-based acceleration workflow and output contract |
| .scaffold/state.json | Scaffold lifecycle and current Skill metadata; initial digests stay unchanged |
| package.json and package-lock.json | Synchronized current name and description |
| docs/skill-brief.md | Requirements, acceptance criteria, track states, and prompt budget |
| docs/decisions.md | Validated decisions about scope, invocation, compatibility, and optional tracks |
| docs/delivery-report.md | Requirement-to-implementation and evaluation evidence |
| evals/evals.json | Stable positive, negative, and boundary behavior contracts |
| evals/results/*.txt | Compact evaluation and prompt-budget evidence |
| tests/accelerator-skill.test.js | Static scope, invariant, and metadata synchronization tests |
| README.md | Installation, usage, validation, limitation, and removal guide |
| ../development-execution-accelerator-workspace/ | Untracked isolated runs, timing, grading, benchmark, and review page |

---

### Task 1: Initialize the Skill and lock the requirement baseline

**Files:**
- Create: .scaffold/state.json
- Create: SKILL.md
- Create: docs/skill-brief.md
- Create: docs/decisions.md
- Create: docs/delivery-report.md
- Create: evals/evals.json
- Modify: README.md
- Modify: LICENSE
- Modify: package.json
- Modify: package-lock.json

**Interfaces:**
- Consumes: approved design and source-mode scaffold
- Produces: initialized state, requirement IDs REQ-001 through REQ-006, and decision IDs DEC-001 through DEC-005

- [ ] **Step 1: Verify source-mode preconditions**

Run:

~~~powershell
git status --short --branch
node -e "const p=require('./package.json'); if(p.scaffold?.mode!=='source') process.exit(1)"
if (Test-Path -LiteralPath '.scaffold\state.json') { throw 'Unexpected scaffold state before initialization.' }
~~~

Expected: scaffold.mode is source and no state file exists.

- [ ] **Step 2: Run the one-time initializer**

~~~powershell
npm run init:skill -- --name development-execution-accelerator --description "Accelerate implementation and verification of already-decided project work across coding agents without changing architecture, scope, or required acceptance criteria." --license Apache-2.0
~~~

Expected: status initialized. Keep the source-origin warning because publication is outside scope.

- [ ] **Step 3: Replace the generated Skill Brief contract**

Keep the generated heading and Evidence Contract explanation. Replace only the JSON block after the scaffold-contract:skill-brief:v1 marker with:

~~~json
{
  "schema_version": 1,
  "status": "draft",
  "conflicts": [
    {
      "id": "CONFLICT-001",
      "summary": "The initial request focused on long tasks, then expanded invocation to every project execution task.",
      "status": "resolved",
      "resolution": "Apply the accelerator to every execution-stage project task and use a zero-worker fast path for small work."
    },
    {
      "id": "CONFLICT-002",
      "summary": "The initial design considered project planning before the user assigned that responsibility to other Skills.",
      "status": "resolved",
      "resolution": "Consume upstream decisions and return unresolved architecture questions instead of making them."
    }
  ],
  "acceptance_criteria": [
    {
      "id": "REQ-001",
      "requirement": "Automatically apply to execution-stage software-project tasks without requiring the user to mention acceleration.",
      "verification": "Positive and implicit-selection evaluations pass while planning-only and explanation-only evaluations remain outside execution acceleration.",
      "status": "pending"
    },
    {
      "id": "REQ-002",
      "requirement": "Use a low-overhead fast path for local single-path tasks.",
      "verification": "The small-task paired benchmark stays within both the 15 percent and 3 second overhead limits.",
      "status": "pending"
    },
    {
      "id": "REQ-003",
      "requirement": "Parallelize only independent work while preserving one writer per conflict domain.",
      "verification": "The representative parallel evaluation has no overlapping writes, passes all checks, and reduces median wall-clock time by at least 20 percent.",
      "status": "pending"
    },
    {
      "id": "REQ-004",
      "requirement": "Run the smallest sufficient validation without removing upstream-required checks.",
      "verification": "Validation-floor and failure-recovery evaluations record every required check and no duplicate long command for the same input identity.",
      "status": "pending"
    },
    {
      "id": "REQ-005",
      "requirement": "Degrade safely when workers, background commands, incremental waiting, or plan-state tools are unavailable.",
      "verification": "The capability-limited boundary evaluation completes sequentially without claiming unavailable tools or changing task semantics.",
      "status": "pending"
    },
    {
      "id": "REQ-006",
      "requirement": "Remain platform-neutral and distinguish capability-protocol compatibility from named-Agent support.",
      "verification": "Static contracts and behavior evidence confirm capability-based routing; named support is absent unless a live Agent run is attached.",
      "status": "pending"
    }
  ],
  "tracks": {
    "references": {
      "status": "disabled",
      "evidence": "The approved workflow fits in a focused single-file Skill, avoiding conditional context loads.",
      "unblock_condition": ""
    },
    "scripts": {
      "status": "disabled",
      "evidence": "No repeated deterministic helper implementation has yet demonstrated a speed or reliability gain.",
      "unblock_condition": ""
    },
    "assets": {
      "status": "disabled",
      "evidence": "The Skill produces no artifact that depends on reusable binary or text assets.",
      "unblock_condition": ""
    },
    "implicit-trigger": {
      "status": "blocked",
      "evidence": "required:Run implicit selection evaluations against the final description.;impact:Automatic execution-stage activation is not yet evidenced.",
      "unblock_condition": "Attach a passing implicit-selection evaluation artifact for the final description."
    },
    "multi-agent": {
      "status": "blocked",
      "evidence": "required:Validate capability-based routing and fallback behavior.;impact:Only the design-level compatibility protocol is currently available.",
      "unblock_condition": "Attach passing capability-routing and fallback evidence without making unverified named-Agent claims."
    },
    "installer": {
      "status": "disabled",
      "evidence": "A standard local Skill directory is sufficient; no managed user configuration is required.",
      "unblock_condition": ""
    },
    "open-source-release": {
      "status": "disabled",
      "evidence": "The user requested local development but did not authorize publication, Tag creation, or Release maintenance.",
      "unblock_condition": ""
    }
  },
  "prompt_budget": {
    "limit_tokens": null,
    "measured_tokens": null,
    "evidence": ""
  }
}
~~~

- [ ] **Step 4: Replace the generated Decisions contract**

Replace the JSON block after the scaffold-contract:decisions:v1 marker with:

~~~json
{
  "schema_version": 1,
  "decisions": [
    {
      "id": "DEC-001",
      "status": "active",
      "scope": "responsibility",
      "decision": "Optimize only an already-decided execution and validation chain; return architecture and planning gaps upstream.",
      "evidence": "Approved design sections Background, Non-goals, and Input execution contract.",
      "supersedes": null
    },
    {
      "id": "DEC-002",
      "status": "active",
      "scope": "invocation",
      "decision": "Apply automatically to every project execution task and select a zero-worker fast path when coordination has no payoff.",
      "evidence": "User explicitly expanded the scope from long tasks to all project tasks.",
      "supersedes": null
    },
    {
      "id": "DEC-003",
      "status": "active",
      "scope": "compatibility",
      "decision": "Route by observable worker, background, wait, communication, state, and cache capabilities instead of Agent product names.",
      "evidence": "Approved capability model and multi-Agent requirement.",
      "supersedes": null
    },
    {
      "id": "DEC-004",
      "status": "active",
      "scope": "packaging",
      "decision": "Keep the first delivery self-contained in SKILL.md and leave references, scripts, assets, metadata, and installers disabled.",
      "evidence": "The core workflow fits below the 300-line budget and the scaffold publishes only SKILL.md.",
      "supersedes": null
    },
    {
      "id": "DEC-005",
      "status": "active",
      "scope": "release",
      "decision": "Complete reversible local delivery only; do not push, tag, release, or upload packages.",
      "evidence": "No publication authorization was provided.",
      "supersedes": null
    }
  ]
}
~~~

- [ ] **Step 5: Validate and commit the initialized draft**

~~~powershell
npm run check
git diff --check
git add .scaffold/state.json SKILL.md README.md LICENSE package.json package-lock.json docs/skill-brief.md docs/decisions.md docs/delivery-report.md evals/evals.json
git diff --cached --check
git commit -m "docs: initialize accelerator requirements"
~~~

Expected: checks exit 0. Digest drift is a warning, not an error.

---

### Task 2: Freeze behavior contracts before writing the workflow

**Files:**
- Modify: evals/evals.json

**Interfaces:**
- Consumes: REQ-001 through REQ-006
- Produces: stable EVAL-001 through EVAL-003 with pre-output assertions and not-run results

- [ ] **Step 1: Replace the empty evaluation array**

Use this exact contract. Assertions derive from the approved spec before run outputs are observed:

~~~json
{
  "schema_version": 1,
  "skill": "development-execution-accelerator",
  "evals": [
    {
      "id": "EVAL-001",
      "category": "positive",
      "prompt": "An upstream plan has approved two independent changes in this isolated Node fixture. First, make normalizeAlpha(value) in src/alpha.js return String(value).trim().toUpperCase() and run npm run test:alpha. Second, make normalizeBeta(value) in src/beta.js return 0 for non-finite input and otherwise Math.max(0, Math.trunc(number)), then run npm run test:beta. The files do not overlap. After both tasks, run the required npm test command. No architecture decision remains. Implement the plan and report execution and validation evidence.",
      "assertions": [
        {
          "id": "ASSERT-001",
          "text": "Both approved changes are implemented within their disjoint file boundaries and the full required test command passes."
        },
        {
          "id": "ASSERT-002",
          "text": "Independent work or validation waits are overlapped without concurrent writes to the same conflict domain."
        },
        {
          "id": "ASSERT-003",
          "text": "The final report states the execution mode, validation evidence, and fallback without inventing architecture."
        }
      ],
      "result": {
        "status": "not-run",
        "evidence": ""
      }
    },
    {
      "id": "EVAL-002",
      "category": "negative",
      "prompt": "We have not selected the event transport for a new billing subsystem. Compare Kafka and RabbitMQ, choose the architecture, split the project into implementation tasks, and do not modify repository files yet.",
      "assertions": [
        {
          "id": "ASSERT-001",
          "text": "The accelerator does not take ownership of architecture selection or implementation scheduling before an upstream decision exists."
        },
        {
          "id": "ASSERT-002",
          "text": "No repository file or execution-state artifact is created by the accelerator."
        }
      ],
      "result": {
        "status": "not-run",
        "evidence": ""
      }
    },
    {
      "id": "EVAL-003",
      "category": "boundary",
      "prompt": "Execute this approved one-file fix in an isolated fixture, but assume the current Agent exposes only foreground shell commands and has no worker, background, incremental-wait, or plan-state tools. Make doubleValue(value) in src/value.js return twice a finite numeric input and throw TypeError for non-finite input. Run npm run test:value, then run the required npm test command without changing the plan.",
      "assertions": [
        {
          "id": "ASSERT-001",
          "text": "The work completes sequentially and does not claim unavailable capabilities."
        },
        {
          "id": "ASSERT-002",
          "text": "Targeted and required full validation both run without architecture or scope changes."
        }
      ],
      "result": {
        "status": "not-run",
        "evidence": ""
      }
    }
  ]
}
~~~

- [ ] **Step 2: Validate and commit the behavior contract**

~~~powershell
node -e "const e=require('./evals/evals.json'); if(e.skill!=='development-execution-accelerator'||e.evals.length!==3||e.evals.some(x=>x.assertions.length===0||x.result.status!=='not-run')) process.exit(1)"
npm run check
git add evals/evals.json
git diff --cached --check
git commit -m "test: define accelerator behavior contract"
~~~

Expected: checks exit 0. Do not run gate:delivery while results are not-run.

---

### Task 3: Implement the self-contained acceleration workflow with TDD

**Files:**
- Create: tests/accelerator-skill.test.js
- Modify: SKILL.md
- Modify: .scaffold/state.json
- Modify: package.json
- Modify: package-lock.json

**Interfaces:**
- Consumes: approved behavior contracts
- Produces: final description and one workflow below 300 lines

- [ ] **Step 1: Write the failing static contract test**

Create tests/accelerator-skill.test.js:

~~~javascript
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const skillPath = new URL('../SKILL.md', import.meta.url);
const statePath = new URL('../.scaffold/state.json', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);

function frontmatter(source) {
  const match = /^---\n(?<body>[\s\S]*?)\n---\n/u.exec(source);
  assert.ok(match, 'SKILL.md must start with YAML frontmatter');
  return Object.fromEntries(match.groups.body.split('\n').map((line) => {
    const separator = line.indexOf(':');
    assert.notEqual(separator, -1, 'invalid frontmatter line: ' + line);
    return [line.slice(0, separator).trim(), JSON.parse(line.slice(separator + 1).trim())];
  }));
}

test('metadata stays synchronized and selects execution rather than architecture work', async () => {
  const [skill, stateSource, packageSource, lockSource] = await Promise.all([
    readFile(skillPath, 'utf8'),
    readFile(statePath, 'utf8'),
    readFile(packagePath, 'utf8'),
    readFile(lockPath, 'utf8'),
  ]);
  const metadata = frontmatter(skill);
  const state = JSON.parse(stateSource);
  const pkg = JSON.parse(packageSource);
  const lock = JSON.parse(lockSource);
  assert.equal(metadata.name, 'development-execution-accelerator');
  assert.match(metadata.description, /every software-project execution task/iu);
  assert.match(metadata.description, /architecture|project-planning/iu);
  assert.equal(state.skill.description, metadata.description);
  assert.equal(pkg.description, metadata.description);
  assert.equal(lock.packages[''].description, metadata.description);
});

test('workflow preserves acceleration invariants', async () => {
  const skill = await readFile(skillPath, 'utf8');
  for (const required of [
    /upstream execution contract/iu,
    /fast path/iu,
    /one writer/iu,
    /independent work/iu,
    /background/iu,
    /required validation/iu,
    /smallest sufficient/iu,
    /return.*upstream/isu,
    /execution mode/iu,
  ]) {
    assert.match(skill, required);
  }
  assert.ok(skill.split('\n').length < 300, 'SKILL.md must stay below 300 lines');
  assert.doesNotMatch(skill, /Taskmaster|Spec Kit|OpenSpec/iu);
});
~~~

- [ ] **Step 2: Run the test and observe the missing workflow**

~~~powershell
node --test tests/accelerator-skill.test.js
~~~

Expected: FAIL because the generated Skill lacks the final trigger and invariants.

- [ ] **Step 3: Replace SKILL.md**

Use this exact frontmatter:

~~~markdown
---
name: "development-execution-accelerator"
description: "Accelerate implementation and verification for every software-project execution task after the solution direction is decided. Use automatically for coding, fixes, refactors, tests, migrations, build or configuration changes, and repository documentation; do not use it to make architecture or project-planning decisions."
---
~~~

Use this exact body:

~~~markdown
# Development Execution Accelerator

Speed up an already-decided implementation without changing what was decided. Domain, architecture, planning, debugging, testing, and documentation Skills keep ownership of their decisions; this Skill only optimizes execution order, waiting, and validation.

## Lock the upstream execution contract

Read the request, approved plan or upstream decision, repository instructions, current worktree, allowed file scope, dependencies, acceptance criteria, and required validation. Treat a clear small request plus repository evidence as a minimal upstream execution contract.

If missing information only affects scheduling, use the safest sequential order. If it changes behavior, interfaces, module boundaries, scope, or acceptance, return the question upstream. Do not decide it here.

## Detect only useful capabilities

Check whether the Agent can run independent workers, directed follow-ups, background commands, incremental waits, and plan state. Reuse the result. Missing capabilities select a fallback; they are not errors.

Protect unrelated worktree changes. Never reset, overwrite, or widen the approved scope to create parallel work.

## Choose the lowest-overhead mode

### Fast path

Use the main Agent directly when work has one short critical path or coordination costs more than it saves. Do not start workers or create persistent planning files. Read only necessary context and run the smallest sufficient validation above the required floor.

### Parallel path

Use workers only when at least two approved work items are independent and expected savings exceed dispatch and merge cost. Prefer parallel read-only discovery, disjoint-module implementation, test preparation, and independent review.

Keep one main slot available to integrate results and dispatch newly ready work. Give each worker the objective, allowed files, dependencies, completion condition, and evidence to return. Maintain one writer for every file or upstream-declared conflict domain.

### Wait-overlap path

Run a long command in the background only when approved work exists that does not depend on its result. Record command, working directory, input identity, and session handle. Continue only independent work, use bounded waits instead of busy polling, and consume one valid result for identical command and input identity.

Reduce concurrency when overlap creates resource contention, edit conflicts, flaky results, or extra integration cost. Preserve completed independent results.

## Execute ready work

Maintain a compact ledger of ready, running, completed, failed, and blocked work. Reuse upstream state or Agent-native planning for cross-session work; do not create an unrequested state directory for ordinary tasks.

Dispatch newly ready work without waiting for a complete wave. Never start a dependent item before its prerequisite result is known. Share the smallest common context instead of making every worker rescan the repository.

## Validate precisely

Required validation from the upstream contract is an immutable floor. Reorder or concurrently run independent checks only when they do not compete for the same build resources; never remove, relabel, or silently skip them.

Choose extra checks from cheapest to broadest:

1. syntax, formatting, types, static contracts, and diff checks;
2. tests directly mapped to changed behavior or files;
3. affected package, module, or service tests and builds;
4. full validation only when dependency propagation, risk, repository rules, or a delivery gate requires it.

Prefer repository-native commands, mappings, and caches. When impact cannot be established reliably, use the upstream command or established aggregate check instead of guessing a narrower set.

## Keep failures local

Block only work depending on a failed result. Find the earliest failing stage, repair the smallest affected branch, and rerun invalidated checks. Expand the rerun only when shared foundations, dependency propagation, or a required gate changed.

Do not repeat an unchanged failed command without a new hypothesis. Preserve independent valid results whose input identity still matches. Return newly exposed architecture or requirement questions upstream; fall back sequentially when only an acceleration capability failed.

## Report evidence

Lead with the completed result. Briefly report execution mode, completed approved work, required and extra validation, failures or fallbacks, and remaining verified limitations. Include elapsed time, command counts, or token use only when available.

Claim a numeric speedup only from a same-condition baseline. Otherwise describe removed waits or duplicate work without inventing a percentage.
~~~

- [ ] **Step 4: Synchronize the final description**

Copy the exact frontmatter description into .scaffold/state.json skill.description, package.json description, and package-lock.json packages[""].description. Do not change initial_files.

- [ ] **Step 5: Run checks and commit**

~~~powershell
node --test tests/accelerator-skill.test.js
npm run check
git diff --check
git add SKILL.md .scaffold/state.json package.json package-lock.json tests/accelerator-skill.test.js
git diff --cached --check
git commit -m "feat: define adaptive execution acceleration"
~~~

Expected: all checks exit 0.

---

### Task 4: Run initial paired behavior evaluation and user review

**Files:**
- Create outside repository: ../development-execution-accelerator-workspace/iteration-1/
- Create: evals/results/EVAL-001.txt
- Create: evals/results/EVAL-002.txt
- Create: evals/results/EVAL-003.txt
- Modify: evals/evals.json
- Modify when evidence requires: SKILL.md and synchronized metadata

**Interfaces:**
- Consumes: final workflow and EVAL-001 through EVAL-003
- Produces: paired outputs, timing, grading, benchmark, standard review page, and evidence

- [ ] **Step 1: Create isolated fixtures outside the repository**

Create the no-dependency Node fixture below and copy it separately into each with_skill and without_skill run directory.

package.json:

~~~json
{
  "name": "accelerator-eval-fixture",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "test:alpha": "node --test test/alpha.test.js",
    "test:beta": "node --test test/beta.test.js",
    "test:value": "node --test test/value.test.js"
  }
}
~~~

src/alpha.js:

~~~javascript
export function normalizeAlpha(value) {
  return String(value).trim();
}
~~~

src/beta.js:

~~~javascript
export function normalizeBeta(value) {
  return Number(value);
}
~~~

src/value.js:

~~~javascript
export function doubleValue(value) {
  return Number(value);
}
~~~

test/alpha.test.js:

~~~javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { normalizeAlpha } from '../src/alpha.js';

test('normalizes alpha text', async () => {
  await delay(1200);
  assert.equal(normalizeAlpha('  Ab c  '), 'AB C');
});
~~~

test/beta.test.js:

~~~javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { normalizeBeta } from '../src/beta.js';

test('normalizes beta numbers', async () => {
  await delay(1200);
  assert.equal(normalizeBeta('7.9'), 7);
  assert.equal(normalizeBeta(-4), 0);
  assert.equal(normalizeBeta('not-a-number'), 0);
});
~~~

test/value.test.js:

~~~javascript
import assert from 'node:assert/strict';
import test from 'node:test';

import { doubleValue } from '../src/value.js';

test('doubles finite values', () => {
  assert.equal(doubleValue('4'), 8);
  assert.throws(() => doubleValue(Number.POSITIVE_INFINITY), TypeError);
});
~~~

Use:

~~~text
../development-execution-accelerator-workspace/iteration-1/
  EVAL-001-parallel-independent-work/
    eval_metadata.json
    with_skill/run-1/outputs/
    without_skill/run-1/outputs/
  EVAL-002-planning-boundary/
    eval_metadata.json
    with_skill/run-1/outputs/
    without_skill/run-1/outputs/
  EVAL-003-capability-fallback/
    eval_metadata.json
    with_skill/run-1/outputs/
    without_skill/run-1/outputs/
~~~

- [ ] **Step 2: Start paired runs under identical conditions**

For with_skill, tell an isolated evaluator to read SKILL.md and execute the prompt in its private fixture. For without_skill, use the same model, prompt, fixture, and output requirements without exposing SKILL.md. Launch both members before waiting. With four collaboration slots, run one pair at a time and leave the root slot free.

Record started_at before dispatch and completed_at immediately after each result. Save timing.json with duration_ms, total_duration_seconds, and total_tokens when exposed. If token counts are unavailable, store null and omit token deltas; never substitute zero.

- [ ] **Step 3: Grade objective assertions**

Check fixture contents and run npm test inside every code-producing run. Save grading.json under each run with fields text, passed, and evidence. For the negative case, verify no files changed. Any failed assertion fails the run.

- [ ] **Step 4: Aggregate and generate the standard review page**

Locate the installed evaluation-capable Skill Creator from the active skills catalog. Use its scripts.aggregate_benchmark and eval-viewer/generate_review.py; do not create a custom viewer. Generate benchmark.json, benchmark.md, and review.html under iteration-1. Use static viewer output in headless execution. Present review.html and pause for user feedback.

- [ ] **Step 5: Apply evidence-based corrections with a bounded loop**

Revise only rules explaining failed assertions, architecture leakage, write conflicts, missing validation, or measured overhead. Synchronize description metadata when description changes. Run affected pairs in iteration-2 and use iteration-1 as previous workspace. Stop when correctness passes and the user accepts outputs, or after three iterations. After three unsuccessful iterations mark the requirement blocked rather than claiming maturity.

- [ ] **Step 6: Write compact repository evidence**

Each EVAL-00X.txt records ID, date, Skill commit, baseline and with-Skill run IDs, assertion outcomes, median elapsed time when measured, observed behavior, and the relative sibling-workspace path. Exclude absolute paths and private configuration.

Compute each result SHA-256 with Get-FileHash, lowercase the returned hash, concatenate it after artifact:evals/results/EVAL-00X.txt#sha256:, and set the matching result to pass only when every assertion passes.

- [ ] **Step 7: Commit accepted evidence**

~~~powershell
npm run check
git add SKILL.md .scaffold/state.json package.json package-lock.json evals/evals.json evals/results
git diff --cached --check
git commit -m "test: verify accelerator behavior"
~~~

Do not add the sibling evaluation workspace.

---

### Task 5: Expand trigger, fast-path, validation-floor, and compatibility evidence

**Files:**
- Modify: evals/evals.json
- Create: evals/results/EVAL-004.txt
- Create: evals/results/EVAL-005.txt
- Create: evals/results/EVAL-006.txt
- Create: evals/results/EVAL-007.txt
- Create: evals/results/EVAL-008.txt
- Create: evals/results/prompt-budget.txt
- Create: evals/results/capability-protocol.txt
- Modify when evidence requires: SKILL.md and synchronized metadata
- Modify: docs/skill-brief.md

**Interfaces:**
- Consumes: accepted initial evaluation
- Produces: implicit selection, small-task overhead, validation-floor, negative selection, budget, and protocol evidence

- [ ] **Step 1: Add five discriminating evaluations**

Append these exact objects to evals/evals.json; every initial result is not-run with empty evidence:

~~~json
{
  "id": "EVAL-004",
  "category": "positive",
  "prompt": "Fix the existing one-file value bug in this isolated Node project. doubleValue(value) in src/value.js must return twice a finite numeric input and throw TypeError for non-finite input. Run npm run test:value and the repository-required npm test command, then report the result.",
  "assertions": [
    {
      "id": "ASSERT-001",
      "text": "The fix uses the fast path and does not dispatch a worker or create persistent execution state."
    },
    {
      "id": "ASSERT-002",
      "text": "The targeted value test and required full test both pass."
    },
    {
      "id": "ASSERT-003",
      "text": "Median overhead stays within both the 15 percent and 3 second limits."
    }
  ],
  "result": {
    "status": "not-run",
    "evidence": ""
  }
}
~~~

~~~json
{
  "id": "EVAL-005",
  "category": "boundary",
  "prompt": "Execute the approved alpha-only fix in this isolated Node project. Change normalizeAlpha(value) in src/alpha.js to trim and uppercase text. The upstream validation floor explicitly requires npm run test:alpha followed by npm test. Preserve both commands, do not run either command twice for the same input identity, and do not modify beta or value files.",
  "assertions": [
    {
      "id": "ASSERT-001",
      "text": "Both required commands run and pass in the required order."
    },
    {
      "id": "ASSERT-002",
      "text": "No identical validation command is repeated for the same input identity."
    },
    {
      "id": "ASSERT-003",
      "text": "Only the approved alpha conflict domain changes."
    }
  ],
  "result": {
    "status": "not-run",
    "evidence": ""
  }
}
~~~

~~~json
{
  "id": "EVAL-006",
  "category": "negative",
  "prompt": "Explain what normalizeBeta currently does and identify its input and return value. Do not edit files, run project commands, create execution state, or propose a new architecture.",
  "assertions": [
    {
      "id": "ASSERT-001",
      "text": "The response explains the current function without starting an execution ledger, worker, background command, or validation chain."
    },
    {
      "id": "ASSERT-002",
      "text": "No repository file changes."
    }
  ],
  "result": {
    "status": "not-run",
    "evidence": ""
  }
}
~~~

~~~json
{
  "id": "EVAL-007",
  "category": "boundary",
  "prompt": "Continue this approved isolated-project execution after alpha implementation and npm run test:alpha already passed for the recorded input identity. Run npm run test:beta, diagnose its expected failure, fix only normalizeBeta in src/beta.js to return 0 for non-finite input and otherwise Math.max(0, Math.trunc(number)), rerun npm run test:beta, then run the required npm test gate. Preserve the still-valid alpha result and do not rerun npm run test:alpha before the full gate.",
  "assertions": [
    {
      "id": "ASSERT-001",
      "text": "The failed beta branch is repaired and its targeted check is rerun."
    },
    {
      "id": "ASSERT-002",
      "text": "The valid alpha targeted result is preserved and not repeated before the required full gate."
    },
    {
      "id": "ASSERT-003",
      "text": "The required full test passes after the local repair."
    }
  ],
  "result": {
    "status": "not-run",
    "evidence": ""
  }
}
~~~

~~~json
{
  "id": "EVAL-008",
  "category": "positive",
  "prompt": "Execute this approved isolated-project sequence in an Agent environment that supports background commands. Fix normalizeAlpha in src/alpha.js to trim and uppercase text, start npm run test:alpha, and while that command is still running create notes/execution.txt containing the single line validation in progress because that note does not depend on the test result. Then wait for the targeted test and run the required npm test gate. Do not run either validation command twice.",
  "assertions": [
    {
      "id": "ASSERT-001",
      "text": "The independent note write overlaps the background targeted test rather than waiting for it first."
    },
    {
      "id": "ASSERT-002",
      "text": "The targeted test and required full gate pass exactly once for their input identities."
    },
    {
      "id": "ASSERT-003",
      "text": "The note contains exactly the approved line and no unrelated files change."
    }
  ],
  "result": {
    "status": "not-run",
    "evidence": ""
  }
}
~~~

- [ ] **Step 2: Run paired samples and enforce efficiency gates**

Use Task 4 isolation. For EVAL-007, prepare alpha.js with the accepted implementation and record a passing npm run test:alpha result before dispatch; leave beta.js in its failing base state. Take one timing sample first. When configurations differ by less than 20% or either repeat differs by more than 10%, collect three samples for both and compare medians.

Fail REQ-002 when fast-path median exceeds either 115% of baseline or baseline plus 3 seconds. Fail REQ-003 when parallel median is not at least 20% lower than baseline. Faster timing never offsets correctness failure.

- [ ] **Step 3: Verify implicit selection independently**

Give an independent evaluator only the final name and description, realistic execution and near-miss prompts, and an instruction to select applicable Skills. Cover coding, fix, refactor, migration, test, configuration, repository documentation, planning-only, architecture-only, pure explanation, and status-query prompts. Save queries, selections, and outcomes in EVAL-004.txt and EVAL-006.txt without revealing intended answers during selection.

- [ ] **Step 4: Record platform-neutral capability evidence**

Create capability-protocol.txt summarizing the worker-capable path from EVAL-001, capability-limited path from EVAL-003, background wait-overlap path from EVAL-008, and one-writer evidence. State that this validates a platform-neutral protocol and does not establish named-Agent support.

Set multi-agent to enabled only after this artifact exists and referenced assertions pass. Use its SHA-256 artifact reference.

- [ ] **Step 5: Measure prompt budget conservatively**

Create prompt-budget.txt with UTF-8 bytes, Unicode characters, line count, and conservative token upper bound ceil(characters / 2) for description plus SKILL.md. Limit is 2500. If exceeded, remove repeated guidance without deleting safety or validation invariants and rerun static and affected behavior tests.

- [ ] **Step 6: Resolve implicit-trigger track**

Set implicit-trigger to enabled only when selection passes all execution positives and both near-miss negatives. Point evidence to accepted EVAL-004.txt. After three evidence-based description iterations without passing, keep it blocked and do not set Brief ready.

- [ ] **Step 7: Commit expanded evidence**

~~~powershell
npm run check
git add SKILL.md .scaffold/state.json package.json package-lock.json evals/evals.json evals/results docs/skill-brief.md
git diff --cached --check
git commit -m "test: prove accelerator efficiency and routing"
~~~

---

### Task 6: Write documentation and close Evidence Contract v1

**Files:**
- Modify: README.md
- Modify: docs/skill-brief.md
- Modify: docs/delivery-report.md
- Modify: .scaffold/state.json
- Modify: tests/accelerator-skill.test.js

**Interfaces:**
- Consumes: passing evidence and final Skill bytes
- Produces: ready state, closed requirements, capability claims, and local-use documentation

- [ ] **Step 1: Extend README tests before editing**

Add this constant beside the existing path constants:

~~~javascript
const readmePath = new URL('../README.md', import.meta.url);
~~~

Append this test:

~~~javascript
test('README documents the real local lifecycle without invented commands', async () => {
  const readme = await readFile(readmePath, 'utf8');
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
});
~~~

Run the focused test. Expected: FAIL against generated README.

- [ ] **Step 2: Rewrite README in user-task order**

First screen states that the Skill accelerates already-decided work and does not plan architecture. Node.js 22+ is required only for repository validation; runtime Skill is Markdown-only. Install by creating an Agent-recognized folder named development-execution-accelerator and copying SKILL.md into it, or by using the Agent's local-directory Skill entry. Named-Agent support is not claimed without live evidence.

Show an ordinary bug-fix example without naming the Skill. Explain fast, parallel, wait-overlap, precise validation, and sequential fallback. Document npm run check, npm run gate:delivery, removal by deleting the copied Skill directory, and absence of installer, global configuration changes, and releases.

- [ ] **Step 3: Mark criteria and tracks from evidence**

Set each REQ to pass only when its listed evidence passes. Set Brief ready only when all six pass, implicit-trigger and multi-agent are enabled with hashes, five optional tracks remain disabled with reasons, and no conflict is open.

Set prompt budget limit 2500, measured conservative upper bound, and prompt-budget.txt artifact hash.

- [ ] **Step 4: Fill delivery report**

Map REQ-001 to EVAL-001,EVAL-002,EVAL-004,EVAL-006; REQ-002 to EVAL-004; REQ-003 to EVAL-001,EVAL-008; REQ-004 to EVAL-005,EVAL-007,EVAL-008; REQ-005 to EVAL-003; and REQ-006 to EVAL-001,EVAL-003,EVAL-008. Every implementation reference is path:SKILL.md. Add capability claims only for enabled implicit-trigger and multi-agent tracks, using EVAL-004.txt and capability-protocol.txt hashes. Do not add named-Agent claims.

- [ ] **Step 5: Mark state ready without rewriting digests**

Change only .scaffold/state.json status from draft to ready. Confirm name, description, and license match package files and SKILL.md.

- [ ] **Step 6: Run tests and commit**

~~~powershell
node --test tests/accelerator-skill.test.js
npm run check
git diff --check
git add README.md docs/skill-brief.md docs/delivery-report.md .scaffold/state.json tests/accelerator-skill.test.js
git diff --cached --check
git commit -m "docs: complete accelerator delivery evidence"
~~~

Expected: all checks exit 0 and user-facing files contain no unfinished scaffold language.

---

### Task 7: Perform independent review, safety checks, and delivery gates

**Files:**
- Modify only for in-scope review findings: Skill, metadata, tests, evaluations, or delivery documents
- Inspect: full diff and all untracked delivery files

**Interfaces:**
- Consumes: ready contracts and implementation history
- Produces: independently reviewed local delivery with passing deterministic and evidence gates

- [ ] **Step 1: Validate with Skill Creator and scaffold**

~~~powershell
$creatorRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex\skills\.system\skill-creator'
python (Join-Path $creatorRoot 'scripts\quick_validate.py') .
npm run check
npm run gate:delivery
~~~

Expected: exit 0. If python is unavailable, use the bundled workspace Python path and rerun the same validator.

- [ ] **Step 2: Run safety and repository audits**

~~~powershell
npm run audit
git diff --check
git status --short --branch
git ls-files -co --exclude-standard | rg -n "(^|/)(\.env|.*\.(pem|key|p12|pfx)|credentials|secrets|logs?)(/|$)"
~~~

Expected: audit passes and filename scan has no unexplained sensitive files. Do not run publication commands because release is disabled.

- [ ] **Step 3: Request independent scope and behavior review**

Give a fresh reviewer only the approved spec, this plan, SKILL.md, contracts, evaluation summaries, benchmark, and full diff. Request findings for architecture leakage, trigger overreach, skipped validation, unsafe concurrency, small-task overhead, false compatibility claims, evidence mismatch, and missing tests.

Fix every high- or medium-severity in-scope finding, rerun affected tests and evaluations, refresh hashes, and rerun full gates. Record accepted low-severity limitations in delivery report.

- [ ] **Step 4: Complete two-stage code-comment review**

Inspect full diff and untracked delivery files under SCOPED policy. Confirm non-obvious concurrency, recovery, ownership, or compatibility logic in JavaScript tests has concise simplified-Chinese maintenance comments where naming is insufficient. Remove redundant or inaccurate comments. Documentation prose receives no code comments.

- [ ] **Step 5: Commit review corrections and verify clean state**

When review changes files:

~~~powershell
git add SKILL.md .scaffold/state.json package.json package-lock.json README.md docs evals tests
git diff --cached --check
git commit -m "fix: address accelerator delivery review"
~~~

Then run:

~~~powershell
npm run check
npm run gate:delivery
git status --short --branch
git log -8 --oneline --decorate
~~~

Expected: both gates pass, worktree is clean, and the branch is only ahead of scaffold origin by local Skill commits.

## Execution Checkpoints

- After Task 3: review complete SKILL.md and deterministic tests.
- During Task 4: pause when the standard behavior review page is ready; resume after user feedback.
- After Task 5: report correctness, timing, fast-path overhead, trigger selection, and protocol compatibility.
- After Task 7: deliver repository path, commits, commands, compatibility scope, disabled tracks, and limitations.
