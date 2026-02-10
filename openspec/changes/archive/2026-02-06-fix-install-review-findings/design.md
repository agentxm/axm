## Context

The `skills install` module is under active development. A code review identified 10 findings across handler.ts, command.ts, command.test.ts, discover-skills.ts, and skill-utils.ts. The findings fall into three categories:

1. **Build-breaking**: Dead `Console.log` referencing a removed import
2. **Correctness**: Missing `--non-interactive` yargs option; `Option.fromNullable` on yargs defaults always producing `Some(false)` instead of `None`
3. **Convention/quality**: Native array methods where Effect `Array` is expected, duplicated test helpers, misleading stub output, empty section headers

## Goals / Non-Goals

**Goals:**

- Fix the compile error so the module builds
- Correct the yargs/Option boundary so `--dry-run` and `--non-interactive` produce `Option.none()` when unspecified
- Expose `--non-interactive` as a CLI-settable flag
- Align array usage with Effect `Array` module conventions
- Clean up misleading stub output and dead code
- Deduplicate test helper

**Non-Goals:**

- Implementing the incomplete handler steps (agents loading, plan building, plan application) — these are separate changes
- Changing discovery algorithm behavior
- Modifying error types or error handling patterns

## Decisions

### 1. Remove yargs defaults for Option-mapped flags

**Decision**: Remove `default: false` from `--dry-run` and `--non-interactive` in the yargs builder. When the user doesn't pass these flags, yargs will provide `undefined`, which `Option.fromNullable` correctly maps to `Option.none()`.

**Alternative considered**: Keep defaults and use `Option.some(false)` everywhere. Rejected because it conflates "user explicitly passed `--no-dry-run`" with "user didn't specify", losing information that downstream code may need.

**Note**: The `--dry-run` default removal means `argv["dry-run"]` becomes `boolean | undefined`. The existing `Option.fromNullable` call in command.ts handles this correctly without further changes.

### 2. Dead code removal vs. commenting

**Decision**: Remove the `Console.log` call on line 205 entirely rather than commenting it out. Also remove the empty "V2 Dependencies" section. Dead code and empty placeholders add noise.

**Alternative considered**: Comment with TODO. Rejected — the `Console.log` was debug logging with no informational value; the ops are already available in scope for any future debugging.

### 3. Stub steps: TODO comments over throwing

**Decision**: Mark incomplete handler steps (11, 14, outro) with `// TODO:` comments and remove the broken partial success message. The handler will `outro` with a generic placeholder instead of an incomplete string.

**Alternative considered**: Throw `Effect.die("not implemented")` at the incomplete steps. Rejected — the handler is exercised in tests and the incomplete steps are known WIP, not invariant violations.

### 4. Effect Array adoption scope

**Decision**: Replace native `.map()` / `.filter()` with Effect `Array.map` / `Array.filter` only in files that already import `effect/Array`. This covers handler.ts, discover-skills.ts, and skill-utils.ts. The skill-utils.ts file will gain an `import * as Array from "effect/Array"`.

**Alternative considered**: Leave skill-utils.ts with native methods since it's pure (no Effect). Rejected for codebase consistency — CLAUDE.md calls for Effect collection types in signatures and the file's consumers already use Effect `Array`.

### 5. Test helper extraction

**Decision**: Extract `createCapturingMock` in command.test.ts to a single module-level declaration shared by both `describe` blocks.

## Risks / Trade-offs

- **[Risk] Removing `--dry-run` default changes argv type** → The `Option.fromNullable` wrapper already handles `undefined`, so no downstream breakage. Existing tests that parse `["install", "owner/repo"]` will get `undefined` for `dry-run` instead of `false`, but they don't assert on this field's raw value.

- **[Risk] `--non-interactive` flag addition is a public API surface change** → Low risk since the handler already accepts it; this just makes it user-accessible. No backward compatibility concern since it was previously inaccessible.

- **[Trade-off] TODO comments for incomplete steps** → Leaves dead-end code paths. Acceptable because completing these steps is tracked as separate work and the TODOs make the incomplete state explicit.
