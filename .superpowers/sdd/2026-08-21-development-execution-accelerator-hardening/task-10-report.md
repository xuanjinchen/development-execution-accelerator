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
