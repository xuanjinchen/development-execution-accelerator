# Task 10 Preflight Report

## R49 lifecycle-type repair

- Status: implementation and focused verification complete; independent scoped approval remains required before any non-scoring pilot launch.
- Base: `73905b2ea5cc5956287eed86c2b3c0b5367a0627`.
- Scope: only `src/lean-evaluation.js` and `tests/lean-evaluation.test.js` change the validator behavior. No subject, pilot, stream, fixture, launch, plan, package, Skill, or Task 8 work ran or changed.
- Invariant: an item completion that reuses a started lifecycle ID with another item type now fails closed. Completion IDs are unique across lifecycle completions, so an `agent_message` cannot close or hide a `command_execution` lifecycle.

## Focused TDD evidence

1. RED: `node --test --test-name-pattern="cross-type completion" tests/lean-evaluation.test.js` failed with `Missing expected exception` against the exact R49 trace: `command_execution` start `hidden` / `npm test &`, same-ID `agent_message` completion, then a valid `npm test` lifecycle.
2. GREEN: the same command passed after the minimal type-consistency completion guard.
3. Lean focused suite: `node --test tests/lean-evaluation.test.js` passed 32/32.
4. Repository-wide `npm run check` was intentionally deferred, as required, until Task 10 evidence/documentation completion.

## Preservation and review

- The existing wait-overlap, id-less command rejection, and same-ID command-identity tests remain green in the lean suite.
- `SKILL.md` remains byte-identical: SHA-256 `026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23`.
- Full working diff and untracked-file review found only the two scoped code/test files before this report; `git diff --check` passed.
- Sensitive-information scan found no match in the code/test diff. Package dry-run still lists only `LICENSE`, `README.md`, `SKILL.md`, and `package.json`.
- SCOPED code-comment review complete: the type-binding guard has a concise Chinese maintenance-intent comment; no other comment change is needed.

## Pilot fail-fast gate

- Base: `8d110a9966e22ee9df352606365f8e2cd58f44cf`.
- Scope: only `src/lean-evaluation.js` and `tests/lean-evaluation.test.js` are tracked delivery changes. No real subject or pilot, fixture, launch option, CLI, schema, plan, package, Skill, or Task 8 work ran or changed.
- RED: `node --test --test-name-pattern="stops the campaign after an invalid pilot" tests/lean-evaluation.test.js` failed as expected before the fix: the injected invalid `pilot-with-skill` was followed by all ten formal subjects.
- GREEN: the runner now preserves an invalid pilot summary, breaks immediately before formal dispatch, and writes the ordinary partial invalid `result.json`. A valid pilot keeps the existing exact 11-subject order.
- Verification: the exact regression passed; `node --test tests/lean-evaluation.test.js` passed 33/33. `npm run check` was intentionally not run, per Task 10 scope.
- Review: full diff and untracked-file review found only the two scoped tracked files; `git diff --check` passed; the scoped diff's sensitive-information scan found no match; `npm pack --dry-run --json` listed only `LICENSE`, `README.md`, `SKILL.md`, and `package.json` (its host npm-config warnings are unrelated). SCOPED comment review is complete: the Chinese comment documents the preflight boundary and no further comment change is needed.

## Pilot config repair

- Base: `c4baf619b74c762cd0c77a085501aef67ac79a76`; no tracked change was present before this repair.
- Scope: only `src/lean-evaluation.js` and its exact invocation regression change, plus this required Task 10 report entry. No real subject or pilot, prompt, Skill, fixture, validator, campaign, Task 8, package, or other documentation work ran or changed.
- RED: the exact pilot/formal invocation regression failed against the old invocation because it lacked `--ignore-rules`, `agents.enabled=<bool>`, and `approval_policy="never"` in both modes.
- GREEN: `buildCodexInvocation` now retains `features.multi_agent=<bool>`, adds `agents.enabled=<same bool>`, passes `--ignore-rules` beside `--ignore-user-config`, and supplies strict `approval_policy="never"` while preserving workspace-write, disabled network, and all other frozen controls.
- Verification: `node --test --test-name-pattern="builds the fixed restricted codex exec JSONL invocation" tests/lean-evaluation.test.js` passed 2/2; `node --test tests/lean-evaluation.test.js` passed 34/34. `npm run check` and real subject/pilot execution were intentionally not run, per scope.
- Review: full diff/untracked review is limited to the scoped implementation, exact test, and required report. `git diff --check` passed; sensitive-information scan found no match; `npm pack --dry-run --json` listed only `LICENSE`, `README.md`, `SKILL.md`, and `package.json` (host npm-config warnings are unrelated); `SKILL.md` SHA-256 remains `026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23`. SCOPED comment review is complete: the invocation additions are direct configuration entries covered by the existing function contract, so no new comment is needed.

## Controlled campaign `current-026b8450-a4`

- Status: **BLOCKED**. This is the one authorized fresh campaign after `657e55f`; no a5 was started.
- Command: with the system temporary root `dea-codex-01490-20260823` placed first on `PATH`, ran `node scripts/run-lean-evaluation.js --output-root .superpowers\sdd\2026-08-21-development-execution-accelerator-hardening\lean-runs --campaign-name current-026b8450-a4`.
- CLI identity: `resolveCodexLaunch()` resolved the relative entry `node_modules/@openai/codex/bin/codex.js`; direct execution of that entry reported `codex-cli 0.149.0`. The PATH root rather than its `.bin` directory was used. The root-level `codex.cmd --version` itself was malformed for this layout (`%dp0%\..\@openai\...`); the harness does not execute that shim and instead used the verified direct JS entry.
- Result: runner wrote `lean-runs/current-026b8450-a4/pilot-with-skill/{native-events.jsonl,stderr.txt,exit.json,summary.json}` and campaign `result.json`. The final result has exactly one invalid pilot attempt, zero formal attempts, `performance.evaluated=false`, and no a5 directory.
- Native errors: JSONL records `Reconnecting... 2/5` through `5/5` for request timeouts, then `Falling back from WebSockets to HTTPS transport. request timed out`. It emitted two planning messages but no command lifecycle. Stderr records policy rejection of every PowerShell Skill read (global Chinese-comment/TDD files and staged/current Skill paths); no fixture command or file work completed.
- Termination: after the repeated top-level transport errors, the verified a4 Codex child was stopped at user direction without deleting or rewriting raw JSONL. The runner then truthfully wrote exit code `4294967295`, pilot summary `valid=false`, `phase="process"`, `commands=[]`, and its fail-fast campaign result.
- Evidence ruling: `a4` does not provide a valid pilot or any formal evidence to continue Task 10. The config repair is reflected in the actual invocation, but the unresolved service timeout and policy rejection require direction or an externally corrected environment; do not add speculative configuration or launch another campaign.

## Task 10A certification infrastructure repair

- Status: implementation complete. No real Codex subject, pilot, or campaign ran. Task 10B remains separately gated by independent review and controller preparation.
- Base: `1d243788ca7cb7639808aa62c880cdf2c7e85c92`.
- Implementation head/commit: `a128aed90325a2425c8776040569a2127df6a77c` (`fix: harden lean certification infrastructure`). The subsequent report-only commit records this section and does not change implementation bytes.
- Scope: `src/lean-evaluation.js`, `scripts/run-lean-evaluation.js`, and `tests/lean-evaluation.test.js`; this section is the required append-only record. `SKILL.md`, formal prompts, fixture behavior, model, reasoning, sandbox, network, subject order, process cap, public evidence, and scaffold readiness state did not change.

### Root cause and minimal interface

- Root cause 1: `runLeanCampaign()` and `runLeanAttempt()` could resolve a Codex executable internally, allowing the first global `codex` on `PATH` to replace the intended installation. The minimal interface now requires CLI arguments `--codex-entry <file>` and `--codex-version <version>`. `resolveCodexLaunch()` verifies that exact regular non-symlink JavaScript entry by invoking only `<node> <entry> --version` and requiring an exact trimmed version match. Campaigns and attempts accept only the resulting controller-verified launcher; they no longer discover from `PATH`.
- Root cause 2: the environment allowlist retained host `HOME`, `USERPROFILE`, and `CODEX_HOME`, while the previous `userHome` value only affected one invocation config. The minimal interface now requires `--subject-home <directory>`, validates a real `.codex` root with neither `.agents/skills` nor `.codex/skills`, and overrides all three identity roots for every spawned subject. Validation uses metadata only; the runner contains no credential-copy or credential-read path. Repository artifacts record only the pinned CLI version and entry SHA-256, never the subject-home path or credential contents.
- Root cause 3: `result.valid` represented correctness only, and the CLI exited zero for a valid campaign even if performance was below 20 percent. `certified` is now derived fail-closed from exactly `result.valid === true`, `correctness_passed === true`, `performance.evaluated === true`, and `performance.meets_twenty_percent === true`; the CLI also independently rechecks those four source fields before returning zero.

### Focused TDD evidence

Every production behavior below was preceded by the named test and exact RED command. All launch behavior used temporary controlled fixtures, injected launchers, injected version probes, and fake JSONL children.

1. RED: `node --test --test-name-pattern="verifies the controller-provided Codex entry" tests/lean-evaluation.test.js` failed because the old resolver ignored the supplied entry, selected the global `<global-cli-entry>`, and returned no verified version. GREEN: the same command passed after explicit-entry probing.
2. RED: `node --test --test-name-pattern="rejects a controller-provided Codex entry when its exact version differs" tests/lean-evaluation.test.js` failed with `Missing expected rejection`. GREEN: `node --test --test-name-pattern="controller-provided Codex entry" tests/lean-evaluation.test.js` passed 2/2 after the exact comparison.
3. RED: `node --test --test-name-pattern="campaign CLI requires the pinned Codex" tests/lean-evaluation.test.js` failed with the old two-argument usage contract. GREEN: the same command passed after the three required infrastructure argument pairs were added.
4. RED: `node --test --test-name-pattern="passes only the documented subject environment allowlist" tests/lean-evaluation.test.js` failed because all three identity roots still contained the host paths instead of the controller home. GREEN: the same command passed after the exact overrides.
5. RED: `node --test --test-name-pattern="verifies an isolated subject home" tests/lean-evaluation.test.js` failed because `verifySubjectHome` did not exist. GREEN: the same command passed after real-directory and no-Skill-root checks were added.
6. RED: `node --test --test-name-pattern="captures native JSONL bytes directly" tests/lean-evaluation.test.js` failed with empty JSONL because the attempt did not supply the controller home to the environment boundary. GREEN: the same command passed after one verified home was applied to invocation and spawn environment; its `summary.json` assertion also proved the path was absent.
7. RED: `node --test --test-name-pattern="runs only the fixed fresh 11-subject campaign" tests/lean-evaluation.test.js` failed at the old internal launcher resolution (`entryPath must be a non-empty string`). GREEN: the same command passed after verified launcher/home passthrough and CLI version/entry-digest manifest binding.
8. RED: the same fixed-campaign command failed with `certified` undefined at the exact 80/100 median boundary. GREEN: the same command passed after the field was introduced.
9. RED: `node --test --test-name-pattern="withholds certification from a valid campaign" tests/lean-evaluation.test.js` failed because a valid 81/100 campaign still had `certified=true`. GREEN: `node --test --test-name-pattern="runs only the fixed fresh 11-subject campaign|withholds certification from a valid campaign" tests/lean-evaluation.test.js` passed 2/2 after the full predicate.
10. RED: `node --test --test-name-pattern="campaign CLI exits zero only" tests/lean-evaluation.test.js` first failed because the real CLI module exported no injectable `main`. GREEN: the same command passed after the CLI boundary became injectable and returned the certification exit code.
11. RED: the same CLI command then failed `0 !== 1` for an intentionally inconsistent `certified=true`/invalid source result. GREEN: `node --test --test-name-pattern="campaign CLI exits zero only|withholds certification|runs only the fixed fresh" tests/lean-evaluation.test.js` passed 3/3 after the summary and CLI shared the four-field predicate.

### GREEN and repository verification

- Final focused suite: `node --test tests/lean-evaluation.test.js` passed 40/40, failed 0, skipped 0, exit 0.
- The single final aggregate command `npm run check` was launched once. Its initial output showed the repository test run progressing without a failure; the tool's 30-second output window yielded before the aggregate shell's final status and its continuation handle was not retained. It was not restarted.
- To bind both exact aggregate components to explicit terminal statuses without a second `npm run check`, `npm test` passed 408/408 executed tests with 33 skipped (441 total), failed 0, exit 0; `npm run validate` exited 0 with no validation issue. The only output outside test results was the host's pre-existing npm warnings for `sass_binary_site`, `python`, and `msvs_version`.
- `git diff --check` exited 0.

### Preservation, identity, and delivery review

- No-real-subject attestation: no Codex CLI installation, authentication copy/read, real `codex exec`, subject, pilot, or campaign command ran. All TDD launches were in-process injected fakes over controlled temporary data.
- Skill digest verification: `SKILL.md` SHA-256 remains exactly `026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23`.
- Full diff review: the implementation commit contains only the three approved tracked code/test paths. The required report append is separate; there are no other tracked modifications or untracked delivery files.
- Sensitive-information review: the full zero-context diff scan found no credential-value, private-key, token, or secret pattern. Tests use only literal controlled placeholders and do not expose host credentials or subject-home paths in repository artifacts.
- Package whitelist review: `npm pack --dry-run --json` listed exactly `LICENSE`, `package.json`, `README.md`, and `SKILL.md`.
- SCOPED Chinese-comment review complete: three concise maintenance-intent comments document the authentication non-read/copy boundary, pinned-entry/PATH invariant, and fail-closed four-field certification gate. Existing accurate comments remain; no grouped or line-by-line comments were added.
- Concerns: the single aggregate command's final exit code was not recoverable after the tool output-window yield; both exact component commands were subsequently and explicitly proven exit 0 as recorded above. No implementation, evidence-scope, or safety concern remains.

## Task 10A Fix Round 1

- Status: all three Important review findings are fixed and locally verified. The deferred Minor integration-test suggestion did not enter this round. No real Codex subject, pilot, or campaign ran.
- Fix base: `75ba546a2498e2e514a296fe4f3410091b9027d7`.
- Implementation head/commit: `00f9bd335de0a1945c1b939011e7a4487a59c4b7` (`fix: close task 10a infrastructure review findings`). The subsequent report-only commit records this append without changing implementation bytes.
- Tracked scope: `src/lean-evaluation.js` and `tests/lean-evaluation.test.js`; `scripts/run-lean-evaluation.js` remained unchanged in this round. This section is the required append-only report record.

### RED/GREEN evidence

1. Canonical entry and subject-home identity: RED `node --test --test-name-pattern="rejects ancestor aliases for pinned entry" tests/lean-evaluation.test.js` failed with `Missing expected rejection`. GREEN: the same command passed 1/1 after canonical path binding rejected ancestor symlink/junction aliases.
2. Authentication metadata and subject-home scope isolation: RED `node --test --test-name-pattern="subject-home (authentication precondition|scope rejects)" tests/lean-evaluation.test.js` failed for both missing behaviors: the empty home produced `Missing expected rejection`, while the overlap case reached the unrelated missing `evals/evals.json` path. GREEN: the same command passed 2/2 after requiring a canonical regular non-symlink `.codex/auth.json` through metadata checks only and rejecting repository/output overlap in either direction. The direct-attempt regression also proves validation occurs before prepare/spawn.
3. Verified launcher identity: RED `node --test --test-name-pattern="production boundaries reject PATH launchers" tests/lean-evaluation.test.js` failed with `Missing expected rejection` after the old code entered the spawn path. GREEN: the same command passed 1/1 after the resolver returned a frozen privately branded Node-plus-canonical-entry launcher and the builder, campaign, and attempt boundaries rejected PATH launchers, relative or mismatched shapes, clones, and impostors before dispatch.

### Final verification

- Exact covering tests: `node --test --test-name-pattern="rejects ancestor aliases|subject-home authentication|subject-home scope|production boundaries reject PATH" tests/lean-evaluation.test.js` passed 4/4, failed 0, exit 0.
- Final lean suite: `node --test tests/lean-evaluation.test.js` passed 44/44, failed 0, skipped 0, exit 0.
- The single final aggregate `npm run check` was run once with its continuation session retained through completion: 445 total, 412 passed, 33 skipped, 0 failed; Validator completed; actual exit code 0. Only the host's pre-existing npm configuration warnings for `sass_binary_site`, `python`, and `msvs_version` appeared.

### Preservation and delivery review

- `git diff --check` exited 0. Full diff and untracked review found only the two scoped implementation files before this required report append, with no untracked delivery files.
- Sensitive-value scan found zero credential-value, private-key, bearer-token, or secret-pattern matches. Authentication handling performs only canonicalization and filesystem metadata checks; it never reads, copies, hashes, prints, or persists authentication contents.
- `npm pack --dry-run --json` listed exactly `LICENSE`, `package.json`, `README.md`, and `SKILL.md`.
- `SKILL.md` remains byte-identical with SHA-256 `026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23`.
- SCOPED Chinese-comment review is complete across the full implementation diff: the existing concise contracts remain accurate for the canonical pinned-entry/PATH boundary and metadata-only authentication handling; the explicit private verifier/WeakMap names and regressions make launcher-brand identity unambiguous. No additional or updated comment is needed.
- No-real-subject attestation: no real Codex CLI, installation, authentication copy/read, `codex exec`, subject, pilot, or campaign ran. All launcher and process behavior used controlled temporary fixtures and injected seams.
- Concerns: none within the approved Fix Round 1 scope.

## Task 10A Fix Round 2

- Status: both residual Important subgroups are fixed and locally verified. No real Codex subject, pilot, or campaign ran.
- Fix base: `96d8cfc4999172318686f72b7b1dcb1944a915d2`.
- Implementation head/commit: `e576fcb5433aaef38c3c691f23f9c8f81b4fd31e` (`fix: close task 10a residual infrastructure findings`). The subsequent report-only commit records this append without changing implementation bytes.
- Tracked scope: `src/lean-evaluation.js` and `tests/lean-evaluation.test.js`; `scripts/run-lean-evaluation.js` remained unchanged in this round. This section is the required append-only report record.

### RED/GREEN evidence

1. Subject-home failure-artifact redaction: RED `node --test --test-name-pattern="redacts both subject-home path forms" tests/lean-evaluation.test.js` failed 0/1, exit 1, because the old spawn-failure summary serialized the isolated Home (`true !== false`). GREEN: the same command passed 1/1 after a centralized artifact-boundary redactor replaced only the full canonical native and portable Home forms while preserving `controlled failure context`. The behavior covers the returned and persisted attempt summary plus the returned and persisted campaign result.
2. Real-process launcher attestation: RED `node --test --test-name-pattern="does not let caller-controlled code attest" tests/lean-evaluation.test.js` failed 0/1, exit 1, with `Missing expected rejection` because caller-provided code attested an ordinary canonical file. GREEN: the same command passed 1/1 after removing the public probe seam and fixing the resolver to its private real `execFile` path. Positive, mismatch, alias, and production-boundary fixtures now use a temporary JavaScript entry executed as canonical Node plus entry plus `--version`; the shared entry and filename contain spaces. No exported test-only attestation hook remains.

### Final verification

- Exact covering tests: `node --test --test-name-pattern="redacts both subject-home|controller-provided Codex entry|caller-controlled code attest|rejects ancestor aliases|production boundaries reject PATH" tests/lean-evaluation.test.js` passed 6/6, failed 0, exit 0.
- The first lean run exposed only the expected fixture-identity consequence of replacing the inert entry bytes: 45/46 passed and the campaign manifest still expected the old controlled-entry SHA-256. Updating that test binding to the new real fake-entry bytes made its focused campaign test pass 1/1.
- Final lean suite: `node --test tests/lean-evaluation.test.js` passed 46/46, failed 0, skipped 0, exit 0.
- The single final aggregate `npm run check` ran once with its continuation session retained through completion: 447 total, 414 passed, 33 skipped, 0 failed; Validator completed; actual exit code 0. Only the host's pre-existing npm configuration warnings for `sass_binary_site`, `python`, and `msvs_version` appeared.

### Preservation and delivery review

- `git diff --check` exited 0. Full diff and untracked review found only the two scoped implementation files before this required report append, with no untracked delivery files.
- Sensitive-value scan found zero credential-value, private-key, bearer-token, or secret-pattern matches. The redactor handles only the isolated Home root strings and neither authentication contents nor auth paths are read, copied, hashed, printed, or persisted.
- `npm pack --dry-run --json` listed exactly `LICENSE`, `package.json`, `README.md`, and `SKILL.md`.
- `SKILL.md` remains byte-identical with SHA-256 `026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23`.
- SCOPED Chinese-comment review is complete across the full implementation diff: concise comments record the real-process anti-forgery contract and the exact native/portable Home-root redaction boundary. Existing accurate comments remain; no grouped or line-by-line comments were added.
- No-real-subject attestation: no real Codex CLI installation, authentication copy/read, `codex exec`, subject, pilot, campaign, public evidence, scaffold state, prompt, fixture, or `SKILL.md` change occurred. The only real subprocess attestation used temporary controlled JavaScript fixtures.
- Concerns: none within the approved Fix Round 2 scope.

## Task 10B isolated pinned campaign `current-026b8450-a5`

- Status: **DONE_WITH_CONCERNS**. Exactly one fresh campaign invocation ran. The invalid pilot triggered the runner-owned fail-fast boundary, so no formal subject ran and no retry occurred.
- Repository preflight: worktree HEAD was `0d4ea5d17955dad77236ef829d83ec42c5cef93d`; tracked and complete status were clean; `package.json#scaffold.mode` was `initialized`; `SKILL.md` SHA-256 was exactly `026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23`; campaign directories ended at `current-026b8450-a4`, and `current-026b8450-a5` did not exist.
- Isolated CLI: a new unique system-temporary npm prefix outside every workspace root installed exactly `@openai/codex@0.149.1` without changing the global installation. The actual regular non-reparse JavaScript entry produced exact stdout `codex-cli 0.149.1`, and its SHA-256 was `134063e133f0b4244fa3b251acf973d4fe4b4aeeacbdc135211bf480f59f1477`. The global CLI remained `codex-cli 0.133.0` before launch.
- Authentication/isolation preflight: the real profile came only from `[Environment]::GetFolderPath('UserProfile')`; the existing `.codex/auth.json` was checked through metadata only and its contents and digest were never read or printed. A new unique system-temporary subject Home received only that file under a newly created `.codex` directory. Before launch, `.agents/skills`, `.codex/skills`, config, rules, history, and sessions were absent, and the isolated entry's `login status` exited zero with method `ChatGPT` under overridden `HOME`, `USERPROFILE`, and `CODEX_HOME`.
- Sanitized exact invocation from the worktree: `node scripts/run-lean-evaluation.js --output-root .superpowers\sdd\2026-08-21-development-execution-accelerator-hardening\lean-runs --campaign-name current-026b8450-a5 --codex-entry <isolated-cli-entry> --codex-version "codex-cli 0.149.1" --subject-home <isolated-subject-home>`.
- Terminal/result: actual campaign CLI exit was `1`. `attempts.length=1`, order was exactly `pilot-with-skill`, pilot `valid=false`, pilot `phase="validation"`, pilot process exit was `0`, pilot commands were empty, and the preserved error was `Native trace contains a top-level or turn failure.` Campaign `valid=false`, `correctness_passed=false`, `performance.evaluated=false`, `performance.meets_twenty_percent` was absent, and `certified=false`.
- Preserved artifact inventory: campaign `manifest.json` and `result.json`; pilot `native-events.jsonl`, `stderr.txt`, `exit.json`, and `summary.json`; plus the nine untouched pilot-workspace fixture files under `pilot-with-skill/workspace` (15 files total). No `a1`-`a5` evidence file was edited or deleted.
- Subject-Home path-leak scan: native literal count `0` in no files; portable literal count `0` in no files. An additional JSON-escaped-native scan found count `1` in `pilot-with-skill/stderr.txt`; the raw file was preserved unchanged and the private value is not reproduced here.
- Authentication cleanup: only after the campaign process ended and artifact reads closed, the exact copied auth file was resolved and verified as a regular file under the unique system-temporary subject Home and outside every workspace root, then removed with one literal-file deletion. Absence was verified. The non-secret CLI installation and subject Home were retained for Task 10C audit.
- No-rerun attestation: the campaign runner was invoked exactly once. There was no second pilot, pair retry, added subject, changed prompt/fixture/model/reasoning/sandbox/network setting, serialized baseline, selected sample, lowered threshold, or valid-below-threshold retry.
- Concerns: the pilot was invalid, so `a5` supplies no correctness or performance certification. Although both Skill roots were absent immediately before launch, CLI runtime bootstrap materialized 188 non-secret cache/plugin/system-Skill files in the isolated Home, including `.codex/skills`; they were preserved because Task 10B authorized removal of only the auth copy. The escaped subject-Home occurrence in raw `stderr.txt` also requires Task 10C review. No tracked repository file changed.

## Task 10B report correction — Fix Round 1

- Evidence classification: `current-026b8450-a5` is a non-scoring infrastructure failure with a validator-invalid pilot. It is not accepted campaign evidence and does not establish a Skill behavior failure.
- Sanitized failure sequence: the pilot started normally; four top-level transport timeout events followed; an item-level WebSocket-to-HTTPS fallback also timed out; model output later recovered and the turn completed normally; independently, shell policy rejected every command and the empty patch, so no fixture lifecycle occurred. The validator deliberately rejects a trace containing any top-level error even when later output recovers, and invalid-pilot fail-fast therefore stopped all formal subjects.
- Post-bootstrap isolation qualification: the 188-file retained-Home inventory is metadata-only operator evidence and is not independently recoverable from campaign artifacts because the private retained-Home locator is intentionally omitted. The raw trace exposes plugin/MCP system resources but no second accelerator and no named user-global Chinese-comment, TDD, or subagent Skill. This statement is limited to the reviewed raw trace and does not claim exhaustive absence among the unreviewed generated files.
- Redaction qualification: derived `summary.json` and `result.json` redact the isolated Home. Preserved raw `stderr.txt` contains one JSON-escaped private locator but no credential value. Raw preservation requires that Minor local privacy limitation to remain unchanged.
- Tracked-change correction: campaign execution changed no tracked code, configuration, Skill, or fixture. The required Task 10 report append itself is a tracked modification pending the evidence-close commit; it remains unstaged and uncommitted in this fix round.

## Task 10C truthful evidence close after consumed invalid a5

- Status: **DONE_WITH_CONCERNS**. `current-026b8450-a5` is consumed as a non-scoring infrastructure failure with a validator-invalid pilot. It is not accepted evidence and is not a Skill behavior failure; no formal subject or fixture command lifecycle ran, `correctness_passed=false`, `performance.evaluated=false`, `certified=false`, and the campaign exited `1`.
- Documentation close: added active `DEC-012` under `delivery-evidence`; added concise truthful status language to the Skill Brief, Delivery Report, and README. No runtime bytes, acceptance criterion, track status, prompt, fixture, evidence artifact, evaluation status, package behavior, or scaffold state changed.
- Focused documentation suite: `node --test tests/documentation.test.js` exited `0` with 10 passing tests. Validator: `npm run validate` exited `0`.
- Final repository check: `npm run check` exited `0` with 447 tests total, 414 passed, 0 failed, and 33 skipped; the final Validator pass also exited `0`.
- Audit: `npm run audit` exited `1` fail-closed. It reported 18 `PRIVATE_PATH_DETECTED` findings: 16 immutable history findings and two pre-existing worktree findings, one in this preserved Task 10 report and one in the existing lean-evaluation test. The scanner was not weakened, no private value is reproduced here, and this does not meet the history-only audit expectation.
- Delivery gate: `npm run gate:delivery` exited `1` with the expected NOT_PASS current-byte evidence gaps: all six acceptance criteria and delivery traces remain non-passing, EVAL-001/003/004/005/006/007/008/009/010/011 remain non-passing, EVAL-002 has a different-Skill-byte mismatch, and the Brief and initialized state remain not ready. No status was changed to make this gate pass.
- Package and whitespace: `npm pack --dry-run --json --ignore-scripts` exited `0` and contained exactly `LICENSE`, `README.md`, `SKILL.md`, and `package.json`; `git diff --check` exited `0`. `SKILL.md` SHA-256 remains `026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23`.
- Complete review: the full diff and untracked-file review found only the five authorized unstaged tracked paths: this report, `README.md`, `docs/decisions.md`, `docs/skill-brief.md`, and `docs/delivery-report.md`; no untracked delivery file was present. Current private-path and sensitive-data review was performed through the unchanged audit, package whitelist was confirmed, and SCOPED Chinese-comment review is complete. This documentation-only diff adds no code comment requiring a maintenance explanation.
- No-rerun/no-claim attestation: no a6, retry, campaign rerun, Tag, Release, push, package publication, speed claim, mature-delivery claim, named-Agent support claim, percentage claim, or history-clean claim was created. The fixed 11-subject/20-percent requirement remains blocked.
- Concerns: the required audit is not history-only because of the two existing worktree findings noted above; historical private-path findings also remain immutable. These fail-closed concerns preclude any history-clean or mature-certification claim and require no change to the authorized no-rerun evidence allocation.

## Task 10C fix round 1 — current-tree private-path resolution

- RED and minimum correction: the prior audit reported 16 immutable-history findings plus two current-worktree findings. The Task 10A historical global CLI entry locator is now the semantic `<global-cli-entry>` placeholder, and the lean test uses only audit-safe reserved profile and fixture roots. The test still proves that source `HOME`, `USERPROFILE`, and `CODEX_HOME` are overwritten by the isolated subject Home and cannot appear in launch arguments or persisted summaries.
- Affected verification: `node --test --test-name-pattern="passes only the documented subject environment allowlist|matches Windows system environment names case-insensitively while replacing identity roots|captures native JSONL bytes directly and summarizes only the fresh attempt" tests/lean-evaluation.test.js` exited `0` with 3 passing tests. `node --test tests/lean-evaluation.test.js` exited `0` with 46 passing tests.
- Final check: the one final post-correction `npm run check` exited `0` with 447 tests total, 414 passed, 0 failed, and 33 skipped; its Validator pass exited `0`.
- Audit resolution: `npm run audit` exited `1` fail-closed with exactly 16 `PRIVATE_PATH_DETECTED` findings, all immutable reachable-history blobs. It reported zero current-worktree findings. The scanner and history were not changed.
- Scope and review: no production code, scanner, raw artifact, status, Skill, prompt, formal campaign fixture, package metadata, or behavior assertion changed; only audit-safe test fixture path strings changed. `npm pack --dry-run --json --ignore-scripts` exited `0` with exactly `LICENSE`, `README.md`, `SKILL.md`, and `package.json`. The full diff/untracked/sensitive/package/SCOPED-comment review is complete; all changes remain unstaged and uncommitted for controller-managed staging.

## Task 10C fix round 2 — persisted source-root assertion

- Coverage completion: the native-attempt test now directly asserts that its persisted `summary.json` excludes the audit-safe source identity root as well as the isolated subject Home. This preserves every existing assertion and catches a realistic regression where serialization of source identity roots into a persisted summary would leak the source root.
- Verification: `node --test --test-name-pattern="captures native JSONL bytes directly and summarizes only the fresh attempt" tests/lean-evaluation.test.js` exited `0` with 1 passing test. `node --test tests/lean-evaluation.test.js` exited `0` with 46 passing tests. The one final `npm run check` exited `0` with 447 tests total, 414 passed, 0 failed, and 33 skipped; its Validator pass exited `0`.
- Audit: `npm run audit` exited `1` fail-closed with exactly 16 immutable reachable-history `PRIVATE_PATH_DETECTED` findings and zero current-worktree findings. No scanner or history change occurred.
- Scope: no production edit, source-text/change-detector test, status, raw artifact, Skill, prompt, fixture, package metadata, or certification claim changed. This two-file fix round remains unstaged and uncommitted pending controller-managed exact staging.

## Task 10 final whole-branch review fix wave

- Status: **DONE_WITH_CONCERNS**. Both Important findings and the Minor finding from the approved final-review design are fixed within the five authorized paths. No real Codex subject, a6 campaign, network call, external/global environment change, staging, commit, or push occurred.
- Changed paths: `src/lean-evaluation.js`, `tests/lean-evaluation.test.js`, `README.md`, `docs/superpowers/plans/2026-08-21-development-execution-accelerator-hardening.md`, and this append-only Task 10 report.

### Systematic root cause and bounded design

- Existing a5/bootstrap evidence proves the isolated Home began without either personal Skill root, then the pilot runtime materialized `.codex/skills`. The call chain was `runLeanCampaign()` preflight -> default `runLeanAttempt()` -> `verifySubjectHome()` for every subject. The repeated startup-only absence check therefore rejected valid pilot-created runtime state before the second subject could spawn.
- Single hypothesis: preserve the initial no-personal-Skill-root check as a one-time campaign preflight, privately bind that canonical Home plus its Home, `.codex`, and auth-file filesystem identities, and let each later default attempt revalidate only that binding. The implementation uses a module-private WeakMap capability that is neither exported nor passed through attempt options. Direct `runLeanAttempt()` calls retain the original fail-closed preflight.
- Mutation contract: replacing the default campaign's private bound-attempt path with the public direct-attempt path makes the runtime-Skill-root regression fail before subject two; removing the initial campaign preflight makes the pre-existing personal-Skill-root regression fail.

### TDD evidence

1. RED command: `node --test --test-name-pattern="campaign Subject Home" tests/lean-evaluation.test.js` exited `1`: 3 tests, 1 passed, 2 failed. The runtime-root case failed at the second `runLeanAttempt()` with `Isolated subject home must not expose any user-global Skill root`; the replaced-auth case failed with `Missing expected rejection`.
2. GREEN command: the same command exited `0`: 3/3 passed. It proves a pre-existing personal Skill root is rejected before any attempt, pilot-created runtime `.codex/skills` survives later real `runLeanAttempt` boundaries, and replacing the auth file identity is rejected before the next subject.
3. Affected boundary command: `node --test --test-name-pattern="Subject Home|subject-home|subject environment|identity roots|redacts both subject-home" tests/lean-evaluation.test.js` exited `0`: 10/10 passed.
4. Lean suite: `node --test tests/lean-evaluation.test.js` exited `0`: 49/49 passed, 0 failed, 0 skipped.

### Documentation corrections

- README now states the exact fixed-campaign topology: EVAL-001, EVAL-003, EVAL-004, EVAL-008, EVAL-010, and EVAL-011. It separately requires accepted current-byte evidence for EVAL-005, EVAL-006, EVAL-007, and EVAL-009, and keeps mature delivery blocked until every gap is closed.
- The plan preserves the earlier 10-blob historical context while recording the current fail-closed audit truth: 0 current-worktree findings and 16 immutable reachable-history findings. The scanner and history were unchanged.

### Final verification and review

- The single allowed `npm run check` invocation was run once and exited `1`: 450 total, 415 passed, 2 failed, 33 skipped. One failure was the README contract's required legacy blocker wording, corrected immediately afterward. The other was an existing cross-file test race: the package dry-run read the real README while a parallel documentation negative test temporarily rewrote it, and npm returned `EOF`. The aggregate command was not repeated.
- Final-byte focused recovery: the isolated package-contract test passed; after restoring the compatible blocker wording, the isolated README lifecycle test passed. `npm run validate` exited `0`. No production expansion was needed or permitted for the cross-test race.
- Audit: `npm run audit` exited `1` fail-closed with exactly 16 immutable reachable-history `PRIVATE_PATH_DETECTED` findings and no current-worktree finding.
- Package: `npm pack --dry-run --json --ignore-scripts` exited `0` with exactly `LICENSE`, `README.md`, `SKILL.md`, and `package.json`.
- Runtime identity: `SKILL.md` remains byte-identical with SHA-256 `026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23`.
- Whitespace and safety: `git diff --check` exited `0`; the zero-context delivery diff scan found 0 private-path, private-key, bearer/basic authorization, and credential-assignment matches. All five changed paths remain unstaged, and no untracked delivery file exists.
- SCOPED Chinese-comment review is complete across the full diff and surrounding code. One concise new Chinese comment records the one-time personal-Skill preflight and private Home/auth binding invariant. Existing redaction, launcher-attestation, stream-ownership, invalid-pilot, and certification-gate comments remain accurate; no missing, redundant, obvious, or stale comment was found.
- Preserved boundaries: raw and derived redaction, verified launcher attestation, the four-field certification predicate, invalid-pilot stop, fixed subject allocation and process cap, prompts, fixtures, evaluation state, scaffold state, scanner, package metadata, and `SKILL.md` were not weakened or changed.
- Concern: the required single aggregate check did not finish green because of the corrected README expectation and the out-of-scope pre-existing package/documentation test race. Final-byte focused tests and Validator are green, but this report does not relabel the failed aggregate invocation as a pass.
