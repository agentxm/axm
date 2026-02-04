## Context

The CLI currently has partial JSON output support:

- Global `--json` flag in main.ts
- `--json` flag on `skills install` and `skills uninstall` commands
- `--json` flag on `init` command (unused)
- JSON conversion utilities in `workspace/plan.ts` (`planToJson`, `sourceToJson`, `stepToJson`)
- JSON type exports (`PlanJson`, `PlanStepJson`, `SkillSourceJson`)

Only dry-run plan output is implemented. The feature is incomplete and adds complexity without delivering value.

## Goals / Non-Goals

**Goals:**

- Remove all JSON output code and flags
- Simplify handler logic by removing `showOutput = !args.json` conditionals
- Remove unused type exports from core package
- Update E2E tests that rely on JSON output

**Non-Goals:**

- Adding alternative machine-readable output formats
- Preserving backward compatibility

## Decisions

### 1. Remove global --json flag

Remove from main.ts rather than keeping it as a deprecated no-op.

**Rationale:** Clean break is simpler than deprecation warnings. The feature was never documented or promoted.

### 2. Remove JSON utilities from core

Delete `planToJson`, `sourceToJson`, `stepToJson` and associated types from `workspace/plan.ts`.

**Rationale:** These utilities are only used by the JSON output feature. No other consumers exist.

### 3. Update E2E tests

Modify `skills-install-dry-run.test.ts` to verify dry-run behavior without JSON output. Use exit code and stderr/stdout text assertions instead.

**Rationale:** Tests should verify the dry-run feature works, not the JSON serialization.

## Risks / Trade-offs

**[Breaking change for scripts]** → Low risk. Feature was incomplete and undocumented. No known external consumers.

**[Test coverage reduction]** → Mitigated by keeping dry-run tests with text-based assertions.
