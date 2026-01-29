---
status: active
description:
  When wrapping Bombshell (bomb.sh) Promise-based prompts with Effect; covers
  cancellation handling, TTY detection, and non-interactive fallbacks.
---

# Bombshell Integration with Effect

Patterns for wrapping Bombshell's Promise-based prompt APIs with Effect. After
reading, you should be able to wrap any Bombshell prompt to return typed Effects
with proper cancellation handling. For Bombshell API reference, see
[bomb.sh/docs](https://bomb.sh/docs).

---

## Why Wrap Prompts

Bombshell prompts return `Promise<T | symbol>` where the symbol indicates
cancellation. Wrapping with Effect provides:

- Typed errors for cancellation (catchable, not just a symbol check)
- Composition with other Effects (sequencing, fallbacks, retries)
- Testability via dependency injection
- Consistent error handling across the CLI

---

## Wrapping Pattern

Bombshell prompts must be wrapped with Effect for typed error handling. The key
insight is that `p.isCancel()` must be checked after each prompt—the symbol
return indicates user cancellation (Ctrl+C, Escape).

For wrapping pattern code and error type definitions, see the `/bombshell`
skill.

### Wrapping Pattern Checklist

- [ ] **Effect.tryPromise used** — Promise wrapped, not awaited
- [ ] **isCancel checked** — Result checked with `p.isCancel()` after await
- [ ] **Typed error on cancel** — Cancellation yields `UserCancelled` error
- [ ] **Original options preserved** — Wrapper accepts same options as original

---

## Common Prompt Wrappers

Wrappers for the most common Bombshell prompts:

```typescript
// Text input
export const text = (opts: Parameters<typeof p.text>[0]) =>
  wrapPrompt("text", () => p.text(opts), opts.message);

// Password input
export const password = (opts: Parameters<typeof p.password>[0]) =>
  wrapPrompt("password", () => p.password(opts), opts.message);

// Selection menu
export const select = <T>(opts: Parameters<typeof p.select<T>>[0]) =>
  wrapPrompt("select", () => p.select(opts), opts.message);

// Confirmation
export const confirm = (opts: Parameters<typeof p.confirm>[0]) =>
  wrapPrompt("confirm", () => p.confirm(opts), opts.message);

// Multi-select
export const multiselect = <T>(opts: Parameters<typeof p.multiselect<T>>[0]) =>
  wrapPrompt("multiselect", () => p.multiselect(opts), opts.message);

// Shared wrapper helper
const wrapPrompt = <T>(
  name: string,
  prompt: () => Promise<T | symbol>,
  message?: string,
) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: prompt,
      catch: (error) => new PromptError({ cause: error }),
    });

    if (p.isCancel(result)) {
      return yield* Effect.fail(new UserCancelled({ prompt: message ?? name }));
    }

    return result as T;
  });
```

### Common Wrappers Checklist

- [ ] **All prompts wrapped** — text, password, select, confirm, multiselect
- [ ] **Generic types preserved** — select/multiselect maintain type parameter
- [ ] **Shared helper DRY** — Common logic extracted to helper function

---

## TTY Detection

Prompts require an interactive terminal. Without TTY detection, commands fail
mysteriously when run in CI or piped contexts. Check before prompting to provide
clear error messages guiding users toward flag alternatives.

For TTY detection pattern code, see the `/bombshell` skill.

### TTY Detection Checklist

- [ ] **Check before prompt** — TTY checked before any interactive prompt
- [ ] **Helpful error** — Non-TTY error suggests flag alternatives
- [ ] **Typed error** — Uses `NotInteractiveError`, not thrown exception

---

## Non-Interactive Fallback

Every prompt should have a flag equivalent for CI/scripted use. The
`promptOrFlag` pattern provides this cleanly—flag values skip prompting
entirely, while missing flags trigger interactive prompts (with TTY check).

For non-interactive fallback pattern code, see the `/bombshell` skill.

### Non-Interactive Fallback Checklist

- [ ] **Flag equivalent exists** — Every prompt has a `--flag` alternative
- [ ] **Flag takes precedence** — Flag value skips prompt entirely
- [ ] **TTY check only when prompting** — No TTY check when flag provided

---

## Spinner Integration

Spinners wrap long-running operations to provide visual feedback. The key
pattern is wrapping an Effect (not a Promise) so the spinner integrates with
Effect's error handling—stopping with failure indicator on error, success
message on completion.

For spinner helper pattern code, see the `/bombshell` skill.

### Spinner Checklist

- [ ] **Wraps Effect** — Spinner helper accepts Effect, not Promise
- [ ] **Stops on error** — Spinner stops with failure indicator on error
- [ ] **Stops on success** — Spinner stops with success message on completion
- [ ] **Custom messages** — Start and stop messages configurable

---

## Service Pattern (Optional)

For complex CLIs, encapsulate prompts in an Effect service:

```typescript
const make = () => {
  const textPrompt = (opts: Parameters<typeof p.text>[0]) =>
    Effect.gen(function* () {
      // ... wrapping logic
    });

  const selectPrompt = <T>(opts: Parameters<typeof p.select<T>>[0]) =>
    Effect.gen(function* () {
      // ... wrapping logic
    });

  return { text: textPrompt, select: selectPrompt };
};

export type PromptService = ReturnType<typeof make>;
export const PromptService = Context.GenericTag<PromptService>("PromptService");

export const PromptServiceLive = Layer.succeed(PromptService, make());

// Test layer with pre-canned responses
export const makeTestPromptService = (responses: Map<string, unknown>) =>
  Layer.succeed(PromptService, {
    text: (opts) => Effect.succeed(responses.get(opts.message) as string),
    select: (opts) => Effect.succeed(responses.get(opts.message)),
  });
```

### Service Pattern Checklist

- [ ] **Service when testing needed** — Use service pattern when mocking prompts
- [ ] **Test layer provided** — Includes layer with pre-canned responses
- [ ] **Simple functions default** — Use direct wrappers when testing not needed

---

## Error Types Summary

Three error types cover all prompt failure modes:

- **UserCancelled** — User pressed Ctrl+C or Escape during a prompt
- **PromptError** — Unexpected prompt failure (rare, usually TTY issues)
- **NotInteractiveError** — Attempted prompt in non-TTY environment

For error type definitions with code, see the `/bombshell` skill.

### Error Types Checklist

- [ ] **Three error types** — UserCancelled, PromptError, NotInteractiveError
- [ ] **All TaggedError** — Enables `Effect.catchTag` pattern matching
- [ ] **Context included** — Each error includes relevant context

---

## Integration Checklist

Use this checklist when integrating Bombshell prompts with Effect:

- [ ] **Prompts wrapped** — All Bombshell calls wrapped with Effect
- [ ] **Cancellation typed** — `isCancel` results become `UserCancelled` errors
- [ ] **TTY checked** — Interactive prompts check `process.stdin.isTTY`
- [ ] **Flags provided** — Every prompt has non-interactive flag alternative
- [ ] **Spinners use Effect** — Spinner helpers wrap Effects, not Promises
- [ ] **Errors are tagged** — All errors extend `Data.TaggedError`

---

## See Also

- `/bombshell` skill — Ready-to-use code patterns for wrapping, TTY, spinners
- [Clack Documentation](https://bomb.sh/docs/clack/) — Official prompt API
  reference
- [CLI Design Guidelines](cli-design-guidelines.md) — Broader CLI design context
