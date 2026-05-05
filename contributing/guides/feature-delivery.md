# Feature Delivery Guide

Checks for planning, designing, implementing, and reviewing changes in `axm`.
Use this guide alongside OpenSpec so proposals, code changes, and docs stay in
sync from start to finish.

> [Spec-Driven Development](../../AGENTS.md#spec-driven-development) - critical
> guidance
>
> [Testing](../../AGENTS.md#testing) - verification expectations

## Key Resources

- [Spec-Driven Development](./spec-driven-development.md) - OpenSpec workflow
- [CLI Design Guide](./cli-design.md) - Command and flag conventions
- [Effect Guide](./effect.md) - Service and error patterns
- [Testing Guide](./testing.md) - Test levels and quality

---

## Proposal Alignment

Before implementation starts, confirm:

- the user problem and desired behavior are explicit
- in-scope and out-of-scope behavior are clear
- impacted commands, packages, or specs are identified
- acceptance criteria are concrete enough to test
- docs or migration follow-ups are visible up front

---

## Design Validation

Before coding deeply, confirm:

- the owning package and feature folder are clear
- command shape, flags, prompts, and output follow CLI conventions
- Effect services, layers, and error handling stay consistent with repo rules
- non-interactive and confirmation behavior are defined when relevant
- the test strategy covers the changed behavior at the right level

---

## Implementation Verification

Before calling the work complete:

- add or update the tests first when fixing a bug or changing behavior
- implement the smallest change that satisfies the requirement
- rerun the relevant quality gates (`test`, `lint`, `typecheck`, `build`, e2e
  when the CLI surface changes)
- update specs, guides, and instructions that describe the changed behavior
- verify the final behavior against the proposal, not just the implementation

---

## See Also

- [Testing Guide](./testing.md) - Behavioral and E2E coverage guidance
