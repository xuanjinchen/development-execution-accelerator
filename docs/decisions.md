# Decisions

Record requirement interpretations and superseding decisions without rewriting history.

<!-- scaffold-contract:decisions:v1 -->
```json
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
      "status": "superseded",
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
      "status": "superseded",
      "scope": "release",
      "decision": "Complete reversible local delivery only; do not push, tag, release, or upload packages.",
      "evidence": "No publication authorization was provided.",
      "supersedes": null
    },
    {
      "id": "DEC-006",
      "status": "superseded",
      "scope": "invocation",
      "decision": "Apply automatically to already-decided execution work except pure read-only code review and explicit serial or no-parallel requests; classify Fast path before any acceleration-capability probe.",
      "evidence": "Approved final-review exclusions and zero-probe Fast-path requirement dated 2026-08-20.",
      "supersedes": "DEC-002"
    },
    {
      "id": "DEC-007",
      "status": "active",
      "scope": "invocation",
      "decision": "Apply automatically only to already-decided long-running development execution; reject short tasks and use a zero-probe exit when explicit invocation has no long-task acceleration opportunity.",
      "evidence": "User's final scope clarification and approved hardening design dated 2026-08-21.",
      "supersedes": "DEC-006"
    },
    {
      "id": "DEC-008",
      "status": "superseded",
      "scope": "delivery-evidence",
      "decision": "Evaluate the unchanged Skill with a lean native codex exec --json harness capped at 12 fresh subject processes per accepted Skill version; do not continue the ACK bridge, hash-chain ledger, recovery transaction, or multi-campaign framework.",
      "evidence": "User-approved 2026-08-23 convergence and authorization to use the existing Codex login/session for the bounded future evaluation; this setup round launches no subject.",
      "supersedes": null
    },
    {
      "id": "DEC-009",
      "status": "active",
      "scope": "delivery-evidence",
      "decision": "Run one fixed fresh 11-subject campaign: three neutral long with/without pairs, one explicitly invoked short with-Skill zero-probe subject without a baseline, one wait-overlap subject, one implicit positive, one explicit-serial long near miss, and one non-scoring pilot with multi-agent disabled. The pilot proves foreground fallback and never enters performance statistics; no twelfth process or short-task timing claim is allowed.",
      "evidence": "Rulings R45-R48 resolve the Codex CLI force-load limit and cover foreground fallback without adding or biasing a scored subject.",
      "supersedes": "DEC-008"
    },
    {
      "id": "DEC-010",
      "status": "active",
      "scope": "delivery-policy",
      "decision": "Separate local usable delivery from extended certification: after explicit authorization, local installation may complete after local checks, current-content/package safety, and fresh-Agent discovery and behavior smoke even while formal evidence remains blocked.",
      "evidence": "The user approved preserving the fixed 11-subject campaign, 20 percent paired-median threshold, audit scanner, and historical findings as truthful extended-certification or public-release gates rather than local-installation blockers.",
      "supersedes": null
    },
    {
      "id": "DEC-011",
      "status": "active",
      "scope": "release",
      "decision": "Authorize preparation of a first public source push to https://github.com/xuanjinchen/development-execution-accelerator while leaving the fixed 11-subject/20 percent certification unfinished and excluding Tag, GitHub Release, custom release assets, package-registry upload, quantitative claims, mature-delivery claims, and named-platform claims.",
      "evidence": "Latest authorized public-source requirement, bound to the unchanged current SKILL.md SHA-256 026b845023e3e436be578a923fb03fce47fe569bd8909465fbe0b594a7155a23.",
      "supersedes": "DEC-005"
    },
    {
      "id": "DEC-012",
      "status": "active",
      "scope": "delivery-evidence",
      "decision": "Treat the one authorized a5 attempt as a consumed non-scoring infrastructure failure with a validator-invalid pilot; it changes no Skill, evaluation result, or status, permits no rerun, and leaves the fixed 11-subject/20 percent requirement blocked.",
      "evidence": "Task 10C truthful evidence-close brief for current-026b8450-a5.",
      "supersedes": null
    },
    {
      "id": "DEC-013",
      "status": "active",
      "scope": "delivery-evidence",
      "decision": "Record current-026b8450-a6 as one a6 pilot and zero formal subjects: authenticated ChatGPT access rejected fixed model gpt-5.6-sol before any Agent command or Skill behavior, so the campaign is infrastructure-invalid rather than a Skill failure; correctness_passed=false, performance.evaluated=false, no 20-percent result exists, certified=false, and certification remains blocked.",
      "evidence": "Task 10D independently approved raw-evidence review for current-026b8450-a6.",
      "supersedes": null
    }
  ]
}
```

## DEC-010 Rationale and Consequences

The runtime purpose is to accelerate already-decided long development tasks without changing their target or business logic, so a safe, verified local installation is useful before the broader evidence campaign is complete. Local completion therefore remains strict about current repository quality, package scope, authorization, installation safety, and fresh-Agent smoke, but it does not assert measured acceleration, mature certification, public readiness, or history cleanliness.

The fixed 11-subject campaign and 20% paired-median requirement still govern all quantitative speed claims. The full Git-history audit still governs public-release and history-clean claims. This decision does not change `SKILL.md`, formal prompts, fixtures, runner behavior, package whitelist, existing statuses, audit implementation, or `.scaffold/state.json` readiness.

## DEC-011 Rationale and Consequences

The public-source authorization supersedes the earlier local-only release decision without rewriting the local-delivery history. Its scope is intentionally limited to source preparation for the named repository. It does not authorize a Tag, GitHub Release, custom release assets, package upload, or any certification, maturity, or named-platform claim.

## DEC-012 Rationale and Consequences

The authorized a5 campaign stopped at an infrastructure-invalid pilot before any formal subject or fixture lifecycle could run. Its fail-closed validator result is therefore not accepted evidence of Skill behavior.

The consumed no-rerun allocation leaves the fixed 11-subject campaign and 20 percent paired-median requirement blocked. This decision changes no runtime bytes, evaluation result, requirement status, track status, or certification claim.

## DEC-013 Rationale and Consequences

The independently approved a6 campaign stopped after one infrastructure-invalid pilot and before every formal subject. The authenticated ChatGPT account rejected fixed model `gpt-5.6-sol` before any Agent command or Skill behavior, so this result is not a Skill behavior failure and creates no correctness, performance, 20-percent, or certification result.

No retry, extra sample, twelfth subject, threshold change, push, Tag, Release, or package publication occurred. A new fixed campaign is blocked unless compatible authenticated access to the fixed model is available and an explicit authorization is issued for a new never-before-existing campaign; this decision does not imply that one is currently authorized.
