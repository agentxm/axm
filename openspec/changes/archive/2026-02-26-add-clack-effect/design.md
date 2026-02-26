## Context

The CLI currently uses Ink (React for terminals) for interactive prompts. Each prompt is a React component rendered via `ink`'s `render()`, wrapped in `Effect.async` to bridge the callback-based Ink API into Effect. The `tui/` module provides Effect services (`Confirm`, `Select`, `TextInput`, etc.) with live layers and test layers.

`@clack/prompts` is a lightweight alternative that returns `Promise<T | symbol>` — cancellation produces a symbol detected via `isCancel()`. This is a much simpler wrapping target than Ink's render/unmount/callback pattern.

The `clack-effect` module will live alongside `tui/` — no existing code changes. Handlers can adopt it incrementally.

## Goals / Non-Goals

**Goals:**

- Wrap the full `@clack/prompts` API as Effect services
- Follow established patterns from `tui/` (Context.Tag services, live layers, test layers)
- Map Clack's cancel symbol to the existing `PromptCancelled` error
- Make every service independently providable and testable

**Non-Goals:**

- Migrating any existing handler from `tui/` to `clack-effect`
- Removing or modifying the `tui/` module
- Wrapping `@clack/core` internals — only the `@clack/prompts` public API
- Supporting `CommonOptions` fields (`input`, `output`, `signal`, `withGuide`) in the Effect wrappers — these are low-level concerns managed by Clack's global `updateSettings` and are not needed in service interfaces

## Decisions

### 1. Service granularity: grouped by function category

The `tui/` module has one service per prompt type (Confirm, Select, etc.). For `clack-effect`, group related functions into fewer services to reduce boilerplate while keeping services independently testable:

| Service         | Wraps                                                                                                                                      | Error type                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `ClackPrompt`   | `text`, `password`, `confirm`, `select`, `multiselect`, `groupMultiselect`, `selectKey`, `autocomplete`, `autocompleteMultiselect`, `path` | `CliError \| PromptCancelled`      |
| `ClackLog`      | `log.*` methods, `intro`, `outro`, `cancel` (session framing), `note`, `box`                                                               | _(none)_                           |
| `ClackSpinner`  | `spinner` (raw handle + scoped `withSpinner`)                                                                                              | _(none — handle methods are sync)_ |
| `ClackProgress` | `progress` (extends spinner with `advance` + scoped `withProgress`)                                                                        | _(none — handle methods are sync)_ |
| `ClackTaskLog`  | `taskLog` (live subprocess-style output with groups)                                                                                       | _(none — handle methods are sync)_ |
| `ClackStream`   | `stream.*` methods                                                                                                                         | `CliError \| E`                    |

Note on `ClackLog.cancel`: This is a session-framing message (like `intro`/`outro`) — it displays a styled cancellation message. It is not an action. Distinct from `ClackSpinnerHandle.cancel` which stops a spinner with cancel styling.

**Why not one service per function?** Clack's prompts share a common pattern (`Promise<T | symbol>` → check `isCancel`). Grouping reduces the number of tags, layers, and test helpers without losing testability — tests can still assert on individual method calls.

**Why not a single monolithic service?** Display functions (`log`, `note`) have no error channel, while prompts fail with `PromptCancelled`. Separating them keeps service interfaces honest.

**Alternative considered:** Mirror `tui/` with one service per prompt. Rejected — too much boilerplate for the wrapping layer; the consolidation is appropriate since these wrappers are thin.

### 2. Cancellation mapping

Clack prompts return `T | symbol`. The wrapper uses `isCancel()` to detect cancellation and maps it to the existing `PromptCancelled` error:

```typescript
const wrapPrompt = <T>(thunk: () => Promise<T | symbol>) =>
  Effect.tryPromise({
    try: () => thunk(),
    catch: (error) =>
      makeCliError({ code: "PROMPT_RENDER_FAILED", what: "Prompt failed", cause: error }),
  }).pipe(
    Effect.flatMap((result) =>
      isCancel(result)
        ? Effect.fail(new PromptCancelled({ message: "Operation cancelled." }))
        : Effect.succeed(result as T),
    ),
  );
```

`wrapPrompt` accepts a thunk (not a `Promise`) so the prompt doesn't start executing before Effect has control. It lives as a private function in `prompt/service.ts`.

This reuses the existing `PromptCancelled` type so handlers don't need to handle a new error.

### 3. Spinner wrapping: raw handle + scoped `withSpinner`

Clack's `spinner()` returns a mutable handle with `start`/`stop`/`message`/`cancel`/`error`/`clear` methods. The Effect wrapper provides **two** APIs:

**Raw handle** — for cases where spinner lifetime spans multiple operations and the stop message depends on work results (like `install/handler.ts` where `stop("Source: ...")` uses a dynamic message):

```typescript
interface ClackSpinnerHandle {
  readonly stop: (message?: string) => Effect.Effect<void>
  readonly message: (message?: string) => Effect.Effect<void>
  readonly cancel: (message?: string) => Effect.Effect<void>
  readonly error: (message?: string) => Effect.Effect<void>
  readonly clear: () => Effect.Effect<void>
}

readonly start: (message?: string) => Effect.Effect<ClackSpinnerHandle>
```

**Scoped `withSpinner`** — for the common case where a spinner wraps a single block of work. Uses `Effect.matchCauseEffect` to style the spinner's terminal state based on the outcome:

- **Success** → `handle.stop(stopMessage ?? message)`
- **Failure** (expected error) → `handle.error(message)` (reverts to the start text — "Installation complete" on error would be wrong)
- **Interruption** → `handle.cancel()`

```typescript
readonly withSpinner: <A, E, R>(
  message: string,
  f: (handle: ClackSpinnerHandle) => Effect.Effect<A, E, R>,
  stopMessage?: string,
) => Effect.Effect<A, E, R>
```

The scoped variant eliminates leaked spinners — if the wrapped effect fails or is interrupted, the spinner is cleaned up automatically with the appropriate visual style. This avoids the need for a global `stopAll` escape hatch like the current `tui/Spinner`.

`ClackProgress` mirrors the same dual API (including outcome-based styling). It extends the spinner handle with `advance` and provides both `start` (raw handle) and `withProgress` (scoped) for consistency:

```typescript
interface ClackProgressHandle extends ClackSpinnerHandle {
  readonly advance: (step?: number, message?: string) => Effect.Effect<void>
}

readonly start: (config: ClackProgressConfig, message?: string) => Effect.Effect<ClackProgressHandle>
readonly withProgress: <A, E, R>(
  config: ClackProgressConfig,
  message: string,
  f: (handle: ClackProgressHandle) => Effect.Effect<A, E, R>,
  stopMessage?: string,
) => Effect.Effect<A, E, R>
```

### 4. Display functions: synchronous Effect.sync wrappers

`log.*`, `intro`, `outro`, `cancel`, `note`, and `box` are synchronous void functions. Wrap them with `Effect.sync`:

```typescript
readonly info: (message: string) => Effect.Effect<void>
// Implementation: Effect.sync(() => clack.log.info(message))
```

No error channel needed — these never fail in practice.

### 5. Stream wrapping

`stream.*` methods accept `Iterable | AsyncIterable` and return `Promise<void>`. The Effect wrapper accepts only `Stream<string, E, R>` — no raw iterables:

```typescript
readonly info: <E, R>(stream: Stream.Stream<string, E, R>) => Effect.Effect<void, CliError | E, R>
```

The wrapper converts the Stream to an `AsyncIterable` via `Stream.toReadableStream` before forwarding to Clack. Callers use `Stream.make("a", "b")` for literals or `Stream.fromAsyncIterable(iter, identity)` for external async sources. This keeps the API uniform with consistent error typing and no runtime type dispatch.

### 6. Tasks: Effect-native implementation, not a Clack wrapper

Clack's `tasks()` is a ~10-line for-loop over `spinner.start`/`stop`. Wrapping it with `Effect.tryPromise` would make errors opaque, prevent interruption, and block concurrency.

Instead, provide `runTasks` as a plain function (not a service) that takes `ClackSpinner` from the Effect environment. No separate service tag or layer needed — the `ClackSpinner` dependency flows naturally through `R`:

```typescript
interface ClackTask<E, R> {
  readonly title: string;
  readonly task: (
    message: (msg: string) => Effect.Effect<void>,
  ) => Effect.Effect<string | void, E, R>;
  readonly enabled?: boolean;
}

// Plain function, not a service — ClackSpinner is required in R
const runTasks = <E, R>(
  tasks: ReadonlyArray<ClackTask<E, R>>,
): Effect.Effect<void, E, ClackSpinner | R> =>
  Effect.gen(function* () {
    const s = yield* ClackSpinner;
    yield* Effect.forEach(
      tasks.filter((t) => t.enabled !== false),
      (task) =>
        s.withSpinner(task.title, (handle) =>
          Effect.map(
            task.task((msg) => handle.message(msg)),
            (result) => result ?? task.title,
          ),
        ),
      { concurrency: 1 },
    );
  });
```

Callers get `ClackSpinner` for free via `ClackLive`. Key differences from wrapping Clack's `tasks()`:

- **Typed errors** — each task's errors flow through the Effect channel
- **Interruption** — the task sequence can be interrupted mid-run
- **Effect-native task bodies** — tasks return `Effect` instead of `Promise`, composing naturally with services
- **Automatic spinner cleanup** — uses `withSpinner` internally

### 7. TaskLog wrapping

Clack's `taskLog` returns a mutable handle with live output and group sub-handles. Wrap as its own `ClackTaskLog` service since it's structurally similar to spinner (handle-based), not to fire-and-forget `log.*` methods:

```typescript
interface ClackTaskLogGroupHandle {
  readonly message: (msg: string) => Effect.Effect<void>
  readonly error: (message: string) => Effect.Effect<void>
  readonly success: (message: string) => Effect.Effect<void>
}

interface ClackTaskLogHandle {
  readonly message: (msg: string) => Effect.Effect<void>
  readonly group: (name: string) => Effect.Effect<ClackTaskLogGroupHandle>
  readonly error: (message: string) => Effect.Effect<void>
  readonly success: (message: string) => Effect.Effect<void>
}

interface ClackTaskLogConfig {
  readonly title: string
  readonly limit?: number
  readonly retainLog?: boolean
}

// Service method
readonly start: (config: ClackTaskLogConfig) => Effect.Effect<ClackTaskLogHandle>
```

### 8. Config types: mirror Clack's option types

Define config interfaces that mirror Clack's option types but omit `CommonOptions` fields (`input`, `output`, `signal`, `withGuide`). Use `Option` for optional fields where it adds clarity, but keep simple optional properties (`placeholder?: string`) as-is for thin wrappers.

Non-generic prompts (text, password, confirm):

```typescript
interface ClackTextConfig {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}
```

Selection prompts use a generic `Value` parameter so the return type matches the option values:

```typescript
interface ClackSelectConfig<V> {
  readonly message: string
  readonly options: ReadonlyArray<{ value: V; label?: string; hint?: string }>
  readonly initialValue?: V
}

// Service method — generic flows from config to return type
readonly select: <V>(config: ClackSelectConfig<V>) => Effect.Effect<V, CliError | PromptCancelled>
```

Same pattern for `multiselect` (returns `ReadonlyArray<V>`), `groupMultiselect`, `selectKey`, `autocomplete`, and `autocompleteMultiselect`.

### 9. Test layers: call-recording pattern

Follow the established `tui/` test layer pattern. Each service gets a `makeXxxTestLayer` function that returns `[Layer, MockService]`. Mock services record calls and return configurable responses:

```typescript
interface MockClackPromptService extends ClackPromptService {
  readonly calls: { method: string; config: unknown }[];
}
```

For prompts, support configurable behaviors (return value or cancel) — same as `tui/confirm/test.ts` pattern.

### 10. Move `PromptCancelled` to a shared location

`PromptCancelled` currently lives in `tui/errors.ts`. If `clack-effect` re-exports from `tui/`, it creates a coupling — when `tui/` is eventually removed, `clack-effect` breaks.

Move `PromptCancelled` to `packages/cli/src/prompt-cancelled.ts`. Both `tui/errors.ts` and `clack-effect/index.ts` re-export from there. When `tui/` is removed, nothing breaks.

This is a small refactor: move one class definition, update import paths in `tui/errors.ts` to re-export from the new location. Existing consumer imports (`from "@/tui"`) continue to work unchanged.

### 11. Don't wrap `group` — `Effect.gen` replaces it

Clack's `group()` provides sequential prompt composition with shared results and per-step cancellation. In an Effect codebase, `Effect.gen` already does all of this natively with better type safety — each `yield*` is a sequential step, results are in scope as local variables, and `PromptCancelled` propagates automatically.

Wrapping `group` would require complex type gymnastics around `PromptGroup<T>` and `PromptGroupAwaitedReturn<T>` to produce a result that's strictly worse than `Effect.gen`. Don't wrap it.

### 12. File organization

```
packages/cli/src/clack-effect/
  prompt/
    service.ts          # ClackPrompt service, tag, live layer
    test.ts             # Test layer + mock
    types.ts            # Config types for each prompt
    index.ts            # Barrel
  log/
    service.ts          # ClackLog service (log.*, intro, outro, cancel, note, box)
    test.ts
    index.ts
  spinner/
    service.ts          # ClackSpinner service (start + withSpinner)
    test.ts
    types.ts            # SpinnerHandle
    index.ts
  progress/
    service.ts          # ClackProgress service
    test.ts
    types.ts            # ProgressHandle
    index.ts
  task-log/
    service.ts          # ClackTaskLog service (live output with groups)
    test.ts
    types.ts            # TaskLogHandle, TaskLogGroupHandle, TaskLogConfig
    index.ts
  stream/
    service.ts          # ClackStream service
    test.ts
    index.ts
  tasks.ts              # Effect-native runTasks function (composes ClackSpinner)
  index.ts              # Barrel: all services, layers, test helpers, ClackLive
```

Top-level `index.ts` exports a merged `ClackLive` layer (like `TuiLive`).

## Usage Examples (Before / After)

Each example shows the raw `@clack/prompts` API (Promise-based) and the equivalent Effect-based API using the `clack-effect` services.

### Text Input

**Before — raw Clack:**

```typescript
import { text, isCancel } from "@clack/prompts";

const name = await text({
  message: "What is your name?",
  placeholder: "John Doe",
  validate: (value) => {
    if (!value || value.length < 2) return "Name must be at least 2 characters";
    return undefined;
  },
});

if (isCancel(name)) {
  process.exit(0);
}
```

**After — Effect:**

```typescript
const p = yield * ClackPrompt;

const name =
  yield *
  p.text({
    message: "What is your name?",
    placeholder: "John Doe",
    validate: (value) => {
      if (!value || value.length < 2) return "Name must be at least 2 characters";
      return undefined;
    },
  });
// Cancellation automatically becomes PromptCancelled in the error channel
```

### Password

**Before — raw Clack:**

```typescript
import { password, isCancel } from "@clack/prompts";

const secret = await password({
  message: "Enter your token:",
  mask: "*",
});

if (isCancel(secret)) {
  process.exit(0);
}
```

**After — Effect:**

```typescript
const p = yield * ClackPrompt;

const secret = yield * p.password({ message: "Enter your token:", mask: "*" });
```

### Confirm

**Before — raw Clack:**

```typescript
import { confirm, isCancel } from "@clack/prompts";

const shouldProceed = await confirm({
  message: "Do you want to continue?",
});

if (isCancel(shouldProceed)) {
  process.exit(0);
}

if (!shouldProceed) {
  console.log("Aborted.");
}
```

**After — Effect:**

```typescript
const p = yield * ClackPrompt;
const l = yield * ClackLog;

const shouldProceed = yield * p.confirm({ message: "Do you want to continue?" });

if (!shouldProceed) {
  yield * l.info("Aborted.");
}
```

### Select

**Before — raw Clack:**

```typescript
import { select, isCancel } from "@clack/prompts";

const framework = await select({
  message: "Pick a framework",
  options: [
    { value: "next", label: "Next.js", hint: "React framework" },
    { value: "astro", label: "Astro", hint: "Content-focused" },
    { value: "svelte", label: "SvelteKit", hint: "Compile-time framework" },
  ],
});

if (isCancel(framework)) {
  process.exit(0);
}
```

**After — Effect:**

```typescript
const p = yield * ClackPrompt;

const framework =
  yield *
  p.select({
    message: "Pick a framework",
    options: [
      { value: "next", label: "Next.js", hint: "React framework" },
      { value: "astro", label: "Astro", hint: "Content-focused" },
      { value: "svelte", label: "SvelteKit", hint: "Compile-time framework" },
    ],
  });
// framework is typed as string — no symbol to check
```

### Multiselect

**Before — raw Clack:**

```typescript
import { multiselect, isCancel } from "@clack/prompts";

const features = await multiselect({
  message: "Select features",
  options: [
    { value: "eslint", label: "ESLint" },
    { value: "prettier", label: "Prettier" },
    { value: "vitest", label: "Vitest" },
  ],
  required: true,
});

if (isCancel(features)) {
  process.exit(0);
}
```

**After — Effect:**

```typescript
const p = yield * ClackPrompt;

const features =
  yield *
  p.multiselect({
    message: "Select features",
    options: [
      { value: "eslint", label: "ESLint" },
      { value: "prettier", label: "Prettier" },
      { value: "vitest", label: "Vitest" },
    ],
    required: true,
  });
// features is typed as string[] — cancellation is in the error channel
```

### Group Multiselect

**Before — raw Clack:**

```typescript
import { groupMultiselect, isCancel } from "@clack/prompts";

const tools = await groupMultiselect({
  message: "Define your project",
  options: {
    Testing: [
      { value: "vitest", hint: "Vite-native testing" },
      { value: "playwright", hint: "End-to-end testing" },
    ],
    "Code quality": [
      { value: "prettier", hint: "Code formatter" },
      { value: "eslint", hint: "Linter" },
    ],
  },
});

if (isCancel(tools)) {
  process.exit(0);
}
```

**After — Effect:**

```typescript
const p = yield * ClackPrompt;

const tools =
  yield *
  p.groupMultiselect({
    message: "Define your project",
    options: {
      Testing: [
        { value: "vitest", hint: "Vite-native testing" },
        { value: "playwright", hint: "End-to-end testing" },
      ],
      "Code quality": [
        { value: "prettier", hint: "Code formatter" },
        { value: "eslint", hint: "Linter" },
      ],
    },
  });
```

### Autocomplete

**Before — raw Clack:**

```typescript
import { autocomplete, isCancel } from "@clack/prompts";

const framework = await autocomplete({
  message: "Search for a framework",
  options: [
    { value: "next", label: "Next.js" },
    { value: "astro", label: "Astro" },
    { value: "svelte", label: "SvelteKit" },
  ],
  placeholder: "Type to search...",
});

if (isCancel(framework)) {
  process.exit(0);
}
```

**After — Effect:**

```typescript
const p = yield * ClackPrompt;

const framework =
  yield *
  p.autocomplete({
    message: "Search for a framework",
    options: [
      { value: "next", label: "Next.js" },
      { value: "astro", label: "Astro" },
      { value: "svelte", label: "SvelteKit" },
    ],
    placeholder: "Type to search...",
  });
```

### Path

**Before — raw Clack:**

```typescript
import { path, isCancel } from "@clack/prompts";

const selectedPath = await path({
  message: "Select a file:",
  root: process.cwd(),
});

if (isCancel(selectedPath)) {
  process.exit(0);
}
```

**After — Effect:**

```typescript
const p = yield * ClackPrompt;

const selectedPath = yield * p.path({ message: "Select a file:", root: process.cwd() });
```

### Spinner (raw handle)

For cases where the stop message depends on work results:

**Before — raw Clack:**

```typescript
import { spinner } from "@clack/prompts";

const spin = spinner();
spin.start("Parsing source...");
const source = await resolveSource(input);
spin.stop(`Source: ${source.origin} (${source.type})`);
```

**After — Effect (raw handle):**

```typescript
import { ClackSpinner } from "@/clack-effect";

const s = yield * ClackSpinner;
const handle = yield * s.start("Parsing source...");
const source = yield * resolveSource(input);
yield * handle.stop(`Source: ${source.origin} (${source.type})`);
```

### Spinner (scoped `withSpinner`)

For the common case where a spinner wraps a block of work. Spinner is automatically stopped on success, error, or interruption:

**Before — raw Clack:**

```typescript
import { spinner } from "@clack/prompts";

const spin = spinner();
spin.start("Installing dependencies");
spin.message("Linking packages");
// if this throws, spinner keeps rendering...
await linkPackages();
spin.stop("Installation complete");
```

**After — Effect (scoped):**

```typescript
import { ClackSpinner } from "@/clack-effect";

const s = yield * ClackSpinner;
yield *
  s.withSpinner(
    "Installing dependencies",
    (handle) =>
      Effect.gen(function* () {
        yield* handle.message("Linking packages");
        yield* linkPackages();
        // spinner auto-stops on success or error — no leaked spinners
      }),
    "Installation complete",
  );
```

### Progress (raw handle)

**Before — raw Clack:**

```typescript
import { progress } from "@clack/prompts";

const prog = progress({ style: "heavy", max: 100, size: 40 });
prog.start("Processing files");
prog.advance(10);
prog.advance(25, "Processing images...");
prog.stop("All files processed");
```

**After — Effect (raw handle):**

```typescript
const p = yield * ClackProgress;

const handle = yield * p.start({ style: "heavy", max: 100, size: 40 }, "Processing files");
yield * handle.advance(10);
yield * handle.advance(25, "Processing images...");
yield * handle.stop("All files processed");
```

### Progress (scoped `withProgress`)

**After — Effect (scoped):**

```typescript
const p = yield * ClackProgress;

yield *
  p.withProgress(
    { style: "heavy", max: 100, size: 40 },
    "Processing files",
    (handle) =>
      Effect.gen(function* () {
        yield* handle.advance(10);
        yield* handle.advance(25, "Processing images...");
        // progress bar auto-stops on success or error
      }),
    "All files processed",
  );
```

### Tasks

**Before — raw Clack:**

```typescript
import { tasks } from "@clack/prompts";

await tasks([
  {
    title: "Downloading package",
    task: async () => "Download completed",
  },
  {
    title: "Linking",
    task: async () => "Package linked",
  },
]);
```

**After — Effect:**

Instead of wrapping Clack's `tasks()` (which swallows errors and blocks interruption), use the Effect-native `runTasks` that composes `ClackSpinner.withSpinner` with `Effect.forEach`:

```typescript
import { runTasks } from "@/clack-effect";

yield *
  runTasks([
    {
      title: "Downloading package",
      task: (message) =>
        Effect.gen(function* () {
          yield* downloadPackage();
          return "Download completed";
        }),
    },
    {
      title: "Linking",
      task: (message) =>
        Effect.gen(function* () {
          yield* linkPackages();
          return "Package linked";
        }),
    },
  ]);
// Errors are typed, interruption works, spinners auto-cleanup
```

### Log

**Before — raw Clack:**

```typescript
import { log } from "@clack/prompts";

log.info("No files to update");
log.warn("Directory is empty, skipping");
log.error("Permission denied on file src/secret.js");
log.success("Installation complete");
log.step("Check files");
log.message("Entering directory");
```

**After — Effect:**

```typescript
import { ClackLog } from "@/clack-effect";

const l = yield * ClackLog;
yield * l.info("No files to update");
yield * l.warn("Directory is empty, skipping");
yield * l.error("Permission denied on file src/secret.js");
yield * l.success("Installation complete");
yield * l.step("Check files");
yield * l.message("Entering directory");
```

### Intro / Outro / Cancel

**Before — raw Clack:**

```typescript
import { intro, outro, cancel } from "@clack/prompts";

intro("Welcome to my-cli");
// ... prompts ...
outro("All done!");

// Or on cancellation:
cancel("Installation cancelled");
```

**After — Effect:**

```typescript
import { ClackLog } from "@/clack-effect";

const l = yield * ClackLog;
yield * l.intro("Welcome to my-cli");
// ... prompts ...
yield * l.outro("All done!");

// Or on cancellation:
yield * l.cancel("Installation cancelled");
```

### Note / Box

**Before — raw Clack:**

```typescript
import { note, box } from "@clack/prompts";

note("You can edit the file src/index.jsx", "Next steps.");
box("Content of the box", "Box Title", { contentAlign: "center", rounded: true });
```

**After — Effect:**

```typescript
import { ClackLog } from "@/clack-effect";

const l = yield * ClackLog;
yield * l.note("You can edit the file src/index.jsx", "Next steps.");
yield * l.box("Content of the box", "Box Title", { contentAlign: "center", rounded: true });
```

### Stream

**Before — raw Clack:**

```typescript
import { stream } from "@clack/prompts";

await stream.info(
  (async function* () {
    yield "Processing...";
    yield " done\n";
  })(),
);

await stream.step(["Job1...", " done\n", "Job2...", " done"]);
```

**After — Effect:**

```typescript
import { Stream, pipe } from "effect";
import { ClackStream } from "@/clack-effect";

const s = yield * ClackStream;

// Simple literals
yield * s.info(Stream.make("Processing...", " done\n"));

yield * s.step(Stream.make("Job1...", " done\n", "Job2...", " done"));

// Effectful pipeline — errors propagate through the Effect channel
const lines = pipe(
  Stream.fromIterable(files),
  Stream.mapEffect((file) => readAndFormat(file)),
);
yield * s.step(lines);
```

### TaskLog

**Before — raw Clack:**

```typescript
import { taskLog } from "@clack/prompts";

const log = taskLog({ title: "Building project" });

const tsGroup = log.group("Compiling TypeScript");
tsGroup.message("Processing src/index.ts...");
tsGroup.message("Processing src/utils.ts...");
tsGroup.success("TypeScript compiled");

log.success("Build complete");
```

**After — Effect:**

```typescript
import { ClackTaskLog } from "@/clack-effect";

const tl = yield * ClackTaskLog;
const handle = yield * tl.start({ title: "Building project" });

const tsGroup = yield * handle.group("Compiling TypeScript");
yield * tsGroup.message("Processing src/index.ts...");
yield * tsGroup.message("Processing src/utils.ts...");
yield * tsGroup.success("TypeScript compiled");

yield * handle.success("Build complete");
```

### Group (Prompt Sequencing) — use `Effect.gen` instead

Clack's `group` is not wrapped. `Effect.gen` replaces it with better type safety:

**Before — raw Clack:**

```typescript
import { group, text, password } from "@clack/prompts";

const account = await group(
  {
    email: () => text({ message: "What is your email?" }),
    username: ({ results }) =>
      text({
        message: "What is your username?",
        placeholder: results.email?.replace(/@.+$/, "").toLowerCase() ?? "",
      }),
    password: () => password({ message: "Define your password" }),
  },
  {
    onCancel: () => {
      process.exit(0);
    },
  },
);
```

**After — Effect:**

```typescript
import { ClackPrompt } from "@/clack-effect";

const p = yield * ClackPrompt;

const email = yield * p.text({ message: "What is your email?" });

const username =
  yield *
  p.text({
    message: "What is your username?",
    placeholder: email.replace(/@.+$/, "").toLowerCase(),
  });

const pw = yield * p.password({ message: "Define your password" });
// If any prompt is cancelled, PromptCancelled propagates automatically
// No onCancel needed — Effect.gen propagates errors naturally
```

## Risks / Trade-offs

**[Clack API instability]** → Clack is pre-1.0. Pin to a specific version. The wrapper is thin enough that API changes are easy to absorb.

**[Duplicate prompt abstractions]** → Both `tui/` and `clack-effect/` will exist simultaneously. This is intentional for incremental migration. → Document clearly that `clack-effect/` is the forward path.

**[Validate function compatibility]** → Clack's `validate` returns `string | Error | undefined` while the existing `tui/` uses `string | undefined`. → Accept Clack's signature as-is in the wrapper types — handlers will adapt at the call site.

**[GroupMultiselect and autocomplete complexity]** → These prompts have more complex option types. → Mirror Clack's types directly rather than inventing abstractions.
