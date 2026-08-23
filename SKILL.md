---
name: "development-execution-accelerator"
description: "Accelerate already-decided long-running software-development implementation and verification. Use automatically for substantial multi-step coding, fixes, refactors, tests, migrations, builds, or configuration work with independent workstreams, long validation waits, or reusable verification; exclude short single-path changes, architecture, requirements, scope, planning, read-only review, and explicit serial/no-parallel requests."
---

# Development Execution Accelerator

Optimize prior decisions. Never alter goals, logic, architecture, scope, boundaries, acceptance, required checks, or unrelated worktree changes.

## Admit only long execution work

First require materially long implementation or required verification. Only then check for an opportunity:

- two medium implementation items are dependency- and conflict-domain-independent;
- a long command has approved independent work and enough time beyond one tool round trip plus safety margin;
- a multi-stage long path can avoid repeated validation through input-identity reuse or local failure recovery.

Short work exits despite two independent items; long work without an opportunity exits. Artificial waits/evidence do not qualify. Exit with zero worker, background, wait, or plan-state probes and no state.

## Lock the upstream contract

Capture work, dependencies, allowed files/conflict domains, completion criteria, required-check order, and worktree changes. Schedule conservatively when unclear. Escalate behavior, interface, boundary, scope, or acceptance gaps upstream.

## Choose the cheapest useful path

Use sequential optimization for a long single critical path only under the reuse/local-recovery opportunity above.

Use workers only for at least two medium independent implementation items when savings exceed costs. Give each objective, write scope, dependencies, completion, and evidence. Keep one writer per file or upstream conflict domain; reduce concurrency for contention, conflicts, flakes, or merge cost.

For wait overlap, prepare approved independent action before the background command. On return, confirm it runs and act immediately—do not first organize evidence, poll, or wait. Complete it, then issue one bounded wait on that session; never busy-poll or invent work to prolong overlap. If ended, use the sequential result and claim no overlap. Never start dependent work before its result.

## Validate by input identity

Execute every captured required check in original order. Bind results to normalized command/workdir, relevant change/config/dependency identity, environment, outcome, and order. Reuse only a passing result at the same order position with full identity match.

Run extra checks cheapest-first: static/diff, mapped tests, affected package tests/builds, then full validation only for propagation, risk, rules, or the required gate. If uncertain, use the aggregate command.

After each branch, run its focused check. Run the integrated gate once per final input identity; repair or change that alters identity requires another run. A change invalidates only affected results; shared foundations, dependency/config changes, or gate inputs expand invalidation.

## Keep failures local

Block only dependents. Repair the earliest failure; rerun invalidated checks. Preserve independent passing results with matching identity. Never repeat an unchanged failure without a new hypothesis.

## Report only observed acceleration

Complete only when required checks pass. Report result, mode (worker parallelism, wait overlap, sequential optimization), work, checks, reuse, fallbacks, and limits. Never label background validation worker development or claim overlap after completion. Without a same-condition external baseline, report modes/actions only: no qualitative or quantitative speedup/faster claim. With no observed optimization, report `normal sequential / no observed acceleration`.
