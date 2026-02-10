# Design: Align CLI with cli-conventions skill

## Context

The cli-conventions skill documents the project's CLI design standards. The current implementation partially follows these conventions but has gaps in standard flags, TTY detection, error messages, and parser testing.

## Goals / Non-Goals

**Goals:**

- Full alignment with cli-conventions skill checklist items
- Standard flags available globally and per-command
- TTY-aware interactive prompts and output
- Actionable error messages with recovery guidance
- Parser unit tests for yargs validation

**Non-Goals:**

- Changing existing behavior when flags are not specified
- Adding new commands or features
- Modifying core business logic

## Decisions

### DES-1: Global Standard Flags

Add standard flags to root CLI that propagate to all commands:

```typescript
// In main.ts
yargs(...)
  .option("verbose", { alias: "v", type: "boolean", describe: "Increase output detail" })
  .option("quiet", { alias: "q", type: "boolean", describe: "Suppress non-essential output" })
  .option("json", { type: "boolean", describe: "Output as JSON" })
  .option("non-interactive", { type: "boolean", describe: "Disable all prompts" })
```

Rationale: Global flags ensure consistency across commands without duplication.

### DES-2: TTY Detection Pattern

Check TTY before interactive prompts and fancy output:

```typescript
// Before prompting
if (!process.stdin.isTTY && !args.yes) {
  return Effect.fail(new Error("Interactive mode requires TTY. Use --yes or --non-interactive."));
}

// Before fancy output
if (process.stdout.isTTY) {
  spinner.start("Loading...");
} else {
  console.error("Loading...");
}
```

Rationale: Enables CI/scripting usage while preserving interactive experience.

### DES-3: Error Message Format

Structure error messages with what happened and how to fix:

```
✗ Could not find configuration file
  Looked for: .axm/settings.json
  Run 'axm init' to create one.
```

Rationale: Reduces user friction by providing actionable recovery steps.

### DES-4: Parser Unit Test Pattern

Test yargs validation separately from Effect handlers:

```typescript
const createParser = () => yargs().command(initCommand).exitProcess(false).fail(false);

it("requires source argument", () => {
  expect(() => createParser().parse("skills add")).toThrow();
});
```

Rationale: Isolates parsing concerns from business logic for focused testing.

## Risks / Trade-offs

- **Risk:** Global flags may conflict with command-specific flags
  - Mitigation: Use consistent naming; document precedence
- **Risk:** TTY detection may break in edge cases (e.g., CI with pseudo-TTY)
  - Mitigation: `--non-interactive` flag provides explicit override

## Migration Plan

No migration needed—all changes are additive and backward compatible. Existing behavior preserved when new flags are not specified.

## Open Questions

None.
