## Context

The effect-errors skill prohibits throwing in helper functions unless named `unsafe*` or `*OrThrow`. Two locations violate this:

1. **`getSourcePath()` in apply.ts:366** - Throws when remote sources aren't fetched first. This is an invariant violation (programming error).

2. **throw in `getTreeSha()` in git.ts:183** - Throws when path not found. However, this is inside `Effect.tryPromise`'s try block, so it's caught and converted to a typed `GitError` via the catch handler. This is acceptable.

## Goals / Non-Goals

**Goals:**

- Align `getSourcePath()` with the "never throw in helpers" rule
- Keep the semantic meaning (this is a programming error, not a recoverable condition)

**Non-Goals:**

- Changing the git.ts throw (it's already caught and typed via tryPromise)
- Standardizing `cause` field patterns (both `Option<unknown>` and `cause?: unknown` preserve cause)

## Decisions

### Decision 1: Rename `getSourcePath` to `getSourcePathOrThrow`

**Rationale:** The simplest fix. The function documents that remote sources must be fetched first - this is an invariant check. The `*OrThrow` naming convention makes the throwing behavior explicit, following the skill's exception rule.

**Alternatives considered:**

- Convert to `Effect<string, never>` with `Effect.die` - More Effect-pure but adds boilerplate at call site. Since this is a sync helper used once, the naming fix is sufficient.
- Convert to `Effect<string, ApplyError>` - Would require caller to handle an error that represents a bug, not a recoverable condition. Incorrect semantic.

### Decision 2: No change to git.ts

**Rationale:** The throw at line 183 is inside `Effect.tryPromise`'s `try` block. The `catch` handler wraps it as `GitError` with the original error as cause. This follows the pattern of "convert at source."

## Risks / Trade-offs

**Risk:** Future callers might not realize `getSourcePathOrThrow` throws.
**Mitigation:** The `OrThrow` suffix is a standard convention in this codebase (see `Option.getOrThrow`). JSDoc already documents the precondition.
