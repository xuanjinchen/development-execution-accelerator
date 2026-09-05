# Agent Development Rules

1. The project's only objective is to accelerate already-decided software-development execution.
2. Never change task goals, business logic, required behavior, scope, interfaces, or mandatory checks to obtain speed.
3. Do not take ownership of architecture, requirements, planning, or business decisions; consume their approved outputs.
4. Remove redundant work before adding concurrency. Use parallel implementation only for independent conflict domains and keep one writer per domain.
5. Use the zero-overhead sequential path when coordination cannot repay its cost.
6. Follow TDD for runtime behavior changes: observe RED, implement the minimum GREEN, then refactor without changing behavior.
7. Run focused checks during development. Run `npm test` and `npm pack --dry-run --json` once for the final input identity.
8. Preserve unrelated worktree changes. Review the complete diff and code comments before completion.
9. Do not stage, commit, push, tag, publish, release, or use credentials without explicit user authorization.
