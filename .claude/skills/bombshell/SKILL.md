---
name: bombshell
description: Bombshell prompts wrapped with Effect. Use when adding interactive prompts, spinners, or handling user cancellation in CLI commands.
user-invocable: false
---

# Bombshell Integration with Effect

Apply these patterns when wrapping Bombshell prompt APIs with Effect.

**Location:** `packages/cli/src/clack-effect/`

See CLAUDE.md "Library Wrappers" for the general Effect wrapping pattern. This skill
covers clack-specific concerns: user cancellation, TTY detection, and spinners.

---

## Wrapping Pattern

Wrap Bombshell prompts with `Effect.tryPromise` and cancellation check:

```typescript
import * as p from "@bomb.sh/clack";
import { Effect } from "effect";

export const text = (opts: Parameters<typeof p.text>[0]) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => p.text(opts),
      catch: (error) => new PromptError({ cause: error }),
    });

    if (p.isCancel(result)) {
      return yield* Effect.fail(new UserCancelled({ prompt: opts.message ?? "text" }));
    }

    return result;
  });
```

### Wrapping Checklist

- [ ] **Effect.tryPromise used** — Promise wrapped, not awaited
- [ ] **isCancel checked** — Result checked with `p.isCancel()` after yield
- [ ] **Typed error on cancel** — Cancellation yields `UserCancelled` error
- [ ] **Options preserved** — Wrapper accepts same options as original

---

## Error Types

```typescript
import { Data } from "effect";

export class UserCancelled extends Data.TaggedError("UserCancelled")<{
  readonly prompt: string;
}> {}

export class PromptError extends Data.TaggedError("PromptError")<{
  readonly cause: unknown;
}> {}

export class NotInteractiveError extends Data.TaggedError("NotInteractiveError")<{
  readonly message: string;
}> {}
```

### Error Types Checklist

- [ ] **UserCancelled** — For Ctrl+C/Escape during prompts
- [ ] **PromptError** — For unexpected prompt failures
- [ ] **NotInteractiveError** — For non-TTY environments
- [ ] **All TaggedError** — Enables `Effect.catchTag` pattern matching

---

## TTY Detection

Check before prompting:

```typescript
export const requireTTY = Effect.gen(function* () {
  if (!process.stdin.isTTY) {
    return yield* Effect.fail(
      new NotInteractiveError({
        message: "Interactive prompts require a TTY. Use flags instead.",
      }),
    );
  }
});
```

### TTY Checklist

- [ ] **Check before prompt** — TTY checked before any interactive prompt
- [ ] **Helpful error** — Non-TTY error suggests flag alternatives
- [ ] **Flag fallback** — Every prompt has `--flag` alternative

---

## Spinner Helper

Wrap long-running Effects with spinners:

```typescript
export const withSpinner = <A, E, R>(
  message: string,
  effect: Effect.Effect<A, E, R>,
  successMessage?: string,
) =>
  Effect.gen(function* () {
    const spin = p.spinner();
    spin.start(message);

    const result = yield* effect.pipe(
      Effect.tapError(() => Effect.sync(() => spin.stop("Failed", 1))),
    );

    spin.stop(successMessage ?? "Done");
    return result;
  });
```

### Spinner Checklist

- [ ] **Wraps Effect** — Helper accepts Effect, not Promise
- [ ] **Stops on error** — Spinner stops with failure indicator on error
- [ ] **Stops on success** — Spinner stops with success message on completion

---

## Non-Interactive Fallback

Flag takes precedence over prompt:

```typescript
export const promptOrFlag = <T>(
  flagValue: T | undefined,
  prompt: Effect.Effect<T, UserCancelled | NotInteractiveError>,
) =>
  flagValue !== undefined
    ? Effect.succeed(flagValue)
    : Effect.gen(function* () {
        yield* requireTTY;
        return yield* prompt;
      });
```

### Fallback Checklist

- [ ] **Flag equivalent exists** — Every prompt has a `--flag` alternative
- [ ] **Flag takes precedence** — Flag value skips prompt entirely
- [ ] **TTY check only when prompting** — No TTY check when flag provided
