# development-execution-accelerator

A Markdown-only Skill with one purpose: accelerate already-decided software-development execution without changing the task goal, business logic, scope, or mandatory checks.

## What it optimizes

- removes repeated scans, duplicate investigation, duplicate implementation, busy polling, and repeated passing checks;
- uses parallel implementation only for independent conflict domains;
- uses a low-overhead sequential path for small or coupled work;
- reuses validation only when its input identity still matches;
- reruns only checks invalidated by a change, then runs the mandatory final gate once.

Architecture, requirements, interfaces, business decisions, and acceptance criteria remain with their upstream owner.

## Install

Copy `SKILL.md` into an Agent-recognized Skill directory named `development-execution-accelerator`, or configure the Agent to load this directory as a local Skill.

The runtime requires no script, service, credential, or platform-specific adapter.

## Verify locally

Requires Node.js 22 or later.

```powershell
npm test
npm pack --dry-run --json
```

The package whitelist publishes only `SKILL.md`; npm automatically includes package metadata, `LICENSE`, and `README.md`.

## License

Apache-2.0.
