## Context

CLI behavior flags (`--yes`, `--non-interactive`, `--force`, `--preview`) are currently:

1. **Defined per-command** — each command's yargs builder independently declares `--yes`, `--force`, `--preview`, and `--non-interactive` with inconsistent defaults (e.g., `init` sets `default: false` on `--non-interactive`, defeating CI/TTY auto-detection).
2. **Resolved in multiple places** — `workspace/service.ts` and `skills/install/command-actions.ts` each independently run `Option.getOrElse(nonInteractive, () => CI || !isInteractive())`.
3. **Passed through two channels** — commands pass raw flag values to both handler args and `WorkspaceContextOptions`, requiring each handler to know how to resolve them.
4. **Not guarded at the prompt layer** — `ClackPromptService` always calls through to Clack. If a prompt is reached in non-interactive mode, it hangs rather than failing fast.

The `--non-interactive` flag is already global in `main.ts`, but `--yes`, `--force`, and `--preview` are not.

## Goals / Non-Goals

**Goals:**

- Single point of resolution for all behavior flags, evaluated once at program startup
- Global flag definitions — no per-command boilerplate for `--yes`, `--force`, `--preview`, `--non-interactive`
- `WorkspaceContextOptions` contains only workspace identity (scope, agents) — behavior flags live in `CliFlags`
- Prompt service fails fast when called in non-interactive mode
- Handlers read resolved booleans from `CliFlags` instead of carrying raw `Option<boolean>` values

**Non-Goals:**

- Backward compatibility with the current `WorkspaceContextOptions` shape
- Adding new flags (e.g., `--json`, `--quiet`) — those are separate concerns for future work
- Changing Clack/Bombshell library internals — we guard at our service boundary

## Decisions

### 1. `CliFlags` as an Effect service tag

Introduce `CliFlags` as a `Context.Tag` with a simple data interface:

```typescript
export interface CliFlagsService {
  readonly nonInteractive: boolean; // resolved: flag → CI → TTY
  readonly yes: boolean; // explicit --yes only (not implied)
  readonly force: boolean;
  readonly preview: boolean;
}
```

**Key decision: `yes` stores only the explicit `--yes` flag.**

Consumers compose the semantics they need:

| Question                         | Expression                            |
| -------------------------------- | ------------------------------------- |
| Should I show this prompt?       | `!flags.nonInteractive`               |
| Should I skip this confirmation? | `flags.yes \|\| flags.nonInteractive` |
| Should I auto-apply a preview?   | `flags.yes` (explicit only)           |
| Should I override plan errors?   | `flags.force`                         |

This avoids a `resolvedYes` computed property that conflates two different intents. The preview dry-run behavior (`--preview --non-interactive` without `--yes`) falls out naturally: preview checks `flags.yes`, which is `false` when only `--non-interactive` was passed.

**Alternative considered:** A `resolvedYes` field that is `yes || nonInteractive`. Rejected because it forces the preview logic to peek behind the abstraction at the original `yes` value to distinguish "yes because explicit" from "yes because non-interactive." Keeping them separate is cleaner.

### 2. File location

`packages/cli/src/cli-flags/service.ts` with barrel `packages/cli/src/cli-flags/index.ts`.

Follows the project convention of feature-per-folder with co-located service, types, and tests.

### 3. Resolution chain in the layer constructor

The `CliFlags` layer resolves `nonInteractive` using the existing chain:

1. Explicit `--non-interactive` flag (if provided)
2. `process.env["CI"] === "true"`
3. `!process.stdin.isTTY`

This logic currently lives in `workspace/service.ts` and `command-actions.ts`. It moves into the `CliFlags` layer constructor, which accepts raw argv values (`Option<boolean>` for `nonInteractive`, plain booleans for the rest):

```typescript
export interface CliFlagsInput {
  readonly nonInteractive: Option.Option<boolean>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const layer = (input: CliFlagsInput): Layer.Layer<CliFlags> =>
  Layer.succeed(CliFlags, {
    nonInteractive: Option.getOrElse(
      input.nonInteractive,
      () => process.env["CI"] === "true" || !isInteractive(),
    ),
    yes: input.yes,
    force: input.force,
    preview: input.preview,
  });
```

**Alternative considered:** Resolving all flags from `process.argv` directly inside the layer, bypassing yargs. Rejected because yargs already handles alias expansion (`-y` → `yes`), defaults, and type coercion — duplicating that would be fragile.

### 4. Global flag definitions in `main.ts`

Move `--yes`, `--force`, and `--preview` to `main.ts` alongside `--non-interactive`:

```typescript
.option("yes", { alias: "y", type: "boolean", describe: "...", default: false })
.option("force", { alias: "f", type: "boolean", describe: "...", default: false })
.option("preview", { type: "boolean", describe: "...", default: false })
.option("non-interactive", { type: "boolean", describe: "..." })  // no default — preserves Option.none()
```

`--non-interactive` intentionally has **no default** so `Option.fromNullable(undefined)` produces `Option.none()`, triggering the CI/TTY auto-detection fallback.

Per-command `.option()` calls for these four flags are removed from all command builders.

### 5. `run()` constructs and provides the `CliFlags` layer

The `run()` function in `runtime/index.ts` accepts `CliFlagsInput` and constructs the layer:

```typescript
export function run<A>(
  program: Effect.Effect<A, AppError | PromptCancelled, AppLayer>,
  options: { readonly flags: CliFlagsInput; readonly workspace?: WorkspaceInit },
): Promise<A>;
```

The `CliFlags` layer is always provided. The workspace layer is optional and depends on `CliFlags` (it yields `CliFlags` internally instead of resolving independently).

`AppLayer` type is extended to include `CliFlags`.

### 6. `WorkspaceContextOptions` shrinks

Remove `yes`, `nonInteractive`, `preview`, and `force`:

```typescript
export interface WorkspaceContextOptions {
  readonly scope: WorkspaceScope;
  readonly agents: Option.Option<readonly string[]>;
}
```

The `make()` function yields `CliFlags` to access resolved values:

```typescript
const make = (options: WorkspaceContextOptions) =>
  Effect.gen(function* () {
    const flags = yield* CliFlags;
    // use flags.nonInteractive, flags.yes, etc.
  });
```

### 7. `WorkspaceContextService` interface shrinks

Remove `nonInteractive` and `preview` fields from the service interface. Code that currently reads `workspace.nonInteractive` switches to `yield* CliFlags`.

The `resolvePlan` method continues to live on the workspace service (it needs lockfile state and source config), but reads flags from `CliFlags` internally rather than from closure variables.

### 8. Prompt service fail-fast guard

`ClackPromptService` gains a dependency on `CliFlags`. Every prompt method checks `flags.nonInteractive` before calling Clack:

```typescript
const guardedPrompt = <T>(thunk: () => Promise<T | symbol>) =>
  Effect.gen(function* () {
    const flags = yield* CliFlags;
    if (flags.nonInteractive) {
      return yield* makeAppError({
        code: "PROMPT_IN_NON_INTERACTIVE",
        what: "Interactive prompt reached in non-interactive mode",
        howToFix: Option.some(
          "This is a bug — the handler should bypass this prompt when --non-interactive is set",
        ),
      });
    }
    return yield* wrapPrompt(thunk);
  });
```

This means `ClackPromptLive` changes from a simple `Layer.succeed` to a `Layer.effect` that yields `CliFlags`. The `ClackPrompt` tag's error channel gains `AppError` (already the case).

### 9. Handler arg types drop duplicated fields

Handler args that carry `nonInteractive: Option<boolean>` (e.g., `InstallHandlerArgs`, `UpdateHandlerArgs`) drop that field. Handlers that need to branch on interactivity yield `CliFlags` directly:

```typescript
const handleInstall = (args: InstallHandlerArgs) =>
  Effect.gen(function* () {
    const flags = yield* CliFlags;
    // use flags.nonInteractive for skill selection branching
  });
```

Similarly, `command-actions.ts` files that currently resolve `nonInteractive` independently simply yield `CliFlags`.

### 10. Test layer

A `CliFlagsTest` helper provides a simple layer for tests:

```typescript
export const CliFlagsTest = (overrides?: Partial<CliFlagsService>) =>
  Layer.succeed(CliFlags, {
    nonInteractive: true,
    yes: false,
    force: false,
    preview: false,
    ...overrides,
  });
```

Defaults to `nonInteractive: true` for tests (no prompts in test runs). Tests that need interactive behavior explicitly set `nonInteractive: false`.

## Risks / Trade-offs

**Broad surface area** — This touches every command file, handler, and test. Most changes are mechanical (remove per-command flag definitions, remove fields from handler args, add `CliFlags` to test layers).
→ Mitigation: Changes are repetitive and greppable. Run `pnpm typecheck` after each phase to catch missed wiring.

**`--yes` and `--force` appear in `--help` for commands that don't use them** — E.g., `axm skills list --help` will show `--yes` even though list doesn't prompt.
→ Acceptable trade-off. Standard practice in major CLIs (kubectl, gh, docker). Consistency outweighs per-command help purity.

**Prompt fail-fast changes error semantics** — A prompt reached in non-interactive mode currently hangs; after this change it fails with `PROMPT_IN_NON_INTERACTIVE`. Any handler that doesn't properly guard prompts will now surface an `AppError` instead of silently hanging.
→ This is the desired behavior — bugs become visible instead of silent.
