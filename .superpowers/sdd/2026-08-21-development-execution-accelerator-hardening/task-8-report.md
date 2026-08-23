# Task 8 Report: Quality, Overlap, and Three-Pair Analysis

## Scope and identity

- Base commit: `deb3acf`.
- Task commit: `54568f3` (`feat: analyze paired acceleration evidence`).
- Scope is repository evaluation tooling only: `src/evaluation-analysis.js`, its tests, and the existing evaluation CLI.
- No runtime Skill bytes, formal plan, fixture, package whitelist, record-mode fallback, Agent sampling, paid call, publication, Tag, Release, credential, or external system was changed or used.

## TDD record

The initial analyzer suite was written before production code and failed because `src/evaluation-analysis.js` did not exist. Subsequent focused RED/GREEN cycles covered complete invalid-attempt metadata, cross-pair identity drift, same-domain writer overlap, unregistered invalid reasons that cannot discard formal slots, controller-event resource identity, and suppression of speedup for identity-invalid samples.

Final focused behavior covers:

- exactly three pre-registered formal pairs and stable sample-stop flags;
- valid slow and quality-failed runs consuming slots, while only allowlisted infrastructure reasons release them;
- top-level `scenario_id`, registered order, pilot exclusion, and stable fixture/Skill/resource identity;
- BigInt nanosecond median and JSON-safe display fields;
- REQ-003 quality, 20 percent speed, distinct-domain worker overlap, and one-writer constraints;
- REQ-002 simultaneous 115 percent and three-second limits plus explicit zero-probe behavior;
- EVAL-008 exact event order, running state, 15-second remaining interval, prohibited pre-action events, and three-of-three behavior;
- required command/input duplicate detection and rejection of unsupported Agent prose as trace evidence.

## Analyzer and CLI result

- `analyzeEvaluation(plan, traces)` is pure and returns stable issues, valid/invalid run dispositions, ordered pair reports, REQ-002/REQ-003/EVAL-008 results, stop flags, and `maturity_pass` without exposing BigInt values to JSON.
- The analyzer groups only by top-level `scenario_id`; EVAL-011 and other non-plan selector evidence are excluded rather than inferred from run IDs or variants.
- Resource/input identity comes from controller-stamped command events, not untyped Agent outputs.
- `npm run eval:accelerator -- analyze` recursively reads `controller-trace.json` files beneath an existing resolved absolute trace root and writes sibling `benchmark.json` and `benchmark.md` from one analysis result.
- A structurally valid maturity failure exits zero and remains represented by `maturity_pass: false`; malformed JSON or invalid document structure exits nonzero. Record mode remains unchanged.

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/evaluation-analysis.test.js` | PASS, 19 passed / 0 failed |
| `node --test tests/evaluation-analysis.test.js tests/evaluation-controller.test.js` | PASS, 37 passed / 0 failed |
| `npm run check` | PASS, 312 passed / 33 skipped / 0 failed; validator exit 0 |
| `node --check src/evaluation-analysis.js` | PASS |
| `node --check scripts/evaluate-accelerator.js` | PASS |
| `git diff --check` and `git diff --cached --check` | PASS before commit |

## Final review

The complete tracked patch and both previously untracked delivery files were reviewed before staging. SCOPED Chinese comment review retained only non-obvious maintenance intent for BigInt median precision, valid-slot anti-selection, formal scenario exclusion, same-domain writer safety, wait-overlap ordering, zero probes, dual overhead thresholds, and sample stopping. No stale, obvious, speculative, or line-by-line comments remain.

Sensitive-information review found no credential, private key, authorization value, private absolute path, email address, or unexpected package entry. The initialized publication whitelist remains `SKILL.md` only.

---

# Task 8 Fix Round 1

## Scope and identity

- Fix base: `54568f3`.
- Fix commit: `3128e30` (`fix: harden evaluation evidence analysis`).
- Binding source: `task-8-fix-1-findings.md`, including rulings R30-R33 and every Critical/Important finding.
- Scope remains Task 8 evaluation tooling only. Task 9 sampling, Agent calls, runtime Skill bytes, formal results, publication, Tag, Release, credentials, and package whitelist changes remain out of scope.

## TDD record

- The directed initial RED run produced 17 expected failures for strict trace schema/lifecycle validation, command and worker interval closure/order, plan worker domains/lifecycles, controller start ordering, distinct stop slots, inert invalid-attempt retention, exact finite speed formatting, and recoverable two-file publication.
- After the first GREEN pass, race/purity review added three focused regressions; all three failed against the then-current code before descriptor-safe target reads, publication serialization, and inert Proxy/accessor rejection were implemented.
- A final hardening cycle added five RED cases for literal no-follow rollback detachment, shared-render snapshotting, lock initialization cleanup/stale recovery, and plan normalization, followed by separate RED cases for inert `__proto__` preservation and foreign lock-owner preservation.
- Missing-command and reverse worker-orphan cases were added as direct coverage of already-correct fail-closed behavior.

## Implemented rulings and review fixes

- R30: pair execution order is derived only from unique controller-owned monotonic start stamps; array and path order are non-evidence.
- R31: the formal plan names the two worker domains, and passing worker proof requires distinct actors, exact domains, complete agent/worker lifecycles, positive overlap, quality, identity, and ordered required commands.
- R32: closed controller trace schema, lifecycle, interval, duration, and semantic corruption throw; only an unregistered non-null invalid reason remains an issue-bearing formal attempt.
- R33: JSON/Markdown share one pre-await snapshot and digest, use synced exclusive same-directory temporaries, reject/recheck linked or replaced targets without opening output targets, serialize shared-stem publishers with an owned recoverable lock, move the old Markdown directory entry for rollback, and publish JSON last as the commit marker.
- Analyzer normalization now treats both plan and traces as inert JSON: Proxy, accessor, cycle, sparse array, symbol, non-enumerable, and non-finite inputs fail without executing caller code, while an own `__proto__` JSON key remains data.
- Invalid infrastructure attempts retain a complete cloned trace plus stable attempt index; stop flags require distinct complete preregistered slots; speedup remains exact BigInt arithmetic with a finite canonical string or `null` for zero baseline.

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/evaluation-analysis.test.js tests/evaluation-analysis-output.test.js tests/evaluation-controller.test.js tests/evaluation-atomic-writer.test.js tests/accelerator-skill.test.js` | PASS, 86 passed / 0 failed |
| `npm run check` | PASS, 335 passed / 33 skipped / 0 failed; validator exit 0 |
| `node --check src/evaluation-analysis.js` | PASS |
| `node --check scripts/evaluate-accelerator.js` | PASS |
| `git diff --check` | PASS before staging |

## Final diff, security, package, and comment review

The complete tracked diff and untracked `tests/evaluation-analysis-output.test.js` were reviewed against the binding findings and surrounding controller contracts. No Task 9 behavior, sampling output, Skill/Brief/runtime declaration, formal result, or package whitelist drift was found. The initialized publication whitelist remains exactly `SKILL.md`.

A scoped credential/private-key/private-email/private-path scan of all six delivery files found no material sensitive value. The repository-wide `npm run audit` still reports four pre-existing private-path findings in two historical commits and two unchanged hardening design/plan documents; none is introduced or touched by this fix.

SCOPED Chinese comment review retained maintenance intent only for inert input normalization, lock ownership/stale recovery, literal no-follow detachment, shared rendering snapshot, JSON commit-marker ordering, interval/worker/order invariants, slot retention/stopping, and exact threshold behavior. No stale, speculative, obvious, duplicated, or line-by-line comment remains.

---

# Task 8 Fix Round 2

## Scope and identity

- Fix base: `3128e30` (`fix: harden evaluation evidence analysis`).
- Fix commit: `b8ff38b` (`fix: recover interrupted analysis publication`).
- Binding source: `task-8-fix-2-findings.md`; no deferred minor, Task 9 artifact, runtime `SKILL.md`, Skill Brief, formal sampling/result, paid call, publication, Tag, Release, credential, or package whitelist was changed.

## TDD record

- The first directed run against the fix-base behavior produced exactly three failing regressions and 42 passes: stale publication recovery rejected an owned rollback entry, an unregistered scenario was silently skipped before interval validation, and a top-level Array Proxy reached caller-controlled access.
- The trace changes then reached 33/33 GREEN before publication code changed.
- Real child processes were terminated immediately after each of the three renames used when Markdown already exists. The first two states recover the previous Markdown because JSON is uncommitted; the third retains the new Markdown because the matching JSON digest is committed.
- A final literal no-follow regression proved that the previous stale-owner read followed a symlink; it failed before the stable lstat/open/fstat identity read was applied, then passed.

## Implemented findings

- The top-level traces container is Proxy-first, descriptor-normalized into a dense inert array before any iteration, indexed access, or caller property read. Array Proxy, indexed getter, sparse array, symbol property, and non-enumerable property cases are covered.
- Every normalized trace now completes closed schema plus worker, independent, command interval, command ordering, and session-return lifecycle validation before scenario lookup. Unregistered scenarios throw structurally; only a registered scenario carrying an unregistered non-null `invalid_reason` remains the deliberate issue-bearing slot case.
- Each output generation syncs a closed manifest inside its owned lock before target renames. The manifest binds the analysis digest, publication phase, exact destinations, original and temporary filesystem identities, ownership-scoped paths, and temporary content digests.
- Stale recovery isolates the exact lock directory, refuses linked/foreign entries, verifies literal paths and stable file identities, and reads the JSON digest as the final commit marker. It restores old Markdown only before JSON commit, retains the new generation after commit, and cleans only manifest-proven files.
- The existing-Markdown JSON failure injection now targets rename three, matching the actual publication sequence.

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/evaluation-analysis.test.js tests/evaluation-analysis-output.test.js tests/evaluation-controller.test.js tests/evaluation-atomic-writer.test.js tests/accelerator-skill.test.js` | PASS, 91 passed / 0 failed |
| `npm run check` | PASS, 340 passed / 33 skipped / 0 failed; validator exit 0 |
| `node --check src/evaluation-analysis.js` | PASS |
| `node --check scripts/evaluate-accelerator.js` | PASS |
| `git diff --check` | PASS before staging |

## Final diff, security, package, and comment review

The complete four-file tracked diff and untracked-file list were reviewed against the Round 2 findings and adjacent controller/publication contracts. No requirement drift or Task 9 artifact was found. The initialized npm publication whitelist remains exactly `SKILL.md`.

A scoped scan of the complete delivery diff found no credential, private key, authorization value, private absolute path, or email. Repository `npm run audit` still reports only the same four pre-existing private-path findings from two historical commits and two unchanged hardening design/plan documents; none is introduced or touched by this fix.

SCOPED Simplified Chinese comment review retained only non-obvious intent for Proxy-first inert normalization, pre-routing lifecycle validation, manifest durability/ownership, commit-marker recovery, and rollback direction. No stale, speculative, duplicated, obvious, or line-by-line comment remains.

---

# Task 8 Fix Round 3

## Scope and identity

- Fix base: `b8ff38b` (`fix: recover interrupted analysis publication`).
- Fix commit: `3812c42` (`fix: make analysis publication crash recoverable`).
- Binding source: `task-8-fix-3-findings.md`; analyzer semantics, Task 9, `SKILL.md`, Skill Brief, formal plan/results, paid calls, publication, Tag, Release, credentials, and package whitelist remain unchanged.

## TDD record

- The directed RED run on `b8ff38b` produced 14 passes and 8 expected failures: two external-temporary crash states, manifest preparation/commit interruption, canonical-lock recovery mutex, recovery restart without `.stale.*`, and foreign-inode cleanup preservation.
- A final JSON destination replacement test then failed with “Missing expected rejection”, proving the last publication operation could overwrite a newly inserted foreign inode before the no-clobber hard-link commit was implemented.
- All new regressions exercise real child-process termination or real filesystem entries; fault injection is limited to the exact syscall boundary under test.

## Implemented findings

- Existing public entries are atomically moved into fixed lock-internal roles before inspection. Synced JSON/Markdown payloads and their inode/hash identities are created inside the canonical lock, then `manifest.preparing` is synced, atomically renamed to `manifest.json`, and the lock directory is synced before any external temporary appears.
- External temporaries and the public Markdown/JSON commit points use exclusive hard links. `EEXIST` therefore preserves a concurrently inserted foreign directory entry instead of overwriting it; JSON remains the final visible generation marker.
- The canonical lock directory remains present throughout stale recovery. An exclusive in-lock recovery claim identifies its PID/token through a same-inode unique claim, rejects active contenders, and cleans restartable stale/orphan/held claim states without creating `.stale.*` directories.
- Public destinations, external temporaries, owner evidence, manifests, and cleanup candidates are first renamed into lock-internal held/quarantine roles. Only isolated regular files with manifest-proven inode and SHA-256 identities are opened or removed; linked/reparse/foreign entries are preserved and fail closed.
- Recovery rolls back only while the JSON marker is absent. Once the manifest-matching JSON digest is committed, recovery keeps the matching Markdown and tolerates already-completed deletion of either prior-generation inode.

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/evaluation-analysis-output.test.js` | PASS, 23 passed / 0 failed |
| `node --test tests/evaluation-analysis.test.js tests/evaluation-analysis-output.test.js tests/evaluation-controller.test.js tests/evaluation-atomic-writer.test.js tests/accelerator-skill.test.js` | PASS, 100 passed / 0 failed |
| `npm run check` | PASS, 349 passed / 33 skipped / 0 failed; validator exit 0 |
| `node --check scripts/evaluate-accelerator.js` and test syntax check | PASS |
| `git diff --check` | PASS before staging |
| `npm pack --dry-run --json` | PASS; archive remains the four whitelisted files (`LICENSE`, `README.md`, `SKILL.md`, `package.json`) |

## Final diff, security, package, and comment review

The complete two-file tracked diff and empty untracked-file list were reviewed against the Round 3 findings and adjacent publication/recovery contracts. No analyzer, Task 9, Skill/Brief, formal evidence, public-release, credential, or package-whitelist drift was found.

The scoped delivery diff contains no credential, private key, authorization value, private absolute path, or email. Repository `npm run audit` still reports only the same four pre-existing private-path findings from two historical commits and two unchanged hardening design/plan documents; none is introduced or touched by this fix.

SCOPED Simplified Chinese comment review retained only non-obvious ownership transfer, isolation-before-open/delete, manifest durability, Windows directory-sync portability, recovery-claim exclusion/restart, rollback direction, and JSON commit-marker intent. No stale, speculative, duplicated, obvious, or line-by-line comment remains.

---

# Task 8 Fix Round 4

## Scope and identity

- Fix base: `3812c42` (`fix: make analysis publication crash recoverable`).
- Fix commit: `5cff4d9` (`fix: close analysis publication recovery gaps`).
- Binding source: `task-8-fix-4-findings.md` and ruling R34. Only the publication CLI and its output tests changed; analyzer semantics, Task 9, `SKILL.md`, Skill Brief, formal plan/results, paid calls, publication, Tag, Release, credentials, and package whitelist remain unchanged.

## TDD record

- The directed BASE run produced exactly seven expected failures and 23 passes: orphan-claim quarantine restart, restored-old-JSON restart, owner-handoff restart, held evidence opening, rollback unlink cleanup, occupied restore destination, and Windows directory-sync durability truth.
- Each of the three named recovery transitions uses a real child-process exit and then proves both the next recovery and a subsequent publication converge without a stale directory.
- GREEN self-review added two preservation cycles. Interruption after restoring an already committed JSON marker first failed on duplicate recovery evidence, and a Round 3 schema-1 manifest first failed the new durability parser. Both tests failed before their fixes and now pass.

## Implemented findings

- Recovery cleanup recognizes `recovery.orphan.unique.held`; rollback classification distinguishes an already-restored previous JSON inode from the new temporary inode; same-inode restore links are idempotent across another interruption.
- The recovery claim remains the ownership record while the old owner is removed, then its unique inode is linked exclusively into `owner.json`. A restarted handoff with no old owner can resume only from a proven stale recovery marker and claim pair.
- Predictable held roles are renamed to fresh quarantine capabilities before open or unlink. Reads add OS no-follow flags where Node exposes them and retain descriptor/path identity checks; cleanup deletes only the quarantined capability, so injected fixed-path swaps are preserved and fail closed.
- Restore uses an exclusive hard link instead of a potentially overwriting POSIX rename. `EEXIST` preserves a newly occupied foreign destination, while a same-inode destination records a completed prior restore.
- Manifest schema 2 records `process-interruption` as the recovery guarantee. Windows directory sync is explicitly `unsupported` with `unsupported-best-effort` power-loss durability; file-handle sync and JSON-last ordering remain. Schema-1 manifests from the preceding protocol remain recoverable.

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/evaluation-analysis-output.test.js` | PASS, 32 passed / 0 failed |
| `node --test tests/evaluation-analysis.test.js tests/evaluation-analysis-output.test.js tests/evaluation-controller.test.js tests/evaluation-atomic-writer.test.js tests/accelerator-skill.test.js` | PASS, 109 passed / 0 failed |
| `npm run check` | PASS, 358 passed / 33 skipped / 0 failed; validator exit 0 |
| `node --check scripts/evaluate-accelerator.js` and output-test syntax check | PASS |
| `git diff --check` and staged diff check | PASS before commit |
| `npm pack --dry-run --json` | PASS; archive remains `LICENSE`, `README.md`, `SKILL.md`, and `package.json` |

## Final diff, security, package, and comment review

The complete two-file delivery diff and empty untracked-file list were reviewed against R34 and every Preserve item. Manifest-before-external-temp, the canonical shared-stem lock, exclusive external/public hard links, Markdown-first/JSON-last publication, common digest, concurrency exclusion, foreign-entry preservation, and all analyzer behavior remain intact.

The repository audit still reports only the same four pre-existing private-path findings in two historical commits and two unchanged hardening design/plan documents. The Round 4 diff contains no credential, private key, authorization value, private absolute path, or email. The initialized npm publication whitelist remains exactly `SKILL.md`, and the dry-run archive contains the same four expected files.

SCOPED Simplified Chinese comment review retained only non-obvious state transitions, ownership continuity, quarantine/failure-close boundaries, and platform durability limits. No stale, speculative, duplicated, obvious, or line-by-line comment remains.

---

# Task 8 Fix Round 5

## Scope and identity

- Fix base: `5cff4d9` (`fix: close analysis publication recovery gaps`).
- Binding source: `task-8-fix-5-findings.md`; this is the final Task 8 implementation round.
- Implementation scope is limited to `scripts/evaluate-accelerator.js`, the necessary output-publication regressions, and this report. Analyzer semantics, Task 9, `SKILL.md`, Skill Brief, formal plan/results, paid calls, publication, Tag, Release, credentials, and package whitelist remain unchanged.

## TDD record

- The directed RED run added eight regressions and produced exactly 8 expected failures with all 32 pre-existing output tests passing.
- The new cases cover repeated interruption while replacing a stale recovery claim, release interruption after canonical-lock tombstoning, arbitrary-byte hard-linked recovery evidence, quarantine `ENOENT` replacement, restore-source replacement, and mutable-name replacement during payload sync, recovery-claim linking, and owner installation.
- GREEN reached 40/40 output tests. The complete Task 8 five-file focused suite reached 117/117, and the repository check remained green.

## Implemented findings

- Recovery claim schema 2 binds protocol, schema, PID, token, generation, canonical-lock stem, and recovering state. Marker and unique records must have identical bytes and inode identity and must agree with their filename identity; malformed or ownerless legacy evidence is preserved and rejected.
- A new recovery unique claim is file-synced and directory-synced before the previous marker is retired. Old claims are moved to unique retained evidence, and a recovered lock is atomically renamed to a completed tombstone before a fresh canonical lock is acquired.
- Release validates the canonical directory plus the paired owner marker/unique inode, then atomically renames the whole canonical lock to a unique `.completed.*` directory and syncs its parent. Canonical availability no longer depends on removing the last ownership record.
- Every quarantine use moves the current candidate to a fresh random role and validates pre/post inode identity. Isolated reads acquire a file handle before moving the directory entry and read only through that held handle; restore revalidates its isolated source immediately before the exclusive hard link.
- `ENOENT` replacements are freshly quarantined and rejected rather than reused as capabilities. Detachment rollback uses a non-overwriting hard link. Transaction cleanup retains isolated evidence instead of unlinking mutable names, including payload creation, claim-link, and owner-install failure paths.
- Completed tombstones are intentionally retained. This trades automatic space reclamation for evidence-safe recovery and is explicitly permitted by the Round 5 findings; no transaction-time path deletion is attempted.

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/evaluation-analysis-output.test.js` | PASS, 40 passed / 0 failed |
| `node --test tests/evaluation-analysis.test.js tests/evaluation-analysis-output.test.js tests/evaluation-controller.test.js tests/evaluation-atomic-writer.test.js tests/accelerator-skill.test.js` | PASS, 117 passed / 0 failed |
| `npm run check` | PASS, 366 passed / 33 skipped / 0 failed; validator exit 0 |
| `node --check scripts/evaluate-accelerator.js` and output-test syntax check | PASS |
| `git diff --check` | PASS before staging |
| `npm pack --dry-run --json` | PASS; archive remains `LICENSE`, `README.md`, `SKILL.md`, and `package.json` |

## Final diff, security, package, and comment review

The complete production and regression diffs plus the ignored report delivery file were reviewed against every Round 5 finding. Manifest-before-external-temp, canonical recovery exclusion, Markdown-first/JSON-last publication, shared digest, exclusive public hard-link commit, and R34's process-interruption/best-effort durability statement remain intact. No analyzer, Brief, formal evidence, runtime Skill, Task 9, or package-whitelist drift was found.

The scoped delivery scan found no credential, private key, authorization value, private absolute path, or email. Repository `npm run audit` still exits 1 only for the same four pre-existing private-path findings in two historical commits and two unchanged hardening design/plan documents; none is introduced or touched by Round 5. The dry-run package remains exactly the four expected whitelisted files.

SCOPED Simplified Chinese comment review covered the complete diff and retained only non-obvious ownership continuity, generation binding, capability isolation, exclusive restore, retained-evidence, and atomic tombstone intent. No stale, speculative, duplicated, obvious, or line-by-line comment remains.
