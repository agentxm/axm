## Why

Code quality checks are currently ad hoc, so issues are found late and fixed inconsistently. We need a repeatable review sweep workflow aligned to `.claude/skills/code-review/SKILL.md` so teams can systematically find and fix high-impact issues before they accumulate.

## What Changes

- Define a repository-wide review sweep workflow that scopes review in deterministic passes (changed files, high-risk domains, then full baseline).
- Standardize review inputs and guidance loading so each sweep explicitly checks `CLAUDE.md`, relevant `.claude/skills/`, and `contributing/guides/` before reporting findings.
- Introduce severity-first reporting and fix tracking so findings are prioritized as correctness, safety, conventions, then style.
- Add a remediation loop that converts findings into actionable fixes and verifies fixes with targeted tests/lint/typecheck before closure.
- Add sweep outputs that include findings, commendations, coverage summary, and unresolved risk items.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- None.

## Impact

- `.claude/skills/code-review/SKILL.md` and related guidance docs for sweep-specific process details.
- CLI/domain flow for invoking review sweeps and rendering structured outputs.
- Test coverage for sweep orchestration, reporting format, and remediation state transitions.
