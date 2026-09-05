---
name: development-execution-accelerator
description: Accelerate already-decided software-development implementation and verification by eliminating redundant work, selecting useful parallelism, reusing valid checks, and rerunning only invalidated validation; use for coding, fixes, refactors, tests, migrations, builds, or configuration work, while leaving public interfaces, task goals, business logic, required behavior, scope, mandatory checks, architecture, requirements, planning, and business decisions unchanged.
---

# Development Execution Accelerator

The only objective is to accelerate task progress. Never change public interfaces, task goal, business logic, required behavior, scope, or mandatory checks to make work appear faster.

## Lock the upstream contract

Architecture, requirements, planning, and business decisions remain upstream, and this Skill consumes only approved outputs.

Before optimizing, capture only the facts already decided upstream:

- completion criteria and business invariants;
- allowed files, modules, and conflict domains;
- dependency order and explicit serial constraints;
- mandatory checks and their required order;
- unrelated worktree changes that must remain untouched.

Return unresolved architecture, requirements, planning, interface, scope, or acceptance decisions to their owner. Do not decide them here.

## Remove waste first

Use existing context and the narrowest relevant reads. Eliminate repeated repository scans, duplicate investigation, duplicate implementation, repeated passing checks, unnecessary full-suite runs, busy polling, and evidence-only ceremony.

Do not create work merely to keep a worker or background command occupied. Do not repeat an unchanged failure without a new hypothesis.

## Select the cheapest useful path

### Zero-overhead sequential path

Use the zero-overhead sequential path when the task is small, tightly coupled, already on one short critical path, or coordination cannot repay its cost. Do not probe worker, background, wait, or plan-state capabilities. Do not create acceleration state or ceremonial workers.

### Parallel implementation

Use parallel implementation only when at least two already-decided work items are dependency-independent and belong to separate conflict domains, and the coordination benefit exceeds its overhead.

Give each worker one objective, allowed write scope, dependencies, completion criteria, and focused check. Keep one writer per conflict domain. Do not invent parallel work, duplicate investigation, or split coupled changes to manufacture concurrency.

### Wait overlap

Overlap a long command only with useful approved work that does not depend on its result. Prepare that work before starting the command, confirm the command is still running, perform the independent work, then wait once. Never busy-poll or claim overlap after the command has already finished.

## Validate by input identity

Never remove, weaken, or reorder an upstream-required check.

Bind a reusable result to its normalized command, working directory, relevant code/config/dependency identity, environment assumptions, outcome, and required-order position. Reuse a passing result only while that input identity remains valid.

After each changed branch, run its smallest focused check. Run the required integrated gate once for the final input identity. A change invalidates only results affected by that change; shared foundations, dependencies, configuration, or gate inputs may expand the invalidation set.

## Keep failures local

Repair the earliest failing branch. Preserve independent passing results and rerun only invalidated checks plus the mandatory final gate. If the impact cannot be determined safely, use the project's existing aggregate check rather than guessing.

## Finish with evidence

Complete only after every mandatory check passes. Report:

- execution mode: sequential, parallel implementation, or wait overlap;
- work completed and conflict-domain ownership;
- focused and integrated checks actually run;
- results reused and the input identity that justified reuse;
- results invalidated and rerun;
- fallbacks, failures, and remaining limits.

Without a same-condition baseline, report actions and evidence only. Do not claim an unmeasured speed percentage.
