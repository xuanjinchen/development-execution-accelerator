# development\-execution\-accelerator

Accelerates long-running implementation and verification whose solution direction is already decided. It optimizes execution order, waiting, and validation without changing upstream decisions.

## Purpose

Selection description: Accelerate already-decided long-running software-development implementation and verification. Use automatically for substantial multi-step coding, fixes, refactors, tests, migrations, builds, or configuration work with independent workstreams, long validation waits, or reusable verification; exclude short single-path changes, architecture, requirements, scope, planning, read-only review, and explicit serial/no-parallel requests.

Short single-path changes stay outside the acceleration chain even when explicitly loaded: no worker, background, wait, plan-state probe, or execution state is created. Architecture, requirements, scope, planning, read-only review, and explicit serial/no-parallel work remain with their upstream owner or normal execution path.

## Prerequisites

The runtime Skill is Markdown-only. Node.js 22 or later is required only to run this repository's validation commands; it is not a runtime dependency of the copied Skill.

## Package contents

SKILL.md is the only runtime payload. The `package.json#files` whitelist contains only `SKILL.md`; npm automatically adds package metadata, so the actual npm archive contains LICENSE, README.md, SKILL.md, and package.json.

## Local installation

Create an Agent-recognized local Skill folder named `development-execution-accelerator` and copy this repository's `SKILL.md` into that folder. Alternatively, use the local-directory Skill entry provided by your Agent to point to the directory containing the copied `SKILL.md`.

This repository provides no installer and makes no global configuration changes. This first public source push is not a Tag, GitHub Release, custom release-asset, or package-registry publication. It makes no named-Agent support claim without live evidence.

## Delivery tracks

Local usable delivery completed on 2026-08-23. This public source preparation does not make a quantitative certification, mature-delivery, named-platform, package-publication, or GitHub Release claim.

Extended certification remains required for a quantitative speed claim or mature-delivery declaration: it includes the fixed 11-subject campaign and the 20% paired-median threshold. A full Git-history audit remains required for any history-clean claim. These extended gates do not rewrite the completed local usable-delivery status.

## Minimal example

For a substantial request such as “Implement the two approved independent checkout fixes, run each focused test, and then run the required integrated gate,” the workflow can overlap independent work while preserving upstream boundaries and validation.

## Execution behavior

- **Sequential optimization:** optimize a long single critical path without ceremonial workers.
- **Worker parallelism:** require at least two medium independent implementation items and keep one writer for each file or conflict domain.
- **Wait overlap:** while a long approved command is still running, immediately perform a prepared approved action that does not depend on its result.
- **Precise validation:** preserve required checks as an immutable floor and run the smallest sufficient extra checks from cheap to broad.
- **Sequential fallback:** if workers, background commands, incremental waits, or plan-state tools are unavailable, continue safely in sequence without claiming unavailable capabilities.

## Planning boundary

This Skill starts after the solution direction is decided. If missing information would change behavior, interfaces, module boundaries, scope, or acceptance, return that question to the relevant planning or architecture owner instead of deciding it here.

## Validation

During local repository development, run:

```powershell
npm run check
```

`npm run gate:delivery` currently reports NOT_PASS because long-task selection, the single short-task zero-probe/state boundary, fallback and explicit-serial behavior, worker correctness and performance, validation reuse and local recovery, platform-neutral capability behavior, and real-work wait overlap still have pending and blocked current-byte behavior evidence. The fixed lean campaign must produce that evidence before mature delivery or any quantitative speed claim can be declared; this formal gate is not the local-installation gate described above.

```powershell
npm run gate:delivery
```

The active campaign setup is the fixed 11-subject lean runner. `evals/formal-plan.json` is an explicit supersession marker, not a second runnable campaign plan. The older `npm run eval:accelerator` recorder/analyzer remains a repository-local, one-version bounded evaluation tool only. It is not a shared or long-lived service: completed publication tombstones are intentionally retained and can accumulate, so use a fresh bounded output location for each authorized version and preserve that known limitation rather than treating the directory as reusable campaign state.

## Troubleshooting

If the long-task admission conditions do not hold, exit the acceleration chain without probing capabilities. For admitted work, use sequential optimization when overlap would not repay coordination cost. Do not repeat an unchanged failure without a new hypothesis; repair the smallest affected branch and rerun only invalidated checks plus the required validation floor.

## Removal

Delete the copied `development-execution-accelerator` local Skill directory, or remove its local-directory Skill entry. No installer state or global configuration needs cleanup.

## Security

Review copied local files before enabling them. The Skill does not require credentials, paid calls, publication, or remote installation.

## License

[Apache-2.0](LICENSE).
