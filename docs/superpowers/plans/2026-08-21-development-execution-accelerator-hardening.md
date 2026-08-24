# Development Execution Accelerator Hardening Implementation Plan

> **2026-08-23 convergence:** Tasks 9–12 retain the lean Task 9 plan—an unchanged runtime `SKILL.md`, native-JSONL harness, and 11-process hard cap—under TDD without subagents, reviewers, or helpers. Local usable delivery requires current-content/package safety, repository checks and Validator, explicit installation authorization, and fresh-Agent smoke. The fixed 11-subject campaign and 20% paired-median threshold gate quantitative speed claims and mature certification only; the full Git-history audit gates public-release and history-clean claims only. Neither blocks local usable delivery. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver and globally install a platform-neutral Skill that measurably shortens already-decided long-running development work without changing task goals, business logic, architecture, scope, or required acceptance criteria.

**Architecture:** Keep `SKILL.md` as the only runtime payload and its current bytes unchanged. For Task 9 evidence, add a lean repository-only `codex exec --json` harness limited to fresh attempt directories, native output capture, and post-exit objective validation; three correctness-equivalent long pairs—not Agent self-report—decide the existing speed threshold.

**Tech Stack:** Agent Skills Markdown/YAML, Node.js 22+, ES modules, `node:test`, npm, Git, PowerShell, native Codex JSONL evidence, and SHA-256.

**Spec:** `docs/superpowers/specs/2026-08-21-development-execution-accelerator-hardening-design.md`

## Global Constraints

- Optimize only already-decided long-running development and verification; never decide architecture, requirements, scope, public interfaces, module boundaries, or project planning.
- Preserve task goals, business logic, allowed files, unrelated worktree changes, ordered required checks, and acceptance criteria.
- Treat correctness as a hard gate; skipped tests, weakened assertions, scope changes, or non-equivalent outputs invalidate timing.
- Require at least two medium, conflict-domain-independent implementation items before claiming worker parallelism; one conflict domain has exactly one writer.
- Do not use tiny expression edits, artificial `sleep`, evidence-file writes, or busy waiting to manufacture speedup.
- Keep runtime Markdown-only: the sole runtime payload is `SKILL.md`; repository evaluation scripts are not runtime resources.
- Keep the prompt hard limit at 2500 tokens and the mature conservative target at or below 2250 tokens.
- Run exactly one fresh fixed 11-subject campaign per accepted Skill version: one non-scoring multi-agent-disabled foreground pilot, three long pairs, one explicit short subject, one wait-overlap, one implicit positive, and one explicit-serial long near miss; never start a twelfth process.
- Compare the maturity threshold only with the no-Skill baseline; old draft bytes and superseded campaigns consume no lean-run slot.
- Keep the 20% median wall-clock reduction for REQ-003. Give REQ-002 no short baseline or timing claim; one explicit short subject proves zero probes/state. The explicit-serial long near miss and the non-scoring foreground pilot support REQ-005 and never enter performance statistics.
- Validate overlap and command order from native JSONL plus final outputs. Do not infer them from Agent prose.
- Use `chinese-code-comments` in `SCOPED` mode before code edits and review the complete diff and untracked delivery files before completion.
- Do not use subagents, reviewers, or helpers for this Task 9 setup round.
- Do not push, tag, create a Release, upload a package, use credentials, or make paid calls without new explicit authorization.

## File and Interface Map

| File | Responsibility |
| --- | --- |
| `SKILL.md` | Runtime-only long-task admission, parallel execution, wait-overlap, precise validation, fallback, and reporting protocol. |
| `src/delivery-gate.js` | Safe repository snapshot, artifact decoding, current-byte evidence validation, requirement/track maturity decisions. |
| `src/validate.js` | Evidence Contract shapes, editable-versus-immutable initialization state, package metadata validation. |
| `src/evaluation-controller.js` | Historical controller utility retained for deterministic repository tests; it is not the active campaign runner. |
| `src/evaluation-analysis.js` | Historical analysis utility retained for one-version bounded repository analysis; it is not the current evidence contract. |
| `scripts/evaluate-accelerator.js` | Repository-local legacy controller/analyzer CLI; completed publication tombstones are retained and may accumulate. |
| `src/lean-evaluation.js` | Fresh-attempt launch construction, native JSONL parsing, bounded allocation, and post-exit objective checks. |
| `scripts/run-lean-evaluation.js` | Thin CLI that invokes one configured lean attempt; tests inject the process launcher and never run a real subject. |
| `tests/lean-evaluation.test.js` | Launch envelope, discovery isolation, prompt identity, event order, zero-probe, overlap, freshness, and process-cap tests. |
| `tests/evaluation-controller.test.js` | Deterministic clock, trace ordering, lifecycle, and CLI tests. |
| `tests/evaluation-analysis.test.js` | Pair validity, stop rules, quality gates, median speed, overhead, worker, and overlap assertions. |
| `tests/delivery-gate.test.js` | Crash regression, artifact text, result-state, track hash, and blocked delivery diagnostics. |
| `tests/validate.test.js` | Contract schema, editable digest policy, immutable drift, and conditional blocked fields. |
| `tests/accelerator-skill.test.js` | Runtime text, metadata synchronization, long-only selection, zero-probe exit, prompt budget, and evaluation shape. |
| `evals/fixtures/long-task/` | Frozen dependency-free Node fixture with two medium independent algorithms, focused tests, aggregate gate, and real corpus verification. |
| `evals/formal-plan.json` | Explicit supersession marker that projects the fixed 11-subject lean allocation and points to the lean runner. |
| `evals/evals.json` | Current positive, negative, boundary, failure, short-task, parallel, validation-reuse, and wait-overlap contracts. |
| `evals/results/*.txt` | Human-readable result artifacts bound to raw evidence hashes and final Skill SHA-256. |
| `docs/skill-brief.md` | Current requirements, conflicts, track state, prompt budget, blockers, and evidence references. |
| `docs/delivery-report.md` | One implementation/verification trace per requirement plus explicit blocked reason fields until maturity. |
| `README.md` | Honest scope, archive/runtime distinction, local install/use/remove, current maturity, and validation commands. |

---

### Task 1: Correct Recorded Evaluation Truth

**Files:**

- Modify: `tests/accelerator-skill.test.js`
- Modify: `evals/evals.json`
- Modify: `evals/results/EVAL-008.txt`
- Modify: `docs/skill-brief.md`
- Modify: `docs/delivery-report.md`

**Interfaces:**

- Consumes: existing Evidence Contract v1 result shape `{ status, evidence }`.
- Produces: EVAL-008 `fail` evidence with an exact repository-relative artifact digest; REQ-001/002 pending-or-blocked truth and REQ-003/004/006 blocked truth.

- [ ] **Step 1: Add a failing truth-regression test**

Add this test to `tests/accelerator-skill.test.js` and import `createHash` plus `path` helpers if not already present:

```js
test('recorded attempts and superseded timing remain non-passing', async () => {
  const evals = JSON.parse(await readFile(evalsPath, 'utf8'));
  const waitOverlap = evals.evals.find(({ id }) => id === 'EVAL-008');
  assert.equal(waitOverlap.result.status, 'fail');
  const match = /^artifact:([^#]+)#sha256:([a-f0-9]{64})$/u.exec(waitOverlap.result.evidence);
  assert.ok(match);
  const artifact = await readFile(new URL(`../${match[1]}`, import.meta.url));
  assert.equal(createHash('sha256').update(artifact).digest('hex'), match[2]);

  const brief = markedJson(
    await readFile(briefPath, 'utf8'),
    '<!-- scaffold-contract:skill-brief:v1 -->',
  );
  assert.equal(brief.acceptance_criteria.find(({ id }) => id === 'REQ-001').status, 'pending');
  assert.equal(brief.acceptance_criteria.find(({ id }) => id === 'REQ-002').status, 'pending');
  for (const id of ['REQ-003', 'REQ-004', 'REQ-006']) {
    assert.equal(brief.acceptance_criteria.find((item) => item.id === id).status, 'blocked');
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test --test-name-pattern="recorded attempts" tests/accelerator-skill.test.js
```

Expected: FAIL because EVAL-008 is still `not-run` with empty evidence.

- [ ] **Step 3: Record the three failed attempts honestly**

Change the artifact heading and disposition to `Outcome: FAIL (ASSERT-001 failed in 3/3 attempts)`. Preserve all three controller timestamps and explain that passing correctness assertions cannot offset failed overlap. Change EVAL-008 to `status: "fail"`; its evidence must start with `artifact:evals/results/EVAL-008.txt#sha256:` and end with the exact digest computed below.

Compute the byte digest after the artifact edit:

```powershell
(Get-FileHash -Algorithm SHA256 'evals\results\EVAL-008.txt').Hash.ToLowerInvariant()
```

Insert that exact output in `evals/evals.json` with `apply_patch`. Keep REQ-002 pending and REQ-003/004/006 blocked; update prose that still calls the failed attempts `not-run` or accepted.

- [ ] **Step 4: Run focused contract checks**

Run:

```powershell
node --test tests/accelerator-skill.test.js
npm run validate
```

Expected: PASS; Validator may still emit the eight known digest warnings, and no contract error is allowed.

- [ ] **Step 5: Commit the truth correction**

```powershell
git add tests/accelerator-skill.test.js evals/evals.json evals/results/EVAL-008.txt docs/skill-brief.md docs/delivery-report.md
git commit -m "docs: record failed overlap evaluation truth"
```

---

### Task 2: Make Artifact Evaluation Total and Encoding-Safe

**Files:**

- Modify: `src/delivery-gate.js:400-668`
- Modify: `tests/delivery-gate.test.js`

**Interfaces:**

- Produces: private `decodeArtifactText(bytes)` returning normalized LF text or throwing a typed text error.
- Changes: `verifyArtifactEvidence(...)` returns `{ relativePath, bytes }` on success and `null` on failure instead of a Boolean.
- Guarantees: `evaluateDelivery(root)` always resolves to `{ errors, warnings, evidence }` for malformed repository inputs.

- [ ] **Step 1: Add crash and result-state regression tests**

Add table-driven tests that copy the complete fixture, replace a passing artifact with each byte form, refresh its evidence SHA-256, and call `evaluateDelivery(root)`:

```js
for (const [name, transform, expectedCode] of [
  ['CRLF', (text) => Buffer.from(text.replaceAll('\n', '\r\n')), null],
  ['BOM', (text) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]), null],
  ['NUL', (text) => Buffer.from(`${text}\0`), 'GATE_EVAL_ARTIFACT_TEXT_INVALID'],
  ['invalid UTF-8', () => Buffer.from([0xc3, 0x28]), 'GATE_EVAL_ARTIFACT_TEXT_INVALID'],
]) {
  test(`evaluation artifact handles ${name} without throwing`, async () => {
    const root = await copyFixture();
    const relativePath = 'evals/results/EVAL-001.txt';
    const target = path.join(root, ...relativePath.split('/'));
    const bytes = transform(await readFile(target, 'utf8'));
    await writeFile(target, bytes);
    const evals = await readJson(root, 'evals/evals.json');
    evals.evals[0].result.evidence = await artifactEvidence(root, relativePath);
    await writeJson(root, 'evals/evals.json', evals);
    const report = await evaluateDelivery(root);
    assert.ok(report && Array.isArray(report.errors));
    assert.equal(issueCodes(report).has('DELIVERY_GATE_FAILED'), false);
    assert.equal(issueCodes(report).has('GATE_EVAL_ARTIFACT_TEXT_INVALID'), expectedCode !== null);
  });
}
```

Add separate cases proving `not-run` requires empty evidence, `fail` requires valid artifact evidence but remains `GATE_EVAL_NOT_PASS`, and a digest-valid text artifact missing the Skill digest returns `GATE_EVAL_SKILL_DIGEST_MISSING` without a `TypeError`.

Add a table of arbitrary roots—empty directory, regular file used as root, malformed contracts, missing evidence files, and unsafe artifact path—and assert every call resolves to sorted `{ errors, warnings, evidence }` arrays instead of rejecting its Promise.

- [ ] **Step 2: Run focused Gate tests and verify RED**

```powershell
node --test --test-name-pattern="artifact handles|result state|Skill digest" tests/delivery-gate.test.js
```

Expected: at least NUL/invalid bytes expose the missing stable diagnostic and the existing null-capture path fails.

- [ ] **Step 3: Implement strict artifact decoding and explicit branches**

Use this shape inside `src/delivery-gate.js`:

```js
class ArtifactTextError extends Error {}

function decodeArtifactText(bytes) {
  const withoutBom = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
    ? bytes.subarray(3)
    : bytes;
  let source;
  try {
    source = UTF8_DECODER.decode(withoutBom);
  } catch {
    throw new ArtifactTextError('artifact must be valid UTF-8 text');
  }
  if (source.includes('\0')) {
    throw new ArtifactTextError('artifact text must not contain NUL');
  }
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
```

Return `{ relativePath, bytes }` from `verifyArtifactEvidence`. In `validateEvaluations`, skip artifact verification only for `not-run`; verify `fail` and `pass`; decode only a verified pass artifact. Use an explicit `if (evaluated === null) ... else if (...) ...` chain so no capture group is read after a failed match. Map `ArtifactTextError` to `GATE_EVAL_ARTIFACT_TEXT_INVALID`.

- [ ] **Step 4: Run focused and full Gate tests**

```powershell
node --test tests/delivery-gate.test.js
npm run check
```

Expected: all tests pass, no unhandled exception, and the existing eight drift warnings remain the only known warnings.

- [ ] **Step 5: Commit the total Gate behavior**

```powershell
git add src/delivery-gate.js tests/delivery-gate.test.js
git commit -m "fix: make evaluation artifact checks total"
```

---

### Task 3: Enforce Current-Byte Blockers and Explicit Delivery Reasons

**Files:**

- Modify: `src/validate.js:401-547`
- Modify: `src/delivery-gate.js:47-52,481-530,755-856`
- Modify: `tests/validate.test.js`
- Modify: `tests/delivery-gate.test.js`
- Modify: `templates/project/skill-brief.md.template`
- Modify: `templates/project/delivery-report.md.template`
- Modify: `tests/fixtures/complete-skill/docs/skill-brief.md`
- Modify: `tests/fixtures/complete-skill/docs/delivery-report.md`
- Modify: `docs/skill-brief.md`
- Modify: `docs/delivery-report.md`

**Interfaces:**

- Blocked track evidence matches `^required:([^;\r\n]+);impact:([^;\r\n]+);skill-sha256:([a-f0-9]{64})$`.
- Blocked delivery requirement: exact keys `id`, `implementation`, `verification`, `status`, `blocker`, `unblock_condition`.
- Passing delivery requirement: existing four keys only; blocker fields are forbidden.

- [ ] **Step 1: Add failing Validator contract tests**

Add cases equivalent to:

```js
test('blocked tracks bind current Skill bytes', async (t) => {
  const root = await createInitializedFixture();
  const brief = briefContract();
  brief.tracks.multi-agent = {
    status: 'blocked',
    evidence: `required:Obtain worker trace.;impact:Parallelism remains unproven.;skill-sha256:${'a'.repeat(64)}`,
    unblock_condition: 'Attach a passing current-byte worker artifact.',
  };
  await writeContract(root, 'docs/skill-brief.md', CONTRACTS.brief.marker, brief);
  assert.ok(issueCodes((await validateRepository(root)).errors).has('BRIEF_CONTRACT_INVALID'));
});

test('blocked delivery requirements require reason and release condition', async () => {
  const root = await createInitializedFixture();
  const delivery = deliveryContract();
  delivery.requirements[0] = {
    ...delivery.requirements[0],
    status: 'blocked',
    blocker: 'Current-byte benchmark is not complete.',
    unblock_condition: 'Attach three valid passing pairs.',
  };
  await writeContract(root, 'docs/delivery-report.md', CONTRACTS.delivery.marker, delivery);
  assert.equal(issueCodes((await validateRepository(root)).errors).has('DELIVERY_CONTRACT_INVALID'), false);
});
```

Also reject missing fields, empty fields, blocker fields on `pass`, malformed hashes, and hashes that are syntactically valid but differ from current `SKILL.md` in the Gate.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --test --test-name-pattern="blocked tracks|blocked delivery" tests/validate.test.js tests/delivery-gate.test.js
```

Expected: FAIL because the existing schemas accept neither the hash suffix nor conditional delivery fields.

- [ ] **Step 3: Implement exact conditional schemas**

Set:

```js
const BLOCKED_EVIDENCE_PATTERN = /^required:([^;\r\n]+);impact:([^;\r\n]+);skill-sha256:([a-f0-9]{64})$/u;
```

In `validateDelivery`, choose exact keys from `requirement.status`:

```js
const keys = requirement.status === 'blocked'
  ? ['id', 'implementation', 'verification', 'status', 'blocker', 'unblock_condition']
  : ['id', 'implementation', 'verification', 'status'];
```

Require trimmed non-empty `blocker` and `unblock_condition` only for blocked entries. In the Gate, compute current Skill SHA-256 once and compare it with the third blocked-track capture. For enabled track artifact evidence, accept a `SKILL.md` artifact only when the evidence digest equals the computed current digest; for other text artifacts, require the `Skill SHA-256 evaluated:` line to contain that same computed digest.

- [ ] **Step 4: Update templates and current contracts**

Update template prose to document the exact blocked evidence suffix and conditional delivery fields. Add the current Skill SHA-256 to every actual blocked track (`implicit-trigger`, `multi-agent`) and add concrete blocker/unblock fields to every blocked delivery requirement. Update the complete fixture's blocked release track with its fixture Skill digest.

- [ ] **Step 5: Run contract and Gate suites**

```powershell
node --test tests/validate.test.js tests/delivery-gate.test.js tests/templates.test.js
npm run check
```

Expected: PASS with no new diagnostics.

- [ ] **Step 6: Commit current-byte blocker contracts**

```powershell
git add src/validate.js src/delivery-gate.js tests/validate.test.js tests/delivery-gate.test.js tests/fixtures/complete-skill templates/project docs/skill-brief.md docs/delivery-report.md
git commit -m "feat: bind blocked delivery evidence to current bytes"
```

---

### Task 4: Remove Expected Digest Noise and Fix Archive Semantics

**Files:**

- Modify: `src/validate.js:64-74,920-943`
- Modify: `tests/validate.test.js:745-760`
- Modify: `tests/accelerator-skill.test.js`
- Modify: `tests/audit.test.js`
- Modify: `README.md`

**Interfaces:**

- Produces: `MUTABLE_INITIALIZED_FILES`, a closed set of initialized deliverables validated semantically rather than by original digest.
- Keeps: byte drift reporting for immutable `LICENSE`; missing/unsafe paths and invalid state remain errors.
- Proves: npm archive files are exactly `LICENSE`, `README.md`, `SKILL.md`, and `package.json`, while `package.json#files` remains `['SKILL.md']`.

- [ ] **Step 1: Replace the drift test with mutable and immutable cases**

Use this expectation:

```js
test('ignores expected edits but reports immutable license drift', async () => {
  const root = await createInitializedFixture();
  await writeFile(path.join(root, 'SKILL.md'), '---\nname: "example-skill"\ndescription: "Changed valid description."\n---\n');
  let report = await validateRepository(root);
  assert.equal(report.warnings.some(({ code }) => code === 'STATE_DIGEST_DRIFT'), false);

  await writeFile(path.join(root, 'LICENSE'), 'changed license\n');
  report = await validateRepository(root);
  assert.ok(report.warnings.some(({ code, path: issuePath }) => (
    code === 'STATE_DIGEST_DRIFT' && issuePath === 'LICENSE'
  )));
});
```

Keep the fixture metadata synchronized so the first assertion tests digest policy rather than frontmatter mismatch.

- [ ] **Step 2: Add a real npm dry-run archive test**

In `tests/accelerator-skill.test.js`, invoke npm through `process.execPath` and `process.env.npm_execpath`:

```js
const result = spawnSync(process.execPath, [
  process.env.npm_execpath,
  'pack', '--dry-run', '--json', '--ignore-scripts',
], { cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true });
assert.equal(result.status, 0, result.stderr);
const files = JSON.parse(result.stdout)[0].files.map(({ path: file }) => file).sort();
assert.deepEqual(files, ['LICENSE', 'README.md', 'SKILL.md', 'package.json']);
```

- [ ] **Step 3: Run tests and verify RED**

```powershell
node --test --test-name-pattern="expected edits|npm dry-run" tests/validate.test.js tests/accelerator-skill.test.js
```

Expected: mutable edits still emit drift and README/package language is not yet exact.

- [ ] **Step 4: Implement the closed mutable set**

Add:

```js
const MUTABLE_INITIALIZED_FILES = new Set([
  'README.md',
  'SKILL.md',
  'docs/decisions.md',
  'docs/delivery-report.md',
  'docs/skill-brief.md',
  'evals/evals.json',
  'package-lock.json',
  'package.json',
]);
```

Skip only digest warnings for members of that set. Continue reading every initial file and preserve all semantic validation. Do not rewrite `.scaffold/state.json#initial_files`.

- [ ] **Step 5: Correct README and audit assertions**

State that `SKILL.md` is the only runtime payload and that npm's actual archive contains four files. Retain the audit whitelist and add an assertion that any fifth archive entry remains forbidden.

- [ ] **Step 6: Run full checks and verify the eight warnings are gone**

```powershell
npm run check
npm run audit
npm pack --dry-run --json --ignore-scripts
```

Expected: all commands pass; `npm run validate` emits no `STATE_DIGEST_DRIFT` for normal project edits; archive list is exactly four files.

- [ ] **Step 7: Commit state and archive semantics**

```powershell
git add src/validate.js tests/validate.test.js tests/accelerator-skill.test.js tests/audit.test.js README.md
git commit -m "fix: distinguish runtime payload from package archive"
```

---

### Task 5: Rewrite the Runtime Skill for Long Tasks Only

**Files:**

- Modify: `tests/accelerator-skill.test.js`
- Modify: `SKILL.md`
- Modify: `.scaffold/state.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `docs/skill-brief.md`

**Interfaces:**

- Metadata description must be identical in `SKILL.md`, state, package, lock, and README selection explanation.
- Runtime headings: admission, upstream contract, path selection, precise validation, local failure, evidence report.
- Conservative bound: `Math.ceil([...description + skill].length / 2) <= 2250`.

- [ ] **Step 1: Replace old all-task assertions with long-only contract tests**

Test the exact synchronized description:

```js
const description = 'Accelerate already-decided long-running software-development implementation and verification. Use automatically for substantial multi-step coding, fixes, refactors, tests, migrations, builds, or configuration work with independent workstreams, long validation waits, or reusable verification; exclude short single-path changes, architecture, requirements, scope, planning, read-only review, and explicit serial/no-parallel requests.';
```

Add assertions for all three admission routes, zero-probe rejection, two medium worker items, one writer, wait margin, no pre-action evidence/poll/wait, validation identity, one final gate, local invalidation, and truthful mode reporting. Change the budget assertion to 2250.

- [ ] **Step 2: Run Skill tests and verify RED**

```powershell
node --test tests/accelerator-skill.test.js
```

Expected: FAIL because current metadata selects every execution task and current body uses a short-task Fast path.

- [ ] **Step 3: Replace `SKILL.md` with the approved compact protocol**

Use this content as the implementation baseline, preserving JSON-quoted frontmatter strings:

```markdown
---
name: "development-execution-accelerator"
description: "Accelerate already-decided long-running software-development implementation and verification. Use automatically for substantial multi-step coding, fixes, refactors, tests, migrations, builds, or configuration work with independent workstreams, long validation waits, or reusable verification; exclude short single-path changes, architecture, requirements, scope, planning, read-only review, and explicit serial/no-parallel requests."
---

# Development Execution Accelerator

Optimize only the execution of decisions already made elsewhere. Never change the task goal, business logic, architecture, scope, boundaries, acceptance criteria, required checks, or unrelated worktree changes.

## Admit only long execution work

Use existing context once to check task shape. Enter the acceleration chain only when at least one condition holds:

- two medium implementation items are dependency- and conflict-domain-independent;
- a long command has approved independent work and enough remaining time beyond one tool round trip plus safety margin;
- a multi-stage long path can avoid material repeated validation through input-identity reuse or local failure recovery.

Tiny edits, artificial waits, evidence writing, and duplicate investigation do not create useful parallelism. If no condition holds, exit with zero worker, background, wait, or plan-state probes and create no execution state.

## Lock the upstream contract

Capture approved work, dependencies, allowed files and conflict domains, completion criteria, ordered required checks, and existing worktree changes. Use a conservative order when only scheduling is unclear. Return behavior, interface, boundary, scope, or acceptance gaps upstream; do not decide them here.

## Choose the cheapest useful path

Use sequential optimization for a long single critical path: keep context focused, validate precisely, and reuse still-valid results without ceremonial workers.

Use worker parallelism only for at least two medium independent implementation items when dispatch and integration cost is lower than expected savings. Give each worker its objective, allowed writes, dependencies, completion condition, and evidence. Keep one writer per file or upstream conflict domain; reduce concurrency on contention, conflict, flakes, or merge cost.

For wait overlap, prepare an approved independent action before starting the background command. After the session returns, confirm the command is still running and perform that action immediately. Do not organize evidence, poll, or wait first. If the command already ended, use its sequential result and claim no overlap. Never start dependent work before its result.

## Validate by input identity

Required validation is an immutable ordered floor. Bind a reusable result to normalized command, working directory, relevant changed/config/dependency identity, environment identity, outcome, and order. Consume one valid result per identical input.

Run extra checks from cheapest to broadest: static or diff checks, directly mapped tests, affected package tests/builds, then full validation only for propagation, risk, repository rules, or the required delivery gate. When impact is uncertain, use the existing aggregate command.

Run each branch's focused check after its implementation, then the required integrated gate once. A change invalidates only results whose inputs it affects; shared foundations, dependency/config changes, or gate inputs expand invalidation.

## Keep failures local

Block only dependents of a failure. Repair the earliest failing branch and rerun invalidated checks. Preserve independent passing results whose input identity still matches. Do not repeat an unchanged failure without a new hypothesis.

## Report only observed acceleration

All required checks must pass before completion. Report the result, actual mode (worker parallelism, wait overlap, or sequential optimization), work completed, required and extra validation, reused results, fallbacks, and limitations. Do not describe background validation as worker development or claim overlap after command completion. Claim a percentage only from a same-condition external baseline.
```

- [ ] **Step 4: Synchronize metadata without refreshing initialization digests**

Apply the description exactly to `.scaffold/state.json#skill.description`, `package.json#description`, and `package-lock.json#packages[""]#description`. Keep the Skill name and `initial_files` unchanged. Update README scope and Brief requirement prose but keep all changed behavior pending or blocked.

- [ ] **Step 5: Run focused tests and budget measurement**

```powershell
node --test tests/accelerator-skill.test.js
npm run validate
```

Expected: PASS; conservative prompt bound is at most 2250 and there are no drift warnings.

- [ ] **Step 6: Commit the runtime rewrite**

```powershell
git add SKILL.md .scaffold/state.json package.json package-lock.json README.md docs/skill-brief.md tests/accelerator-skill.test.js
git commit -m "feat: focus acceleration on long execution work"
```

---

### Task 6: Build the Representative Long-Task Fixture and Evaluation Contracts

**Files:**

- Create: `evals/fixtures/long-task/AGENTS.md`
- Create: `evals/fixtures/long-task/package.json`
- Create: `evals/fixtures/long-task/src/catalog/normalize-catalog.js`
- Create: `evals/fixtures/long-task/src/billing/allocate-invoice.js`
- Create: `evals/fixtures/long-task/test/catalog.test.js`
- Create: `evals/fixtures/long-task/test/billing.test.js`
- Create: `evals/fixtures/long-task/test/integration.test.js`
- Create: `evals/fixtures/long-task/scripts/verify-corpus.mjs`
- Create: `evals/fixtures/short-task/package.json`
- Create: `evals/fixtures/short-task/src/value.js`
- Create: `evals/fixtures/short-task/test/value.test.js`
- Create: `evals/fixtures/wait-overlap/package.json`
- Create: `evals/fixtures/wait-overlap/src/catalog/normalize-catalog.js`
- Create: `evals/fixtures/wait-overlap/src/billing/allocate-invoice.js`
- Create: `evals/fixtures/wait-overlap/src/reporting/format-summary.js`
- Create: `evals/fixtures/wait-overlap/test/reporting.test.js`
- Create: `evals/fixtures/wait-overlap/scripts/verify-corpus.mjs`
- Create: `evals/formal-plan.json`
- Modify: `evals/evals.json`
- Modify: `tests/accelerator-skill.test.js`

**Interfaces:**

- Catalog task: `normalizeCatalog(records) -> normalizedRecords` with SKU validation, duplicate merge, tag normalization, quantity sum, and stable SKU sort.
- Billing task: `allocateInvoice(totalCents, weights) -> integer cents[]` with largest-remainder allocation, stable tie order, and exact total.
- Commands: `npm run test:catalog`, `npm run test:billing`, `npm run verify:corpus`, and `npm test`.

- [ ] **Step 1: Add failing fixture-shape tests**

Assert that EVAL-001 names two disjoint conflict domains, each task has a focused command, the final gate appears once, EVAL-004 is the single explicitly loaded short zero-probe/state subject with no timing claim, EVAL-008 names a real corpus command, and no fixture file contains `sleep`, timer-based delay, or a note/evidence write as workload.

```js
assert.match(byId.get('EVAL-001').prompt, /src\/catalog.*src\/billing/isu);
assert.match(byId.get('EVAL-001').prompt, /npm run test:catalog.*npm run test:billing.*npm test/isu);
assert.match(byId.get('EVAL-004').assertions[0].text, /zero .* probes/iu);
assert.match(byId.get('EVAL-004').assertions[1].text, /no baseline.*wall-clock.*no performance claim/iu);
assert.match(byId.get('EVAL-008').prompt, /npm run verify:corpus/iu);
```

- [ ] **Step 2: Run the fixture-shape test and verify RED**

```powershell
node --test --test-name-pattern="fixture|behavior contracts" tests/accelerator-skill.test.js
```

Expected: FAIL because the current fixture is a tiny alpha/beta expression change.

- [ ] **Step 3: Create two deliberately incorrect starting implementations**

Use dependency-free stubs that make the focused tests fail for behavioral reasons:

```js
export function normalizeCatalog(records) {
  return records;
}
```

```js
export function allocateInvoice(totalCents, weights) {
  return weights.map(() => 0);
}
```

Catalog tests require trimmed uppercase SKUs, rejection of empty SKU/non-positive quantity, lowercased deduplicated sorted tags, duplicate quantity merge, and stable sort without input mutation. Billing tests require safe non-negative integer cents, positive finite weights, floor shares plus stable largest remainders, exact sum, and no input mutation.

- [ ] **Step 4: Add focused and aggregate commands**

Use this package contract:

```json
{
  "name": "accelerator-long-task-fixture",
  "private": true,
  "type": "module",
  "scripts": {
    "test:catalog": "node --test test/catalog.test.js",
    "test:billing": "node --test test/billing.test.js",
    "verify:corpus": "node scripts/verify-corpus.mjs",
    "test": "node --test test/catalog.test.js test/billing.test.js test/integration.test.js"
  }
}
```

`verify-corpus.mjs` must generate a fixed catalog/invoice corpus, validate results through the public functions, and calculate deterministic PBKDF2 integrity digests with fixed inputs. Use exactly 96 records at 350000 SHA-256 iterations, record the digest, and do not inspect elapsed time to decide when to stop. Pilot timing may reject the fixture if this real workload is too short; do not tune it after formal sampling begins.

Create `short-task` with one deliberately wrong `doubleValue(value) { return value; }` implementation and a focused test requiring finite inputs to double and non-finite inputs to throw `TypeError`.

Create `wait-overlap` with correct frozen catalog/billing implementations, the same deterministic corpus verification, and an independent reporting stub. `formatSummary(records, allocations)` must eventually return a stable object containing `sku_count`, `total_quantity`, `allocated_cents`, and sorted `skus`; its focused test is not an input to the already-running corpus command. This gives EVAL-008 approved implementation/test work that is meaningful and independent of the long verification input.

- [ ] **Step 5: Retire the controller plan when the lean contract supersedes it**

Historical note: the controller/analyzer plan below was replaced before any current-byte certification run. `evals/formal-plan.json` now carries only an explicit `superseded` marker plus the current lean projection: one non-scoring multi-agent-disabled EVAL-003 pilot; three EVAL-001 long with/without pairs in the fixed alternating order; one EVAL-004 explicit short with no baseline or wall-clock claim; one EVAL-008 wait overlap; one EVAL-011 implicit positive; and one EVAL-010 explicit-serial long near miss. The only performance threshold is the unchanged 20 percent median reduction across the three long pairs.

The former controller-plan shape is retained solely at `tests/fixtures/legacy-evaluation-plan.json` for deterministic tests of the repository-local legacy CLI. It is not an executable delivery or campaign contract. The active runner is `scripts/run-lean-evaluation.js`, whose allocation test enforces the 11-process hard cap and rejects a twelfth process.

The supersession marker has this public shape:

```json
{
  "schema_version": 2,
  "skill": "development-execution-accelerator",
  "status": "superseded",
  "replacement": {
    "runner": "scripts/run-lean-evaluation.js",
    "process_limit": 11,
    "long_pairs": {
      "eval_id": "EVAL-001",
      "count": 3,
      "variants": ["with_skill", "without_skill"],
      "median_speedup_percent": 20
    },
    "explicit_short": {
      "eval_id": "EVAL-004",
      "count": 1,
      "baseline": false,
      "wall_clock_claim": false
    }
  }
}
```

- [ ] **Step 6: Update the evaluation prompts and assertions**

EVAL-001 becomes the two-domain medium implementation case and requires real worker calls. EVAL-004 becomes only the explicitly loaded short zero-probe/state exit; EVAL-011 is the single implicit positive, while the existing planning/read-only/serial cases retain their negative boundaries. EVAL-005 and EVAL-007 keep ordered validation and local invalidation but use the new domains. EVAL-008 uses `verify:corpus` and an independent approved implementation/test action, not a note write.

Set changed eval results to `not-run` with empty evidence; keep Task 1's historical failed EVAL-008 artifact in its prose/history but do not bind it as a current result after the prompt changes.

- [ ] **Step 7: Run fixture and contract checks**

```powershell
node --test tests/accelerator-skill.test.js
npm --prefix evals/fixtures/long-task run test:catalog
npm --prefix evals/fixtures/long-task run test:billing
```

Expected: repository Skill tests pass; both fixture focused tests fail against the deliberate starting implementations. Record these as the frozen RED state, not repository test failures.

- [ ] **Step 8: Commit the frozen fixture and eval contracts**

```powershell
git add evals/fixtures/long-task evals/formal-plan.json evals/evals.json tests/accelerator-skill.test.js
git commit -m "test: add representative long-task evaluation"
```

---

### Task 7: Implement the Monotonic Evaluation Recorder

**Files:**

- Create: `src/evaluation-controller.js`
- Create: `scripts/evaluate-accelerator.js`
- Create: `tests/evaluation-controller.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/repository.test.js`

**Interfaces:**

```ts
createEvaluationRecorder({ plan, clock, utcNow }): {
  handle(command): { acknowledgement, snapshot, closed }
}

ControllerCommand =
  | { action: 'start', run_id, pair_id, phase, variant, fixture_sha256, skill_sha256 }
  | { action: 'event', type, actor, conflict_domain?, command?, input_identity?, running? }
  | { action: 'finish', quality_pass, invalid_reason, outputs }
```

Historical utility boundary: the CLI record mode is exercised in repository tests with `npm run eval:accelerator -- record --plan tests/fixtures/legacy-evaluation-plan.json --output-dir $runRoot`, where `$runRoot` is an already resolved, fresh, version-bounded absolute directory supplied by the caller. It reads one JSON object per stdin line, stamps it inside the persistent process with `process.hrtime.bigint()`, writes an acknowledgement per line, and atomically rewrites `controller-trace.json` inside the directory passed through `--output-dir` after each accepted command. This CLI is not the active lean campaign runner or a long-lived shared service; completed publication tombstones are intentionally retained and can accumulate.

- [ ] **Step 1: Write lifecycle and monotonic failing tests**

```js
test('recorder owns monotonic timestamps and lifecycle', () => {
  const ticks = [10n, 20n, 30n, 40n];
  const recorder = createEvaluationRecorder({
    plan,
    clock: () => ticks.shift(),
    utcNow: () => '2026-08-21T00:00:00.000Z',
  });
  recorder.handle({ action: 'start', run_id: 'r1', pair_id: 1, phase: 'pilot', variant: 'with_skill', fixture_sha256: digest, skill_sha256: digest });
  recorder.handle({ action: 'event', type: 'worker.start', actor: 'catalog', conflict_domain: 'src/catalog' });
  const result = recorder.handle({ action: 'finish', quality_pass: true, invalid_reason: null, outputs: [] });
  assert.deepEqual(result.snapshot.events.map(({ monotonic_ns }) => monotonic_ns), ['10', '20', '30']);
  assert.equal(result.closed, true);
});
```

Add rejection tests for event-before-start, duplicate start, event-after-finish, decreasing clock, unknown action/type, invalid variant/pair/phase, newline-bearing fields, and invalid reasons outside the plan allowlist.

- [ ] **Step 2: Add a failing CLI round-trip test**

Spawn the script, write start/event/finish JSONL, and assert three acknowledgements plus an exact JSON trace. Assert duration is derived from monotonic nanoseconds and never from the UTC strings.

- [ ] **Step 3: Run tests and verify RED**

```powershell
node --test tests/evaluation-controller.test.js
```

Expected: FAIL because the module and CLI do not exist.

- [ ] **Step 4: Implement the pure recorder and CLI**

Validate commands with closed key sets. Store nanoseconds as decimal strings to keep JSON lossless. Reject non-monotonic clock values. Write snapshots through a same-directory temporary file followed by rename; never append partially valid JSON. Keep event type values closed to:

```js
const EVENT_TYPES = new Set([
  'agent.accepted',
  'worker.start',
  'worker.end',
  'command.start',
  'session.return',
  'independent.start',
  'independent.end',
  'poll',
  'wait',
  'evidence',
  'command.end',
  'agent.completed',
]);
```

Add `"eval:accelerator": "node scripts/evaluate-accelerator.js"` to package and lock metadata. Keep the script out of `package.json#files`.

- [ ] **Step 5: Run controller, repository, and package tests**

```powershell
node --test tests/evaluation-controller.test.js tests/repository.test.js
npm run validate
```

Expected: PASS and the repository script contract recognizes the new local development command.

- [ ] **Step 6: Commit the recorder**

```powershell
git add src/evaluation-controller.js scripts/evaluate-accelerator.js tests/evaluation-controller.test.js tests/repository.test.js package.json package-lock.json
git commit -m "feat: add monotonic evaluation recorder"
```

---

### Task 8: Implement Quality, Overlap, and Three-Pair Analysis

> **Superseded utility:** This task documents the retired controller/analyzer contract now isolated in `tests/fixtures/legacy-evaluation-plan.json`. Its paired short-task metric and three-variant sampling exist only to regression-test that bounded legacy CLI; they are not campaign subjects, thresholds, or public conclusions for the fixed lean campaign.

**Files:**

- Create: `src/evaluation-analysis.js`
- Create: `tests/evaluation-analysis.test.js`
- Modify: `scripts/evaluate-accelerator.js`

**Interfaces:**

```ts
analyzeEvaluation(plan, traces): {
  issues,
  valid_runs,
  formal_pairs,
  req002,
  req003,
  eval008,
  stopped,
  maturity_pass
}
```

Every trace includes `quality_pass`, `invalid_reason`, `duration_ns`, variant, phase, pair ID, Skill/fixture hashes, outputs, and controller-stamped events.

- [ ] **Step 1: Write failing validity and stop-rule tests**

Cover these exact cases:

```js
assert.equal(analyzeEvaluation(plan, threePassingPairs).formal_pairs.length, 3);
assert.equal(analyzeEvaluation(plan, [...threePassingPairs, extraPair]).issues[0].code, 'FORMAL_SAMPLE_LIMIT_EXCEEDED');
assert.equal(analyzeEvaluation(plan, slowButValid).valid_runs.includes('slow-with-skill'), true);
assert.equal(analyzeEvaluation(plan, unknownInvalidReason).issues[0].code, 'INVALID_REASON_UNREGISTERED');
assert.equal(analyzeEvaluation(plan, qualityFailure).maturity_pass, false);
```

Require a complete pair to contain all three variants with matching fixture/resources and the pre-registered order. Pilot traces never contribute to medians.

- [ ] **Step 2: Write failing metric and trace tests**

Use nanosecond fixtures proving:

- median Skill time 70 versus baseline 100 passes exactly 30% speedup;
- median 81 versus 100 fails the 20% gate;
- the retired fixture's paired REQ-002 calculation applies both `skill <= baseline * 1.15` and `skill <= baseline + 3s`, solely as a legacy analyzer regression;
- worker parallelism requires two distinct `worker.start/end` intervals with different conflict domains and positive interval intersection;
- wait overlap requires `command.start < session.return < independent.start < independent.end < command.end`, `session.return.running === true`, at least 15 actual seconds from session return to command end, and no `poll`, `wait`, or `evidence` event between session return and independent end;
- command/input identity duplicates fail REQ-004;
- Agent prose without trace events never passes worker or overlap assertions.

- [ ] **Step 3: Run analysis tests and verify RED**

```powershell
node --test tests/evaluation-analysis.test.js
```

Expected: FAIL because no analyzer exists.

- [ ] **Step 4: Implement pure stable analysis**

Use integer nanoseconds until display formatting. Median sorts `BigInt` values and for an even set returns the integer midpoint; formal maturity always has three samples. Compute speedup as `100 * (baselineMedian - skillMedian) / baselineMedian` only after quality and pair validity pass.

Do not discard a run because it is slow or behaviorally unsuccessful. Only a non-null allowlisted infrastructure reason makes it invalid. Preserve invalid attempts in output. Sort issues, runs, and pair reports by stable IDs.

- [ ] **Step 5: Add CLI analysis mode**

Support the following command, where `$traceRoot` and `$analysisRoot` are resolved absolute directories created by the caller:

```powershell
npm run eval:accelerator -- analyze --plan tests/fixtures/legacy-evaluation-plan.json --traces $traceRoot --output (Join-Path $analysisRoot 'benchmark.json')
```

Write `benchmark.json` and `benchmark.md` from the same analysis object. Exit 0 only when the document is structurally valid; maturity failure is represented in JSON, not confused with controller failure.

- [ ] **Step 6: Run focused and full checks**

```powershell
node --test tests/evaluation-analysis.test.js tests/evaluation-controller.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit the analyzer**

```powershell
git add src/evaluation-analysis.js tests/evaluation-analysis.test.js scripts/evaluate-accelerator.js
git commit -m "feat: analyze paired acceleration evidence"
```

---

### Task 9: Build and Review the Lean Native-JSONL Harness

**Files:** create `src/lean-evaluation.js`, `scripts/run-lean-evaluation.js`, and `tests/lean-evaluation.test.js`; modify package script metadata. Keep `package.json#files` equal to `["SKILL.md"]` and keep `SKILL.md` byte-identical.

**Interfaces:** the harness has only four responsibilities: create a fresh absent attempt directory; launch `codex exec --json`; save raw JSONL, stderr, and exit state; validate and summarize only that attempt after exit. It must not reproduce the existing analyzer, recovery, identity, ACK, ledger, or campaign systems.

- [ ] Write focused RED tests for exact fixed launch options (`gpt-5.6-sol`, `high`, `workspace-write`, network off), fresh-directory collision, current-Skill-only repository discovery, payload-free long baseline, byte-identical neutral long-pair prompts, direct raw JSONL capture, event order, explicit-short zero-probe/state, wait interval, and the 11-process hard cap.
- [ ] Implement the minimum injectable spawn-based runner and validators. Every attempt directory is unique and never recovered or reused; invalid attempts remain intact.
- [ ] Make the campaign runner enforce the exact allocation and order: one multi-agent-disabled non-scoring with-Skill foreground pilot; three alternating neutral long with/without pairs; one explicitly invoked with-Skill short subject; one wait-overlap; one implicit-positive discovery; one explicit-serial long near miss. Exclude the pilot from performance statistics and reject a twelfth subject.
- [ ] Run focused tests only. Do not invoke a real `codex exec` subject or pilot during setup.
- [ ] Update the ignored Task 9 brief/progress/report with convergence and review evidence, then obtain fresh spec and quality approval before any later real pilot.

---

### Task 10: Close Evidence Only After Accepted Lean Runs and User Review

- [ ] Run later subjects only after Task 9 approval and within the fixed 11-process allocation. Preserve every attempt and consume fresh output only.
- [ ] Keep REQ-003's three-pair 20% median threshold. Treat the explicit short subject only as bounded zero-probe/state sanity, with no baseline, wall-clock, or statistical maturity claim.
- [ ] Treat formal evidence as optional extended certification for local usable completion. It still gates any quantitative speed claim and mature-delivery declaration.
- [ ] Update `evals/evals.json`, result artifacts, Brief, Delivery Report, README, decisions, capability protocol, prompt budget, and `.scaffold/state.json` only from accepted current-byte traces.
- [ ] Generate any review viewer from runtime-derived paths and wait for real user feedback. Empty or missing feedback must not be invented.
- [ ] Mark requirements/tracks ready only when their exact evidence exists; otherwise retain truthful pending/blocked status and disclose the lean sample's limited generalization.

---

### Task 11: Audit Current Content and Package Safety

- [ ] Review the complete current diff and untracked delivery files for requirement drift, sensitive information, package whitelist, misleading evidence, and SCOPED Chinese comments.
- [ ] Run focused tests iteratively and `npm run check` once after the complete change; then run `npm run audit`, `npm run validate`, `npm run gate:delivery` when the readiness prerequisites permit, and `npm pack --dry-run --json --ignore-scripts`.
- [ ] Require current tracked plan/spec content to contain no private absolute path and treat current-tree/package safety as local-blocking. An earlier historical audit reported 10 immutable old blobs; the current fail-closed scanner reports 0 current-worktree findings and 16 immutable reachable-history findings. This fix wave does not rewrite history or weaken the scanner.
- [ ] If a later fix changes `SKILL.md`, prompt fixtures, or formal behavior, invalidate affected evidence and restart the accepted-version allocation rather than editing hashes around it.

---

### Task 12: Derive Integration and Install Paths at Runtime

- [ ] Resolve the repository with `git rev-parse --show-toplevel`, resolve the main worktree from Git worktree metadata or a caller-supplied validated root, and stop if either worktree is dirty or ancestry is unsafe.
- [ ] Resolve the user profile with `[Environment]::GetFolderPath('UserProfile')`; derive `.agents\skills\development-execution-accelerator` and the exact `.codex\skills` duplicate from it. Never track a private literal.
- [ ] Stage only `SKILL.md` in a validated temporary directory, verify frontmatter/hash/encoding/prompt budget, then use exact-target quarantine and rollback. Do not enumerate or delete broad skill roots.
- [ ] After local checks pass and the user explicitly authorizes installation, install, discovery smoke, and behavior smoke may proceed even when mature certification remains blocked. Merge, push, Tag, Release, package upload, credential use, and publication remain separate authority-gated actions. This setup task performs none of them.

> **2026-08-23 local-only status:** An authorized exact-target local install, catalog discovery check, and bounded behavior smoke were recorded as complete. Their local operational record is not published or cited as repository evidence, does not alter any requirement or track status, and does not support a quantitative, mature-certification, history-clean, or named-platform claim. Extended certification remains pending.

---

### Task 13: Prepare the Public Source Repository

- [x] Prepare the public source documentation for `https://github.com/xuanjinchen/development-execution-accelerator` without changing `SKILL.md`, formal evaluation, strict requirement statuses, or the fixed 11-subject/20% certification.
- [x] Keep the scope to source preparation only: no Tag, GitHub Release, custom release assets, package-registry upload, quantitative certification, mature-delivery, or named-platform claim.

---

## Plan Self-Review

- Spec coverage: Tasks 1-8 remain historical implementation context; Task 9 converges setup on the 11-process native-JSONL plan; Task 10 retains mature evidence as optional certification for local completion, Task 11 separates local current-tree/package safety from public-release history findings, and Task 12 permits authorized local installation after local checks while certification remains blocked.
- Type consistency: the lean harness consumes native JSONL and emits a fresh-attempt summary without extending the superseded controller command or campaign-state types.
- Scope: runtime remains one Markdown file; Node modules exist only for repository testing and evidence. No architecture or project-planning behavior is introduced.
- Safety: all destructive-looking installation actions target exact resolved directories, keep a rollback quarantine until smoke passes, and never touch broad Skill roots.
- Test discipline: every deterministic harness behavior begins with a focused failing test; the complete round runs `npm run check` once and records SCOPED comment review.
