## Context

CLI command handlers currently depend on six Clack-specific Effect services (`ClackLog`, `ClackStream`, `ClackSpinner`, `ClackProgress`, `ClackTaskLog`, `ClackPrompt`) plus five legacy prompt wrappers (`Confirm`, `Select`, `Multiselect`, `TextInput`, `PasswordInput`). All config types, handle types, and option types are prefixed with `Clack*` and live in `clack-effect/`. The structured output layer (`ClackStructuredLive`) swaps implementations at the layer boundary, but the API surface handlers code against is Clack's vocabulary.

A standalone `writeOutput(format, schema, data, textRenderer)` function in `output.ts` handles typed result emission, requiring handlers to resolve and pass the output format themselves. This is not yet used by handlers but is wired as infrastructure.

## Goals / Non-Goals

**Goals:**

- Handlers depend on three semantic services (`Output`, `Activity`, `Input`) with our own types — no Clack types in handler signatures
- Full 1:1 method parity with existing Clack services — zero capability loss
- `writeOutput` absorbed into `Output.result()` — output format resolved by the layer, not the handler
- Clack becomes a private implementation detail of the text-mode layers
- Legacy prompt wrappers (`Confirm`, `Select`, `Multiselect`, `TextInput`, `PasswordInput`) are removed — `Input` replaces them directly
- Test layers follow the same pattern: `makeOutputTestLayer`, `makeActivityTestLayer`, `makeInputTestLayer`

**Non-Goals:**

- Backward compatibility with Clack service imports
- Changing user-visible CLI output behavior (same visual output in all modes)
- Changing structured output event schemas (NDJSON format unchanged)
- Adding new output capabilities beyond current Clack parity

## Decisions

### 1. Three services: Output, Activity, Input

**Decision:** Replace 6 Clack services + 5 legacy wrappers with 3 semantic services.

**Alternatives considered:**

- **(a) Keep 6 services, just rename** — Preserves granularity but doesn't address the core problem: handlers pull in 3-4 services for basic operations. The workflow actions layer in `command-actions.ts` captures 4+ services at construction time.
- **(b) Two services (Output + Input)** — Merges Activity into Output. Simpler provision but mixes fire-and-forget messages with lifecycle-managed operation wrappers, making the interface incoherent.
- **(c) Three services (Output + Activity + Input)** — Natural split along concern boundaries: Output = fire-and-forget, Activity = lifecycle-managed, Input = user data acquisition.

**Rationale for (c):** The split maps to a real architectural boundary. Output methods are `(string) => Effect<void>`. Activity methods are `<A, E, R>(msg, f: (handle) => Effect<A,E,R>) => Effect<A,E,R>`. Input methods are `(config) => Effect<T, AppError | PromptCancelled>`. Three distinct signatures, three services.

### 2. Service definitions and module locations

```
packages/cli/src/
  output/
    output.ts           # Output service definition + types
    output-live.ts      # Text-mode layer (imports @clack/prompts directly)
    output-structured.ts # JSON/NDJSON layer
    output-test.ts      # Test layer factory
    index.ts
  activity/
    activity.ts         # Activity service definition + types
    activity-live.ts    # Text-mode layer (imports @clack/prompts directly)
    activity-structured.ts # JSON/NDJSON layer
    activity-test.ts    # Test layer factory
    index.ts
  input/
    input.ts            # Input service definition + types
    input-live.ts       # Text-mode layer (imports @clack/prompts directly)
    input-structured.ts # Structured layer (fail with error)
    input-test.ts       # Test layer factory
    index.ts
```

`clack-effect/` is deleted entirely. The `@clack/prompts` package becomes a direct dependency of the `*-live.ts` files only — no intermediate abstraction layer. The new services ARE the abstraction boundary; if we swap Clack for another TUI library, we write new `*-live.ts` files.

Each feature folder is self-contained: service tag, types, layers, and test utilities co-located.

### 3. Output service interface

```typescript
class Output extends ServiceMap.Service<
  Output,
  {
    // Messages — 1:1 with ClackLog
    readonly message: (message: string) => Effect.Effect<void>;
    readonly info: (message: string) => Effect.Effect<void>;
    readonly success: (message: string) => Effect.Effect<void>;
    readonly step: (message: string) => Effect.Effect<void>;
    readonly warn: (message: string) => Effect.Effect<void>;
    readonly error: (message: string) => Effect.Effect<void>;
    readonly intro: (title?: string) => Effect.Effect<void>;
    readonly outro: (message?: string) => Effect.Effect<void>;
    readonly cancel: (message?: string) => Effect.Effect<void>;
    readonly note: (message: string, title?: string) => Effect.Effect<void>;
    readonly box: (message: string, title?: string, opts?: BoxOptions) => Effect.Effect<void>;

    // Streaming — consolidates 6 ClackStream methods into one
    readonly stream: <E, R>(
      level: StreamLevel,
      stream: Stream.Stream<string, E, R>,
    ) => Effect.Effect<void, AppError | E, R>;

    // Typed result — absorbs writeOutput
    readonly result: <S extends Schema.Encoder<unknown>>(
      schema: S,
      data: S["Type"],
      textRenderer: (data: S["Type"]) => string,
    ) => Effect.Effect<void>;
  }
>()("@axm.sh/cli/Output") {}

type StreamLevel = "message" | "info" | "success" | "step" | "warn" | "error";

interface BoxOptions {
  readonly contentAlign?: "left" | "center" | "right";
  readonly titleAlign?: "left" | "center" | "right";
  readonly width?: number | "auto";
  readonly titlePadding?: number;
  readonly contentPadding?: number;
  readonly rounded?: boolean;
}
```

**Example usage — simple log-only handler (skills new):**

```typescript
import { Output } from "../../../output/index.js";

export const handleSkillsNew = Effect.fn("SkillsNew.handle")(function* (
  args: SkillsNewHandlerArgs,
) {
  const output = yield* Output;

  yield* output.info("axm skills new");

  // ... validation, build plan, resolve ...

  yield* output.success(`Created skill ${fqn}`);
});
```

**Example usage — display plan with multiple log levels:**

```typescript
import { Output } from "../output/index.js";

export const displayPlan = (plan: Plan | ExecutedPlan) =>
  Effect.gen(function* () {
    const output = yield* Output;

    yield* output.info(heading);

    for (const step of allSteps) {
      switch (step.readiness) {
        case "ready":
          yield* output.success(`  + ${step.label}`);
          break;
        case "warn":
          yield* output.warn(`  ⚠ ${step.label} (${step.warnMessage})`);
          break;
        case "error":
          yield* output.error(`  ✗ ${step.label} (${step.errorMessage})`);
          break;
      }
    }

    yield* output.message(parts.join(", "));
  });
```

**Example usage — streaming text (e.g. LLM output):**

```typescript
const output = yield * Output;
const textStream = fetchLLMResponse(prompt); // Stream<string, HttpError>
yield * output.stream("info", textStream);
```

**Example usage — typed result emission:**

```typescript
const output = yield * Output;

// Handler just calls result() — the layer decides text vs json vs ndjson
yield *
  output.result(SkillListSchema, { skills: installedSkills }, (data) =>
    data.skills.map((s) => `  ${s.fqn} (${s.version})`).join("\n"),
  );
```

### 4. Activity service interface

```typescript
class Activity extends ServiceMap.Service<
  Activity,
  {
    // Spinner — indeterminate progress (1:1 with ClackSpinner)
    readonly startSpinner: (message?: string) => Effect.Effect<SpinnerHandle>;
    readonly withSpinner: <A, E, R>(
      message: string,
      f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
      options?: string | SpinnerOptions<A>,
    ) => Effect.Effect<A, E, R>;

    // Progress — determinate progress (1:1 with ClackProgress)
    readonly startProgress: (
      config: ProgressConfig,
      message?: string,
    ) => Effect.Effect<ProgressHandle>;
    readonly withProgress: <A, E, R>(
      config: ProgressConfig,
      message: string,
      f: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
      stopMessage?: string,
    ) => Effect.Effect<A, E, R>;

    // Task log — grouped hierarchical output (1:1 with ClackTaskLog)
    readonly startTaskLog: (config: TaskLogConfig) => Effect.Effect<TaskLogHandle>;
    readonly withTaskLog: <A, E, R>(
      config: TaskLogConfig,
      f: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>;

    // Tasks — sequential runner (1:1 with runTasks)
    readonly runTasks: <E, R>(tasks: ReadonlyArray<Task<E, R>>) => Effect.Effect<void, E, R>;
  }
>()("@axm.sh/cli/Activity") {}

// Handle types — our own, not Clack's

interface SpinnerHandle {
  readonly stop: (message?: string) => Effect.Effect<void>;
  readonly message: (message?: string) => Effect.Effect<void>;
  readonly cancel: (message?: string) => Effect.Effect<void>;
  readonly error: (message?: string) => Effect.Effect<void>;
  readonly clear: () => Effect.Effect<void>;
}

interface SpinnerOptions<A> {
  readonly successMessage?: string | ((value: A) => string);
  readonly failureMessage?: string;
}

interface ProgressConfig {
  readonly style?: "light" | "heavy" | "block";
  readonly max?: number;
  readonly size?: number;
}

interface ProgressHandle extends SpinnerHandle {
  readonly advance: (step?: number, message?: string) => Effect.Effect<void>;
}

interface TaskLogConfig {
  readonly title: string;
  readonly limit?: number;
  readonly retainLog?: boolean;
}

interface TaskLogGroupHandle {
  readonly message: (msg: string) => Effect.Effect<void>;
  readonly error: (message: string) => Effect.Effect<void>;
  readonly success: (message: string) => Effect.Effect<void>;
}

interface TaskLogHandle {
  readonly message: (msg: string) => Effect.Effect<void>;
  readonly group: (name: string) => Effect.Effect<TaskLogGroupHandle>;
  readonly error: (message: string) => Effect.Effect<void>;
  readonly success: (message: string) => Effect.Effect<void>;
}

interface Task<E, R> {
  readonly title: string;
  readonly task: (
    message: (msg: string) => Effect.Effect<void>,
  ) => Effect.Effect<string | void, E, R>;
  readonly enabled?: boolean;
}
```

**Example usage — withSpinner wrapping async work:**

```typescript
import { Activity } from "../../../activity/index.js";

const activity = yield * Activity;

const result =
  yield *
  activity.withSpinner("Parsing source...", () => resolveSkillInstallSource(parsed), {
    successMessage: ({ source }) => `Source: ${sources.origin(source)} (${source.type})`,
  });
```

**Example usage — withSpinner in auth login flow:**

```typescript
const output = yield * Output;
const activity = yield * Activity;

yield * output.step(`Open this URL in your browser: ${verificationUrl}`);
yield * output.step(`Enter code: ${deviceFlow.user_code}`);

const token =
  yield *
  activity.withSpinner(
    "Waiting for approval in browser...",
    () => authClient.pollDeviceToken(registryUrl, deviceFlow.device_code, deviceFlow.interval),
    { successMessage: "Login successful." },
  );
```

**Example usage — startSpinner for manual handle control:**

```typescript
const activity = yield * Activity;
const handle = yield * activity.startSpinner("Processing...");

yield * handle.message("Step 1 of 3...");
yield * doStep1();
yield * handle.message("Step 2 of 3...");
yield * doStep2();
yield * handle.message("Step 3 of 3...");
yield * doStep3();

yield * handle.stop("Processing complete");
```

**Example usage — withProgress for determinate progress:**

```typescript
const activity = yield * Activity;

yield *
  activity.withProgress(
    { max: files.length },
    "Installing files...",
    (handle) =>
      Effect.forEach(files, (file) =>
        installFile(file).pipe(Effect.tap(() => handle.advance(1, `Installed ${file.name}`))),
      ),
    "All files installed",
  );
```

**Example usage — withTaskLog for grouped output:**

```typescript
const activity = yield * Activity;

yield *
  activity.withTaskLog({ title: "Build Results", retainLog: true }, (log) =>
    Effect.gen(function* () {
      const tsGroup = yield* log.group("TypeScript");
      yield* tsGroup.message("Compiling 42 files...");
      yield* compileTs();
      yield* tsGroup.success("Compiled successfully");

      const lintGroup = yield* log.group("Lint");
      yield* lintGroup.message("Checking 42 files...");
      yield* runLint();
      yield* lintGroup.success("No issues found");

      yield* log.success("Build complete");
    }),
  );
```

**Example usage — runTasks for sequential operations:**

```typescript
const activity = yield * Activity;

yield *
  activity.runTasks([
    {
      title: "Fetching metadata",
      task: (msg) =>
        Effect.gen(function* () {
          yield* msg("Contacting registry...");
          yield* fetchMetadata();
          return "Metadata fetched";
        }),
    },
    {
      title: "Installing dependencies",
      task: (msg) =>
        Effect.gen(function* () {
          yield* msg("Resolving versions...");
          yield* installDeps();
          return "3 dependencies installed";
        }),
    },
  ]);
```

### 5. Input service interface

```typescript
class Input extends ServiceMap.Service<
  Input,
  {
    readonly text: (config: TextConfig) => Effect.Effect<string, AppError | PromptCancelled>;
    readonly password: (
      config: PasswordConfig,
    ) => Effect.Effect<string, AppError | PromptCancelled>;
    readonly confirm: (config: ConfirmConfig) => Effect.Effect<boolean, AppError | PromptCancelled>;
    readonly select: <V>(config: SelectConfig<V>) => Effect.Effect<V, AppError | PromptCancelled>;
    readonly multiselect: <V>(
      config: MultiselectConfig<V>,
    ) => Effect.Effect<ReadonlyArray<V>, AppError | PromptCancelled>;
    readonly groupMultiselect: <V>(
      config: GroupMultiselectConfig<V>,
    ) => Effect.Effect<ReadonlyArray<V>, AppError | PromptCancelled>;
    readonly selectKey: <V extends string>(
      config: SelectKeyConfig<V>,
    ) => Effect.Effect<V, AppError | PromptCancelled>;
    readonly autocomplete: <V>(
      config: AutocompleteConfig<V>,
    ) => Effect.Effect<V, AppError | PromptCancelled>;
    readonly autocompleteMultiselect: <V>(
      config: AutocompleteMultiselectConfig<V>,
    ) => Effect.Effect<ReadonlyArray<V>, AppError | PromptCancelled>;
    readonly path: (config: PathConfig) => Effect.Effect<string, AppError | PromptCancelled>;
  }
>()("@axm.sh/cli/Input") {}

// Config types — our own, structurally identical to Clack but decoupled

interface InputOption<Value> {
  readonly value: Value;
  readonly label?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

interface TextConfig {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

interface PasswordConfig {
  readonly message: string;
  readonly mask?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
  readonly clearOnError?: boolean;
}

interface ConfirmConfig {
  readonly message: string;
  readonly active?: string;
  readonly inactive?: string;
  readonly initialValue?: boolean;
  readonly vertical?: boolean;
}

interface PathConfig {
  readonly message: string;
  readonly root?: string;
  readonly directory?: boolean;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

interface SelectConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>>;
  readonly initialValue?: V;
  readonly maxItems?: number;
}

interface MultiselectConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly maxItems?: number;
  readonly required?: boolean;
  readonly cursorAt?: V;
}

interface GroupMultiselectConfig<V> {
  readonly message: string;
  readonly options: Record<string, ReadonlyArray<InputOption<V>>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
  readonly cursorAt?: V;
  readonly selectableGroups?: boolean;
  readonly groupSpacing?: number;
}

interface SelectKeyConfig<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>>;
  readonly initialValue?: V;
  readonly caseSensitive?: boolean;
}

interface AutocompleteConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>> | (() => ReadonlyArray<InputOption<V>>);
  readonly maxItems?: number;
  readonly placeholder?: string;
  readonly validate?: (value: V | ReadonlyArray<V> | undefined) => string | Error | undefined;
  readonly filter?: (search: string, option: InputOption<V>) => boolean;
  readonly initialValue?: V;
  readonly initialUserInput?: string;
}

interface AutocompleteMultiselectConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>> | (() => ReadonlyArray<InputOption<V>>);
  readonly maxItems?: number;
  readonly placeholder?: string;
  readonly validate?: (value: V | ReadonlyArray<V> | undefined) => string | Error | undefined;
  readonly filter?: (search: string, option: InputOption<V>) => boolean;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
}
```

**Example usage — confirm prompt in login flow:**

```typescript
import { Input } from "../../../input/index.js";
import { Output } from "../../../output/index.js";

const output = yield * Output;
const input = yield * Input;

const existing = yield * credStore.load(registryUrl);
if (Option.isSome(existing)) {
  yield * output.info(`Already logged in as ${existing.value.handle}.`);
  if (!flags.yes) {
    const shouldContinue =
      yield *
      input.confirm({
        message: "Log in with a different account?",
      });
    if (!shouldContinue) return;
  }
}
```

**Example usage — multiselect for skill selection:**

```typescript
const input = yield * Input;

const selectedSkills =
  yield *
  input.multiselect({
    message: "Select skills to install",
    options: discoveredSkills.map((skill) => ({
      value: skill,
      label: skill.name,
      hint: skill.description,
    })),
    required: true,
  });
```

**Example usage — select for agent configuration:**

```typescript
const input = yield * Input;

const agent =
  yield *
  input.select({
    message: "Select an agent to configure",
    options: availableAgents.map((a) => ({
      value: a.id,
      label: a.name,
      hint: `skills: ${a.skills.dir}`,
    })),
  });
```

**Example usage — text input:**

```typescript
const input = yield * Input;

const namespace =
  yield *
  input.text({
    message: "Enter your namespace",
    placeholder: "@my-org",
    validate: (value) =>
      value && !value.startsWith("@") ? "Namespace must start with @" : undefined,
  });
```

**Example usage — password input:**

```typescript
const input = yield * Input;

const token =
  yield *
  input.password({
    message: "Enter your API token",
    mask: "*",
  });
```

**Example usage — groupMultiselect:**

```typescript
const input = yield * Input;

const selected =
  yield *
  input.groupMultiselect({
    message: "Select extensions to install",
    options: {
      Skills: skills.map((s) => ({ value: s.id, label: s.name })),
      Commands: commands.map((c) => ({ value: c.id, label: c.name })),
      "MCP Servers": servers.map((m) => ({ value: m.id, label: m.name })),
    },
    selectableGroups: true,
  });
```

**Example usage — autocomplete:**

```typescript
const input = yield * Input;

const skill =
  yield *
  input.autocomplete({
    message: "Search for a skill",
    options: allSkills.map((s) => ({
      value: s,
      label: s.fqn,
      hint: s.description,
    })),
    placeholder: "Type to search...",
  });
```

**Example usage — path input:**

```typescript
const input = yield * Input;

const dir =
  yield *
  input.path({
    message: "Select workspace directory",
    directory: true,
    initialValue: process.cwd(),
  });
```

### 6. Legacy prompt wrappers are removed

The five legacy services (`Confirm`, `Select`, `Multiselect`, `TextInput`, `PasswordInput`) in `clack-effect/legacy-prompt.ts` are removed. `Input` replaces them directly. The legacy services existed because `ClackPrompt`'s config types were verbose — the new `Input` config types are already ergonomic (our own types, not Clack's).

Handlers that use legacy wrappers today migrate to `Input`:

```typescript
// Before: legacy wrapper with domain-mapping config
const multiselect = yield * Multiselect;
const selected =
  yield *
  multiselect.prompt({
    message: "Select skills",
    items: discoveredSkills,
    toOption: (s) => ({ value: s.id, label: s.name, hint: s.desc }),
  });

// After: Input.multiselect directly
const input = yield * Input;
const selected =
  yield *
  input.multiselect({
    message: "Select skills",
    options: discoveredSkills.map((s) => ({
      value: s,
      label: s.name,
      hint: s.desc,
    })),
  });
```

The `toOption` mapper pattern is replaced by inline `.map()` — standard, no abstraction needed.

### 7. Layer composition in command-runtime.ts

```typescript
// Before
import { ClackLive, ClackStructuredLive } from "./clack-effect/index.js";

const clackLayer =
  Option.isSome(explicitFormat) && explicitFormat.value !== "text"
    ? ClackStructuredLive(explicitFormat.value)
    : Layer.provide(ClackLive, cliFlagsLayer);

// After
import { OutputLive, OutputStructured } from "./output/index.js";
import { ActivityLive, ActivityStructured } from "./activity/index.js";
import { InputLive, InputStructured } from "./input/index.js";

const uiLayer =
  Option.isSome(explicitFormat) && explicitFormat.value !== "text"
    ? Layer.mergeAll(
        OutputStructured(explicitFormat.value),
        ActivityStructured(explicitFormat.value),
        InputStructured,
      )
    : Layer.mergeAll(
        Layer.provide(OutputLive, cliFlagsLayer),
        Layer.provide(ActivityLive, cliFlagsLayer),
        Layer.provide(InputLive, cliFlagsLayer),
      );
```

### 8. Output format resolution moves into the layer

Currently `resolveOutputFormat` is called by handlers and the format is threaded through. With `Output.result()`, the layer resolves the format internally:

- `OutputLive` captures the resolved format at layer construction (from `CliFlags` or explicit `--output-format`)
- `result()` dispatches: text → `textRenderer(data) → stdout`, json → `Schema.encode → stdout`, stream-json → `{ type: "result", data: encode(data) } → stdout`
- Handlers never import `OutputFormat`, `resolveOutputFormat`, or `writeOutput`

### 9. Workflow action layers simplified

The `command-actions.ts` pattern of capturing 4+ services at construction time simplifies:

```typescript
// Before: capture 4 separate services
const log = yield * Log;
const spinnerSvc = yield * Spinner;
const multiselect = yield * Multiselect;
const textInput = yield * TextInput;

const envLayer = Layer.mergeAll(
  Layer.succeed(Log, log),
  Layer.succeed(Spinner, spinnerSvc),
  Layer.succeed(Multiselect, multiselect),
  Layer.succeed(TextInput, textInput),
  // ... more services
);

// After: capture 3 semantic services
const output = yield * Output;
const activity = yield * Activity;
const input = yield * Input;

const envLayer = Layer.mergeAll(
  Layer.succeed(Output, output),
  Layer.succeed(Activity, activity),
  Layer.succeed(Input, input),
  // ... other domain services
);
```

### 10. Test layer pattern

Each service provides a test layer factory that records calls for assertion:

```typescript
// Output test layer
const [outputLayer, outputMock] = makeOutputTestLayer();
// outputMock.calls → Array<{ method: string, args: unknown[] }>

// Activity test layer
const [activityLayer, activityMock] = makeActivityTestLayer({
  withSpinner: (msg, f) => f(noopHandle), // execute the work, skip UI
});

// Input test layer — preconfigure responses
const [inputLayer, inputMock] = makeInputTestLayer({
  confirm: () => Effect.succeed(true),
  multiselect: () => Effect.succeed(["skill-a", "skill-b"]),
});
```

### 11. clack-effect/ is deleted

The `clack-effect/` directory is removed entirely. Its contents are inlined into the new service modules:

- Clack live delegation → inlined into `*-live.ts` files (direct `@clack/prompts` imports)
- Structured implementations → inlined into `*-structured.ts` files
- Service definitions, types, test layers → replaced by new service modules
- Legacy prompt wrappers → removed (Input replaces them)

`@clack/prompts` appears only in `output-live.ts`, `activity-live.ts`, and `input-live.ts`. No other file in the codebase imports it.

## Risks / Trade-offs

**Migration scope is large** — ~25 handler files, ~30 test files, plus `command-runtime.ts` and workflow layers. All imports and service references change.
→ Mitigation: Mechanical find-and-replace for most changes. The service APIs are 1:1, so handler logic doesn't change — only imports and service names.

**Three layers instead of one** — `ClackLive` was a single merged layer. Now we provide `OutputLive`, `ActivityLive`, `InputLive` separately.
→ Mitigation: Compose them at the runtime boundary with `Layer.mergeAll`. The extra composition is one line in `command-runtime.ts`.

**Config type duplication** — Our config types are structurally identical to Clack's. If Clack adds a new option, we need to add it to our types too.
→ Acceptable trade-off: This is the whole point — we own the API surface. Clack changes are opt-in additions, not breaking changes to our handlers.

**`result()` generic typing** — The `Schema.Encoder<unknown>` bound may require type annotations at some call sites.
→ Mitigation: Match the existing `writeOutput` signature exactly. If it works for `writeOutput`, it works for `result()`.
