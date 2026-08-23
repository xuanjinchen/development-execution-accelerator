# Skill Brief

Skill: development\-execution\-accelerator
Objective: Accelerate already\-decided long\-running development and verification work across coding agents without changing task goals\, business logic\, architecture\, scope\, or required acceptance criteria\.
Initialized: 2026\-08\-19
License: Apache\-2\.0

<!-- scaffold-contract:skill-brief:v1 -->
```json
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
    },
    {
      "id": "CONFLICT-003",
      "summary": "The previous automatic invocation rule included pure read-only code review and explicit serial or no-parallel execution despite their approved exclusions.",
      "status": "resolved",
      "resolution": "Exclude pure read-only code review and explicit serial or no-parallel requests while continuing to accelerate other already-decided execution work."
    },
    {
      "id": "CONFLICT-004",
      "summary": "The latest requirement narrows invocation from every execution task back to long-running development tasks only.",
      "status": "resolved",
      "resolution": "Automatically select only already-decided long-running implementation or verification work; reject short tasks and use a zero-probe exit if the Skill is explicitly invoked without a long-task acceleration opportunity."
    },
    {
      "id": "CONFLICT-005",
      "summary": "The Task 9 delivery and evaluation path expanded into a campaign framework far beyond the evidence needed to evaluate the unchanged Skill behavior.",
      "status": "resolved",
      "resolution": "Keep the current Skill bytes and acceptance objective unchanged, and converge delivery evidence on exactly one fresh 11-subject codex exec --json campaign: one non-scoring foreground-fallback pilot with multi-agent disabled, three long with/without pairs, one explicit short with-Skill run, one wait-overlap run, one implicit positive, and one explicit-serial long near miss. Only the three long pairs require byte-identical neutral prompts."
    },
    {
      "id": "CONFLICT-006",
      "summary": "The prior delivery wording conflated usable local completion with mature evidence certification and public-release history cleanliness.",
      "status": "resolved",
      "resolution": "Use two tracks: local usable delivery requires unchanged runtime bytes, passing repository checks and Validator, clean current content, the exact package whitelist, safe authorized installation, and fresh-Agent discovery and behavior smoke; extended certification retains the fixed 11-subject campaign and 20 percent paired-median gate, while full Git-history audit remains a public-release/history-clean gate."
    },
    {
      "id": "CONFLICT-007",
      "summary": "The local-only/no-publication direction conflicts with the later authorization for a first public source push.",
      "status": "resolved",
      "resolution": "Prepare the public source repository while preserving the unchanged Skill bytes, incomplete fixed 11-subject/20 percent certification, and exclusion of Tag, GitHub Release, custom release assets, package-registry upload, quantitative claims, mature-delivery claims, and named-platform claims."
    }
  ],
  "acceptance_criteria": [
    {
      "id": "REQ-001",
      "requirement": "Automatically apply only to already-decided long-running software-development execution tasks without requiring the user to mention acceleration.",
      "verification": "Pending current-byte implicit-positive discovery and explicit-serial long near-miss discovery from fresh native JSONL subjects; the lean sample is bounded evidence, not a broad selector benchmark.",
      "status": "pending"
    },
    {
      "id": "REQ-002",
      "requirement": "Reject non-long tasks at selection or exit their explicitly invoked acceleration chain with zero worker, background, wait, or plan-state probes and no acceleration state.",
      "verification": "Pending one current-byte explicitly invoked $development-execution-accelerator short subject whose trace has zero worker, background, wait, or plan-state probes and creates no acceleration state. There is no short baseline or wall-clock claim.",
      "status": "pending"
    },
    {
      "id": "REQ-003",
      "requirement": "Parallelize only independent work while preserving one writer per conflict domain.",
      "verification": "Blocked pending three accepted current-byte long with/without pairs from native JSONL. Unblock only if all quality and one-writer constraints pass and the paired median is at least 20 percent lower than the no-Skill baseline.",
      "status": "blocked"
    },
    {
      "id": "REQ-004",
      "requirement": "Run the smallest sufficient validation without removing upstream-required checks.",
      "verification": "Blocked pending ordered native JSONL evidence that focused checks precede the aggregate gate, required commands are not skipped or duplicated, and one real-work action completes strictly inside the wait-overlap command interval.",
      "status": "blocked"
    },
    {
      "id": "REQ-005",
      "requirement": "Degrade safely when workers, background commands, incremental waiting, or plan-state tools are unavailable.",
      "verification": "Pending a current-byte non-scoring pilot run with multi-agent disabled as a foreground-fallback preflight plus an explicit-serial long near miss with zero unsupported acceleration probes. The pilot never enters performance statistics, and the fixed campaign has no twelfth process.",
      "status": "pending"
    },
    {
      "id": "REQ-006",
      "requirement": "Remain platform-neutral and distinguish capability-protocol compatibility from named-Agent support.",
      "verification": "Blocked pending accepted native JSONL worker, foreground-fallback pilot, guarded explicit-serial long near-miss, and wait-overlap evidence expressed through capabilities rather than named-Agent claims.",
      "status": "blocked"
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
      "evidence": "required:Replace the superseded all-execution-task selector with current-byte long-task positive and short-task negative discovery evidence.;impact:Automatic invocation is not proven for the narrowed long-task-only scope.;skill-sha256:026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23",
      "unblock_condition": "Attach passing current-byte trigger evidence bound to the final Skill hash."
    },
    "multi-agent": {
      "status": "blocked",
      "evidence": "required:Obtain a current-byte EVAL-008 run whose approved independent implementation and focused test occur strictly inside the real corpus-command interval.;impact:Background wait-overlap capability and the complete multi-agent protocol remain unproven.;skill-sha256:026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23",
      "unblock_condition": "Attach passing real-work EVAL-008 background-overlap evidence, then refresh the capability-protocol artifact and its delivery claim without adding named-Agent support."
    },
    "installer": {
      "status": "disabled",
      "evidence": "A standard local Skill directory is sufficient; no managed user configuration is required.",
      "unblock_condition": ""
    },
    "open-source-release": {
      "status": "enabled",
      "evidence": "artifact:SKILL.md#sha256:026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23",
      "unblock_condition": ""
    }
  },
  "prompt_budget": {
    "limit_tokens": 2250,
    "measured_tokens": 2199,
    "evidence": "artifact:evals/results/prompt-budget.txt#sha256:8737aef12e19bff7dda315d39635621f65e8ab9f53e37c3c09981136df681d0d"
  }
}
```

## Evidence References

Evidence Contract v1 uses field-specific repository-relative references.

- `artifact:path#sha256` means `artifact:<path>#sha256:<64 lowercase hex digest>`.
- `path:` means `path:<path>` for delivery implementation.
- `eval:` means `eval:<evaluation-id>[,<evaluation-id>...]` from `evals/evals.json`, such as `eval:EVAL-001,EVAL-002`.

Enabled tracks, prompt budgets, evaluation results, and capability claims use `artifact:` evidence. An enabled track artifact must be `SKILL.md` itself or contain `Skill SHA-256 evaluated: \`<current-digest>\``. Disabled tracks record a non-empty reason. Blocked tracks use exactly `required:<work>;impact:<delivery-impact>;skill-sha256:<current-digest>` and a non-empty `unblock_condition`.

Use stable IDs for conflicts and acceptance criteria. Acceptance criteria record a measurable requirement, verification method, and status. The matching requirement entry in `docs/delivery-report.md` places `path:` in `implementation` and `eval:` in `verification`; adding those fields to an acceptance criterion would violate the strict schema. The Gate checks the recorded contract but does not run an Agent or prove that a model actually produced the result.

## Delivery Tracks

Local usable delivery completed on 2026-08-23. The blocked requirement and track statuses above remain truthful extended-certification evidence: the fixed 11-subject campaign and its 20 percent paired-median threshold gate any quantitative speed claim, and a full Git-history audit gates history-clean claims. The enabled `open-source-release` track is limited to public source-repository preparation and is evidenced by the unchanged current `SKILL.md` hash; it excludes Tag, GitHub Release, custom release assets, package-registry upload, quantitative certification, mature-delivery, and named-platform claims.
