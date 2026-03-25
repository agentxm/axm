## Context

The CLI currently uses three services for output: `Output` (semantic logging via Clack), `Activity` (spinners, progress, task logs), and format-specific variants (`OutputStructured`, `ActivityStructured`) for JSON/NDJSON modes. A `ui-layer.ts` factory selects between live and structured implementations based on `OutputFormat`.

This works for chrome output but has gaps: no typed data output path (handlers use raw `process.stdout.write(JSON.stringify(...))`), no table/list primitives, coarse verbosity (boolean verbose/debug), and informal stdout/stderr separation.

The `--output-format text|json|stream-json` flag conflates format selection with streaming semantics. The `stream-json` mode exists because some commands are long-running and need progress events, but this is a property of the command, not a user choice.

## Goals / Non-Goals

**Goals:**

- Single service surface for all output: chrome, data display, and machine output
- Typed data output via `result()` / `resultStream()` with per-command schemas
- Four-level verbosity with conditional emission helpers
- Systematic stdout/stderr channel separation
- Test renderer that captures structured calls without ANSI parsing
- Table and tree rendering styled to Clack's visual language

**Non-Goals:**

- Interactive prompt redesign — CliPrompt stays a separate service with its existing interface; this change codifies its relationship to CliRenderer but does not alter prompt behavior
- Telemetry/observability output changes
- Preserving CliEnvironment — this change removes CliEnvironment entirely (its responsibilities are absorbed by Verbosity, nonInteractiveFlag, and per-command flags)
- Error formatting changes — AppError rendering in `--json` mode is out of scope; current runtime-envelope error handling behavior is preserved. The `MachineRenderer` does not serialize errors to stdout; errors flow through the existing `handleError` path in `runCliMain`
- `--jq` or `--template` post-processing flags
- Third-party table library adoption (custom formatter preferred)

## Decisions

### 1. Consolidate Output + Activity into CliRenderer

**Decision:** Replace `Output` and `Activity` with a single `CliRenderer` service.

**Alternatives considered:**

- (a) Keep Output + Activity separate, add a third DataOutput service → three services is already the pain point; adding a fourth makes it worse
- (b) Keep Output, merge Activity into it, add data methods → renaming Output to CliRenderer is clearer about the expanded scope
- (c) Single CliRenderer → chosen

**Rationale:** Handlers currently import two services for basic "show spinner, log result" flows. A single service reduces import boilerplate, simplifies layer wiring (one implementation switch instead of two), and makes the API discoverable — all output goes through one place.

The CliRenderer service shape:

```typescript
class CliRenderer extends ServiceMap.Service<
  CliRenderer,
  {
    // Chrome (stderr in both modes; NDJSON log events on stderr in machine mode)
    readonly intro: (title: string) => Effect<void>;
    readonly outro: (message: string) => Effect<void>;
    readonly message: (message: string) => Effect<void>;
    readonly info: (message: string) => Effect<void>;
    readonly success: (message: string) => Effect<void>;
    readonly step: (message: string) => Effect<void>;
    readonly warn: (message: string) => Effect<void>;
    readonly error: (message: string) => Effect<void>;
    readonly cancel: (message?: string) => Effect<void>;
    readonly note: (message: string, title?: string) => Effect<void>;
    readonly box: (message: string, title?: string, opts?: BoxOptions) => Effect<void>;
    readonly streamLog: <E, R>(level: LogLevel, stream: Stream<string, E, R>) => Effect<void, E, R>;
    readonly spinner: (message: string) => Effect<SpinnerHandle>;
    readonly withSpinner: <A, E, R>(
      message: string,
      f: (handle: SpinnerHandle) => Effect<A, E, R>,
      options?: SpinnerOptions<A>,
    ) => Effect<A, E, R>;
    readonly progress: (config: ProgressConfig, message?: string) => Effect<ProgressHandle>;
    readonly withProgress: <A, E, R>(
      config: ProgressConfig,
      message: string,
      f: (handle: ProgressHandle) => Effect<A, E, R>,
      stopMessage?: string,
    ) => Effect<A, E, R>;
    readonly taskLog: (config: TaskLogConfig) => Effect<TaskLogHandle>;
    readonly withTaskLog: <A, E, R>(
      config: TaskLogConfig,
      f: (handle: TaskLogHandle) => Effect<A, E, R>,
    ) => Effect<A, E, R>;
    readonly runTasks: <E, R>(tasks: ReadonlyArray<Task<E, R>>) => Effect<void, E, R>;

    // Data display (stdout; only executes in interactive mode after result() short-circuit)
    readonly table: <T>(
      items: ReadonlyArray<T>,
      columns: ReadonlyArray<ColumnDef<T>>,
      caption?: string,
    ) => Effect<void>;
    readonly detail: <T>(
      item: T,
      columns: ReadonlyArray<ColumnDef<T>>,
      title?: string,
    ) => Effect<void>;
    readonly tree: <T>(
      roots: ReadonlyArray<TreeNode<T>>,
      def: TreeDef<T>,
      title?: string,
    ) => Effect<void>;

    // Machine data output (stdout; no-op in interactive mode)
    readonly result: <T>(data: T, schema: Schema.Schema<T>) => Effect<boolean>;
    readonly resultStream: <T>(stream: Stream<T>, schema: Schema.Schema<T>) => Effect<boolean>;

    // Both modes (stdout) — mutually exclusive with result()/resultStream()
    readonly json: (data: unknown) => Effect<void>;
    readonly raw: (content: string) => Effect<void>;
  }
>()("@axm.sh/cli/CliRenderer") {}
```

**LogMessage** is a tagged union used internally by renderer implementations for structured capture (TestRenderer) and filtering:

```typescript
type LogMessage =
  | { readonly _tag: "message"; readonly message: string }
  | { readonly _tag: "info"; readonly message: string }
  | { readonly _tag: "success"; readonly message: string }
  | { readonly _tag: "step"; readonly message: string }
  | { readonly _tag: "warn"; readonly message: string }
  | { readonly _tag: "error"; readonly message: string };
```

The per-level methods on the service interface (`message`, `info`, `success`, `step`, `warn`, `error`) delegate to `LogMessage` internally. Handlers call `renderer.step("msg")` directly — the tagged union is an implementation detail, not part of the handler-facing API.

**Clack method mapping:**

| CliRenderer method          | Clack function | Notes                                                        |
| --------------------------- | -------------- | ------------------------------------------------------------ |
| `message`                   | `log.message`  | Generic log, no icon prefix                                  |
| `info`                      | `log.info`     | Blue info icon                                               |
| `success`                   | `log.success`  | Green check icon                                             |
| `step`                      | `log.step`     | Dash icon                                                    |
| `warn`                      | `log.warn`     | Yellow warning icon                                          |
| `error`                     | `log.error`    | Red error icon                                               |
| `intro`                     | `intro`        | Session opening message                                      |
| `outro`                     | `outro`        | Session closing message                                      |
| `cancel`                    | `cancel`       | Cancellation message                                         |
| `note`                      | `note`         | Bordered message with title                                  |
| `box`                       | `box`          | Boxed message with alignment, width, rounded corners         |
| `spinner` / `withSpinner`   | `spinner`      | Animated spinner with message                                |
| `progress` / `withProgress` | `progress`     | Extends spinner with advance/percent                         |
| `taskLog` / `withTaskLog`   | `taskLog`      | Command output capture (clears on success, retains on error) |
| `runTasks`                  | `tasks`        | Batch task execution with spinner display                    |
| `streamLog`                 | `p.stream.*`   | Stream text lines at a log level (replaces `Output.stream`)  |

**`LogLevel`** for `streamLog` reuses the per-level method names:

```typescript
type LogLevel = "message" | "info" | "success" | "step" | "warn" | "error";
```

`streamLog` replaces the current `Output.stream(level, stream)` method. The `InteractiveRenderer` pipes stream chunks through the corresponding Clack `p.stream.*` method. The `MachineRenderer` emits each chunk as an NDJSON log event on stderr.

**Handle interfaces:**

```typescript
interface SpinnerHandle {
  readonly stop: (message?: string) => Effect<void>;
  readonly message: (message?: string) => Effect<void>;
  readonly cancel: (message?: string) => Effect<void>;
  readonly error: (message?: string) => Effect<void>;
  readonly clear: () => Effect<void>;
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
  readonly advance: (step?: number, message?: string) => Effect<void>;
}

interface TaskLogConfig {
  readonly title: string;
  readonly limit?: number;
  readonly retainLog?: boolean;
}

interface TaskLogGroupHandle {
  readonly message: (msg: string) => Effect<void>;
  readonly error: (message: string) => Effect<void>;
  readonly success: (message: string) => Effect<void>;
}

interface TaskLogHandle {
  readonly message: (msg: string) => Effect<void>;
  readonly group: (name: string) => Effect<TaskLogGroupHandle>;
  readonly error: (message: string) => Effect<void>;
  readonly success: (message: string) => Effect<void>;
}

interface Task<E, R> {
  readonly title: string;
  readonly task: (message: (msg: string) => Effect<void>) => Effect<string | void, E, R>;
  readonly enabled?: boolean;
}
```

These match the current `Activity` handle shapes. `SpinnerHandle.message` updates the spinner text (named `message` for Clack API alignment). `ProgressHandle` extends `SpinnerHandle` with `advance(step)` for incrementing progress.

**`json()` / `raw()` are mutually exclusive with `result()` / `resultStream()`.** Commands that use `result()` for schema-validated output should not also call `json()` or `raw()`. `json()` and `raw()` exist for export/dump commands that produce raw content in both modes (e.g., `axm workspace export --format yaml`). A handler that calls both `result()` and `json()` would produce two objects on stdout in machine mode — this is a handler bug.

### 2. Replace --output-format with per-command --json

**Decision:** A per-command `--json` boolean flag replaces the global `--output-format text|json|stream-json`. Only commands that declare an output schema (Decision 7) include the flag. The flag feeds into renderer layer selection — when active, the `MachineRenderer` is used, which emits NDJSON log events on stderr for chrome methods (preserving progress/status for CI consumers) and makes data display methods no-ops.

**Alternatives considered:**

- (a) Keep `--output-format` with three values → users shouldn't choose between json and stream-json; the handler knows
- (b) Global `--json` flag on every command → commands without structured output (e.g., `init`) would accept `--json` and do nothing
- (c) Per-command `--json` flag → chosen; only appears in `--help` for commands that support it
- (d) No flag, always auto-detect from TTY → removes explicit opt-in, surprising when stdout is a TTY but user wants JSON

**Rationale:** `--json` is per-command in the CLI parser — a reusable `Flag` definition in `cli-flags/index.ts`, declared in the command config. It only appears in `--help` for commands that support it.

However, the flag drives renderer layer selection, not handler branching. The `run()` boundary scans argv for `--json` (same early-resolution mechanism as the current `resolveFormatFromArgv`) to select the `MachineRenderer`. This gives clean stdout — `axm skills list --json | jq` produces clean JSON on stdout. Chrome methods in `MachineRenderer` emit NDJSON log events to stderr (not stdout), so CI consumers can parse progress/status from stderr while piping data from stdout.

```typescript
// cli-flags/index.ts
export const jsonFlag = Flag.boolean("json").pipe(Flag.withDescription("Output as JSON"));

// In a command that supports --json:
const listConfig = {
  json: jsonFlag,
  // ...other flags
} as const;

export const listCommand = Command.make("list", listConfig, ({ json }) =>
  withRuntime(handleList(args), { command: "skills list" }),
);
```

The handler calls `result()` for batch output or `resultStream()` for streaming — the format is determined by the method, not the flag. Auto-detection still applies: non-TTY stdout defaults to machine mode (matching current behavior).

### 3. Separate Verbosity service

**Decision:** Verbosity is a standalone Effect service, independent of CliRenderer.

**Alternatives considered:**

- (a) Embed verbosity in CliRenderer (renderer checks level before emitting) → couples format and volume; verbose JSON should include more data, not more chrome
- (b) Embed in CliEnvironment (add level to existing service) → CliEnvironment is being removed by this change; even if it weren't, it conflates environment detection with output policy
- (c) Standalone Verbosity service → chosen

**Rationale:** Verbosity controls _what_ a handler emits. CliRenderer controls _how_ it's formatted. They compose independently: verbose interactive mode shows extra table columns; verbose JSON mode includes extra fields in the result object. The renderer doesn't need to know the verbosity level.

#### Service shape

```typescript
type VerbosityLevel = "quiet" | "normal" | "verbose" | "debug";

class Verbosity extends ServiceMap.Service<
  Verbosity,
  {
    readonly level: VerbosityLevel;
    readonly isAtLeast: (min: VerbosityLevel) => boolean;
  }
>()("@axm.sh/cli/Verbosity") {}
```

#### Level ordering

Levels are ordered: `quiet < normal < verbose < debug`. `isAtLeast` compares against this ordering. The ordering is the only thing that makes this a service rather than a plain enum — it encapsulates the comparison logic.

```typescript
const LevelOrder: Record<VerbosityLevel, number> = {
  quiet: 0,
  normal: 1,
  verbose: 2,
  debug: 3,
} as const satisfies Record<VerbosityLevel, number>;
```

#### Flag resolution

Global flags (resolved once at the `run()` boundary into the service layer):

| Flag               | Level   |
| ------------------ | ------- |
| `-q` / `--quiet`   | quiet   |
| (default)          | normal  |
| `-v` / `--verbose` | verbose |
| `-vv` / `--debug`  | debug   |

The existing `debugFlag` and `verboseFlag` in `cli-flags` are reused. A new `quietFlag` is added. Conflict resolution: **last flag wins** (`-q -v` → verbose, `-v -q` → quiet). This matches POSIX convention — users expect the rightmost flag to take precedence, especially when composing aliases with explicit overrides.

**Implementation:** Effect's CLI parser doesn't expose argv positions, so verbosity is resolved from raw argv at the `run()` boundary — the same `resolveFromArgv` pattern used for `--json`. Scan argv right-to-left; the first verbosity flag found determines the level.

```typescript
// cli-runtime/resolve-verbosity.ts
const resolveVerbosityFromArgv = (argv: ReadonlyArray<string>): VerbosityLevel => {
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i];
    if (arg === "--debug" || arg === "-vv") return "debug";
    if (arg === "--verbose" || arg === "-v") return "verbose";
    if (arg === "--quiet" || arg === "-q") return "quiet";
  }
  return "normal";
};
```

The resolved level is provided via `makeVerbosityLayer(level)` at the `run()` boundary.

```typescript
// cli-flags/index.ts
export const quietFlag = GlobalFlag.setting(
  Flag.boolean("quiet").pipe(
    Flag.withAlias("q"),
    Flag.withDescription("Suppress non-essential output"),
  ),
);

// Layer construction
const makeVerbosityLayer = (level: VerbosityLevel) =>
  Layer.succeed(Verbosity, {
    level,
    isAtLeast: (min) => LevelOrder[level] >= LevelOrder[min],
  });
```

#### Conditional emission helpers

Pure functions over the service — handlers wrap output calls to control what's emitted at each verbosity level:

```typescript
// Emit unless --quiet
const whenNotQuiet = <A, E, R>(effect: Effect<A, E, R>) =>
  Effect.gen(function* () {
    const v = yield* Verbosity;
    if (v.isAtLeast("normal")) return yield* effect;
  });

// Emit only at --verbose or higher
const whenVerbose = <A, E, R>(effect: Effect<A, E, R>) =>
  Effect.gen(function* () {
    const v = yield* Verbosity;
    if (v.isAtLeast("verbose")) return yield* effect;
  });

// Emit only at --debug
const whenDebug = <A, E, R>(effect: Effect<A, E, R>) =>
  Effect.gen(function* () {
    const v = yield* Verbosity;
    if (v.isAtLeast("debug")) return yield* effect;
  });
```

#### Effect logger integration

The verbosity level maps to Effect's log level at the layer boundary. This means `Effect.log`, `Effect.logDebug`, etc. respect the same verbosity setting without handlers needing to check:

```typescript
const verbosityToLogLevel = (level: VerbosityLevel): LogLevel => {
  switch (level) {
    case "quiet":
      return LogLevel.Warning;
    case "normal":
      return LogLevel.Info;
    case "verbose":
      return LogLevel.Debug;
    case "debug":
      return LogLevel.Trace;
  }
};
```

#### Handler usage

Verbosity shapes what data the handler prepares — not how the renderer formats it:

```typescript
const handleList = (args: ListArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const skills = yield* fetchSkills(args);

    // Schema drives everything — priority annotations handle verbose fields automatically
    // In JSON mode, all fields are emitted regardless of priority
    // In table mode, priority: 1 fields only appear at --verbose
    yield* emitMany(skills, { schema: SkillListItem, title: "Skills" });
    yield* whenVerbose(renderer.info(`${skills.length} skills found`));
  });
```

### 4. Stdout/stderr channel separation

**Decision:** Enforce channel separation unconditionally in both modes.

| Channel    | Methods                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **stdout** | `result`, `resultStream`, `table`, `detail`, `tree`, `json`, `raw`                                                                             |
| **stderr** | `intro`, `outro`, `message`, `info`, `success`, `step`, `warn`, `error`, `cancel`, `note`, `box`, `spinner`, `progress`, `taskLog`, `runTasks` |

**Rationale:** This makes `axm skills list --json | jq` work cleanly — chrome goes to stderr, JSON goes to stdout. When piping without `--json`, chrome is still visible on stderr while stdout carries nothing (handler didn't call `result()`). The current implementation already routes structured output chrome to `console.error` — this formalizes and extends that pattern.

### 5. Two-axis terminal detection

**Decision:** Detect `canRender` and `isInteractive` independently.

| Axis            | Detection                                              | Purpose                            |
| --------------- | ------------------------------------------------------ | ---------------------------------- |
| `canRender`     | `stdout.isTTY`, `FORCE_COLOR`, `NO_COLOR`, `TERM=dumb` | Colors, box-drawing characters     |
| `isInteractive` | `canRender && !isCI`                                   | Animated spinners, dynamic updates |

**Rationale:** CI environments (GitHub Actions) have TTY-like stdout but shouldn't get animated spinners. Currently, CI detection is done via `isNonInteractive` which conflates "don't prompt" with "don't animate." Splitting into two axes lets CI get colored static output (spinner start/stop messages) without animation frames.

These axes feed renderer selection (Decision 11) and internal renderer behavior. `InteractiveRenderer` reads `TerminalCapabilities` to degrade gracefully: no colors when `canRender` is false (e.g., `NO_COLOR`, `TERM=dumb`), static output when `isInteractive` is false (CI — spinner start/stop messages without animation frames, box-drawing without cursor movement).

These axes are resolved once at the `run()` boundary and stored in a `TerminalCapabilities` value provided to the renderer layer.

### 6. result() / resultStream() return boolean

**Decision:** `result<T>(data: T, schema: Schema.Schema<T>)` returns `true` in machine mode (data validated and emitted), `false` in interactive mode (no-op). The schema parameter ensures all machine output is validated — no untyped JSON escape hatches. This enables the short-circuit idiom:

```typescript
if (yield * renderer.result(data, OutputSchema)) return;
// ... interactive table/detail/tree rendering follows
```

**Alternatives considered:**

- (a) Handlers call both `result()` and `table()` unconditionally; each is a no-op in the wrong mode → works but wastes table formatting effort in machine mode
- (b) Handler branches on its own `--json` flag → handler takes on chrome suppression responsibility; if handler forgets to return, both `result()` and `table()` write to stdout
- (c) Boolean return with short-circuit → chosen; explicit, handler reads clearly, chrome suppression is automatic

**Rationale:** This is the _only_ format-aware branch a handler should contain. It exists because interactive mode needs to collect and format data differently (tables, summaries) than machine mode (raw JSON). The renderer handles mode switching — the handler just checks the boolean. Chrome suppression, `table()`/`tree()` no-ops, and clean stdout are all handled by the `MachineRenderer` without handler involvement.

### 7. Schema-driven output with annotations

**Decision:** Each command that supports `--json` declares a single Effect `Schema` for its output shape. The schema is annotated with display metadata (column headers, priority, alignment, formatting). One definition drives six outputs: TypeScript types, JSON serialization, table columns, detail labels, JSON Schema documentation, and field descriptions.

**Alternatives considered:**

- (a) Separate schema + hand-written `ColumnDef<T>` arrays → two definitions to keep in sync; handlers manually construct column arrays
- (b) Schema with display annotations → chosen; single source of truth, columns derived automatically

#### Output annotations

Symbol-keyed annotations that Effect Schema carries on fields. The renderer reads them; JSON serialization ignores them.

```typescript
// cli-renderer/annotations.ts

const ColumnHeader = Symbol.for("axm/output/ColumnHeader");
const ColumnPriority = Symbol.for("axm/output/ColumnPriority");
const ColumnAlign = Symbol.for("axm/output/ColumnAlign");
const ColumnWidth = Symbol.for("axm/output/ColumnWidth");
const DisplayFormat = Symbol.for("axm/output/DisplayFormat");
const Hidden = Symbol.for("axm/output/Hidden");

// Annotation helper — wraps Schema.annotations for ergonomics
// Generic <A> infers field type at call site; stored untyped in annotations
// but safe because columnsFrom() only calls format with the matching field value
const column = <A = unknown>(opts: {
  header: string;
  priority?: number; // 0 = always, 1 = verbose. Default 0
  align?: "left" | "right";
  width?: "auto" | "fill" | number;
  format?: (value: A) => string;
}) =>
  Schema.annotations({
    [ColumnHeader]: opts.header,
    [ColumnPriority]: opts.priority ?? 0,
    [ColumnAlign]: opts.align ?? "left",
    [ColumnWidth]: opts.width ?? "auto",
    ...(opts.format && { [DisplayFormat]: opts.format }),
  });

// Fields that appear in JSON but never in tables
const hidden = () => Schema.annotations({ [Hidden]: true });
```

#### Output schema example

```typescript
// commands/skills/list/output.ts
export const SkillListItem = Schema.Struct({
  name: Schema.String.pipe(
    column({ header: "Name", width: "fill" }),
    Schema.annotations({ description: "Fully qualified skill name" }),
  ),
  version: Schema.String.pipe(column({ header: "Version", width: "auto" })),
  enabled: Schema.Boolean.pipe(
    column<boolean>({ header: "Enabled", format: (v) => (v ? "yes" : "no") }),
  ),
  source: Schema.String.pipe(
    column({ header: "Source", priority: 1 }),
    Schema.annotations({ description: "Installation source" }),
  ),
  installedAt: Schema.String.pipe(column({ header: "Installed", priority: 1 })),
  // Appears in --json but not in tables
  integrity: Schema.String.pipe(hidden()),
});

type SkillListItem = typeof SkillListItem.Type;
```

#### Deriving columns from schema

A utility reads annotations from the schema AST using Effect v4's `SchemaAST` accessor APIs and produces `ColumnDef<T>` arrays:

```typescript
// cli-renderer/command-output.ts
import { SchemaAST } from "effect";

interface ColumnDef<T> {
  readonly key: string;
  readonly header: string;
  readonly value: (item: T) => string;
  readonly priority: number;
  readonly align: "left" | "right";
  readonly width: "auto" | "fill" | number;
}

const columnsFrom = <T>(schema: Schema.Schema<T>): ReadonlyArray<ColumnDef<T>> => {
  const ast = schema.ast;
  if (!SchemaAST.isObjects(ast)) return [];

  return ast.propertySignatures
    .filter((ps) => {
      const ann = SchemaAST.resolve(ps.type);
      return ann?.[Hidden] !== true && ann?.[ColumnHeader] !== undefined;
    })
    .map((ps) => {
      const ann = SchemaAST.resolve(ps.type) ?? {};
      const key = String(ps.name);
      const format = ann[DisplayFormat];
      const header = ann[ColumnHeader];
      return {
        key,
        header: typeof header === "string" ? header : key,
        value: (item: T) => {
          const raw = (item as Record<string, unknown>)[key];
          if (typeof format === "function") return format(raw);
          if (raw == null) return "";
          return String(raw);
        },
        priority: typeof ann[ColumnPriority] === "number" ? ann[ColumnPriority] : 0,
        align: ann[ColumnAlign] === "right" ? "right" : "left",
        width: ann[ColumnWidth] ?? "auto",
      } satisfies ColumnDef<T>;
    });
};
```

**Why v4 APIs:** Effect v4 provides `SchemaAST.isObjects(ast)` for safe struct detection and `SchemaAST.resolve(ast)` for reading annotations from AST nodes. Property annotations are accessible via `propertySignature.type` — the `resolve()` function handles intermediate nodes (transformations, optionals, refinements) that might wrap the annotations. This is more reliable than raw `annotations?.[key]` access on AST nodes, which could miss annotations hidden behind intermediate wrappers.

#### Emit helpers

`emitOne` and `emitMany` tie the schema to the renderer — one function handles the entire result/table output path:

```typescript
// cli-renderer/command-output.ts

interface CommandOutputOpts<T> {
  readonly schema: Schema.Schema<T>;
  readonly title?: string;
}

// For array output (list commands)
const emitMany = <T>(items: ReadonlyArray<T>, opts: CommandOutputOpts<T>) =>
  Effect.gen(function* () {
    const out = yield* CliRenderer;
    if (yield* out.result(items, Schema.Array(opts.schema))) return;
    yield* out.table(items, columnsFrom(opts.schema), opts.title);
  });

// For single-item output (detail/info commands) — renders as vertical key-value display
const emitOne = <T>(data: T, opts: CommandOutputOpts<T>) =>
  Effect.gen(function* () {
    const out = yield* CliRenderer;
    if (yield* out.result(data, opts.schema)) return;
    yield* out.detail(data, columnsFrom(opts.schema), opts.title);
  });
```

#### What one definition drives

| Derived artifact   | How                                                                |
| ------------------ | ------------------------------------------------------------------ |
| TypeScript types   | `typeof SkillListItem.Type` — inferred by Effect Schema            |
| JSON serialization | `Schema.encode` — validated, typed                                 |
| Table columns      | `columnsFrom(schema)` — reads annotations, produces `ColumnDef[]`  |
| Detail labels      | Same `ColumnDef[]` rendered vertically by `detail()` via `emitOne` |
| JSON Schema files  | `JSONSchema.make(schema)` — standard JSON Schema for docs          |
| Field descriptions | `Schema.annotations({ description })` — carried to JSON Schema     |

**Verbosity is automatic via `priority`.** The renderer filters columns/fields by priority based on the resolved verbosity level. A `priority: 1` field only appears when `--verbose` is active. Handlers define the schema once; the renderer handles the rest.

**The `hidden()` annotation** is for fields that should appear in JSON output but never in tables or detail views — internal identifiers, integrity hashes, metadata useful for machines but noise for humans.

**JSON Schema generation** — the same schema produces publishable documentation:

```typescript
// scripts/generate-output-schemas.ts
import { JSONSchema } from "effect";

const schemas = {
  "skills-list": JSONSchema.make(Schema.Array(SkillListItem)),
  "skills-show": JSONSchema.make(SkillInfo),
};

for (const [command, schema] of Object.entries(schemas)) {
  writeFileSync(`docs/schemas/cli-output/${command}.json`, JSON.stringify(schema, null, 2));
}
```

**Rationale:** The previous design had schemas and `ColumnDef<T>` arrays as separate definitions co-located in the same file. This works but creates a synchronization problem — adding a field to the schema requires remembering to add a matching column definition. Schema annotations eliminate this: one field definition carries both the data contract and the display metadata. The `column()` helper keeps the annotation ergonomic.

### 8. Typed table API

**Decision:** `table()` takes typed data + `ColumnDef<T>` arrays. The renderer owns all formatting decisions. In practice, handlers rarely construct `ColumnDef` arrays directly — `columnsFrom(schema)` derives them from annotated schemas (Decision 7). The `table()` method accepts raw `ColumnDef` arrays for cases where schema derivation doesn't apply (e.g., inline sub-tables, compatibility matrices).

```typescript
interface ColumnDef<T> {
  readonly key: string;
  readonly header: string;
  readonly value: (item: T) => string;
  readonly priority: number;
  readonly align: "left" | "right";
  readonly width: "auto" | "fill" | number;
}
```

**Rationale:** The renderer needs raw data and column metadata to make formatting decisions: right-align numbers, truncate long names with ellipsis, adapt columns to terminal width, and filter by `priority` based on available space or verbosity.

The `InteractiveRenderer` uses a custom formatter matching Clack's visual language (│ guide line, box-drawing characters). The formatter is minimal — columns, alignment, truncation. If table complexity grows, evaluate extraction or library adoption.

**table(), detail(), and tree() stay on the service interface** even though the `result()` short-circuit means they only execute in interactive mode. Removing them would force handlers to call standalone utilities directly, and the TestRenderer couldn't capture what was displayed. Keeping them on the interface preserves testability: `expect(testRenderer.tables).toHaveLength(1)`.

### 9. Vertical detail display for single items

**Decision:** `detail()` renders a single item as a vertical key-value list, using the same `ColumnDef<T>` arrays as `table()`. This is the natural display for single-entity views (show/info commands) — a 1-row table is visually awkward; vertical key-value is how users expect detail views to look.

```typescript
readonly detail: <T>(
  item: T,
  columns: ReadonlyArray<ColumnDef<T>>,
  title?: string,
) => Effect<void>;
```

**Rendering:** The `InteractiveRenderer` renders detail views in Clack's visual language — each field as a labeled row with the label left-aligned and value right-aligned:

```
my-skill
  Name          my-skill
  Version       2.1.0
  Type          skill
  Source        github:acme/my-skill
  Publisher     @acme
```

**Schema annotations drive both layouts:** The same `column()` annotations produce `ColumnDef[]` via `columnsFrom()`. For `table()`, the header becomes a column header. For `detail()`, the header becomes a label. Priority filtering, formatting, and `hidden()` work identically in both views.

**`detail()` uses a subset of `ColumnDef` fields:** `header` (as label), `value` (accessor), `priority` (verbosity filtering), and `format` (display transformation). The `width` and `align` fields are ignored — vertical key-value layout uses fixed label/value alignment, not column distribution.

**`emitOne` uses `detail()`** — single-item output uses vertical layout by default:

```typescript
yield * emitOne(skill, { schema: SkillInfo, title: skill.name });
// Machine mode: JSON via result()
// Interactive mode: vertical key-value via detail()
```

Handlers can override this by calling `table()` directly for cases where a single-row table makes more sense (e.g., a single row in a batch result).

### 10. Unified tree primitive for structured non-tabular output

**Decision:** A single `tree()` method replaces `list()` for all non-tabular structured output: flat lists, key-value displays, grouped lists, and dependency trees.

**Alternatives considered:**

- (a) `list(items: ReadonlyArray<string>)` for flat lists, separate `tree()`, `keyValue()`, `groupedList()` methods → interface bloat, each method is a special case of the same structure
- (b) Single `tree<T>()` with typed nodes → chosen; all cases are trees at different depths

**Rationale:** Every non-tabular structured display in the CLI maps to a tree:

- **Flat list** (files created by `init`, warnings) → depth-1 tree, no children
- **Key-value display** (extension info, workspace status) → depth-1 tree where `label` is the key and `detail` is the value
- **Grouped list** (extensions by type or lifecycle state) → depth-2 tree where groups are roots
- **Dependency tree** (pack contents, resolution traces) → arbitrary depth

One method, one data structure covers all cases. A standalone `list()` would be sugar over `tree()` with no children — not worth the interface surface.

Unlike `table()`, where the same typed items array is passed to both `result()` and `table()`, the tree structure is a display concern independent of the machine output shape. The `result()` schema defines the machine contract; `tree()` defines how it's presented interactively. A handler might pass a nested JSON tree to `result()` and the same data to `tree()`, or a flat array to `result()` and a structured grouping to `tree()`. The two shapes are decoupled by design.

Empty trees render nothing — if `roots` is empty, the title is suppressed and no output is produced. Handlers check `items.length > 0` before calling `tree()`, keeping the emptiness decision explicit.

```typescript
interface TreeNode<T> {
  readonly data: T;
  readonly children?: ReadonlyArray<TreeNode<T>>;
}

interface TreeDef<T> {
  readonly label: (item: T) => string;
  readonly detail?: (item: T) => string | undefined; // right-aligned hint
  readonly icon?: (item: T) => string | undefined; // prefix symbol
}
```

The `icon` callback gives handlers control over visual semantics (lifecycle state indicators, type indicators) without hardcoding presentation into the renderer.

**Handler usage examples:**

Flat list (files created by init):

```typescript
yield *
  renderer.tree(
    files.map((f) => ({ data: f })),
    { label: (f) => f.path, icon: () => "+" },
    "Created files",
  );
// Created files
//   + settings.json
//   + axm-lock.yaml
//   + CLAUDE.md
```

Key-value display (extension info):

```typescript
yield *
  renderer.tree(
    [
      { data: { key: "Version", value: info.version } },
      { data: { key: "Type", value: info.type } },
      { data: { key: "Publisher", value: info.publisher } },
    ],
    { label: (kv) => kv.key, detail: (kv) => kv.value },
    info.name,
  );
// my-skill
//   Version     1.2.0
//   Type        skill
//   Publisher   @acme
```

Pack dependency tree:

```typescript
yield *
  renderer.tree(
    [
      {
        data: pack,
        children: pack.dependencies.map((dep) => ({
          data: dep,
          children: dep.transitive?.map((t) => ({ data: t })),
        })),
      },
    ],
    {
      label: (ext) => `${ext.name}@${ext.version}`,
      detail: (ext) => ext.type,
      icon: (ext) => (ext.type === "pack" ? "📦" : "◆"),
    },
  );
// 📦 @acme/starter-pack@1.0.0        pack
//    ◆ code-review@2.1.0             skill
//    ◆ test-writer@1.3.0             skill
//       ◆ jest-helper@0.9.0          skill
//    ◆ format-on-save@1.0.0          command
```

Grouped workspace status — when roots and leaves have different shapes, use a union type for `T`. Tree node data is handler-internal display data (never serialized to JSON), so a simple structural discriminant is fine:

```typescript
type GroupNode = { readonly kind: "group"; readonly name: string; readonly count: number };
type ExtNode = {
  readonly kind: "ext";
  readonly name: string;
  readonly version: string;
  readonly state: string;
};

yield *
  renderer.tree<GroupNode | ExtNode>(
    [
      {
        data: { kind: "group", name: "Skills", count: 3 },
        children: skills.map((s) => ({ data: s })),
      },
      {
        data: { kind: "group", name: "Commands", count: 1 },
        children: commands.map((c) => ({ data: c })),
      },
    ],
    {
      label: (item) => (item.kind === "group" ? `${item.name} (${item.count})` : item.name),
      detail: (item) => (item.kind === "ext" ? item.version : undefined),
      icon: (item) =>
        item.kind === "ext"
          ? item.state === "configured"
            ? "◆"
            : item.state === "implicit"
              ? "◇"
              : "○"
          : undefined,
    },
  );
// Skills (3)
//    ◆ code-review              2.1.0
//    ◆ test-writer              1.3.0
//    ◇ jest-helper              0.9.0
// Commands (1)
//    ◆ format-on-save           1.0.0
```

The `InteractiveRenderer` renders trees with Clack-style guide lines and box-drawing connectors. The `MachineRenderer` makes `tree()` a no-op (data goes through `result()`). The `TestRenderer` captures the raw `TreeNode` array and `TreeDef` for structural assertions.

The `note()` method from Clack retains its role for freeform text blocks (next steps, error explanations) that aren't structured data. Any time you're rendering structured items — flat, grouped, or hierarchical — `tree()` is the primitive.

### 11. Three renderer implementations

**Decision:** Three `Layer` implementations, selected at the `run()` boundary:

| Implementation        | Purpose                                        | Selection           |
| --------------------- | ---------------------------------------------- | ------------------- |
| `InteractiveRenderer` | Clack-based chrome, formatted tables and trees | TTY + no `--json`   |
| `MachineRenderer`     | JSON/NDJSON to stdout, NDJSON chrome on stderr | `--json` or non-TTY |
| `TestRenderer`        | Captures structured calls                      | Test layers         |

**Alternatives considered:**

- (a) Single class with mode flag (Rich pattern) → simpler code but harder to test; every method has an if/else
- (b) Two production implementations + test → chosen; each implementation is straightforward with no branching

The `MachineRenderer` emits NDJSON log events to stderr for chrome methods (preserving progress/status for CI consumers that parse stderr), makes `table()`/`detail()`/`tree()` no-ops (display is irrelevant in machine mode), and `result()`/`resultStream()` write schema-validated JSON to stdout and return `true`. The `InteractiveRenderer` does the inverse: chrome methods render via Clack, `table()`/`detail()`/`tree()` format to stdout, `result()` is a no-op returning `false`.

The NDJSON events on stderr use the same schema as the current `StreamEvent` types (log events with level, progress events with phase/percent). This preserves compatibility for CI consumers that previously used `--output-format stream-json` to monitor progress. The key difference from the old model: events go to stderr (not stdout), so `axm command --json | jq` always works cleanly.

Selection uses `Layer.unwrapEffect` at the `run()` boundary, matching the current `makeUiLayer` pattern but producing a single `CliRenderer` layer instead of `Output | Activity`.

### 12. TestRenderer design

**Decision:** The test renderer captures all calls as structured data in a mutable state object, extending the current `makeOutputTestLayer` pattern to cover the full CliRenderer surface.

```typescript
interface TestRendererState {
  readonly logs: Array<LogMessage>; // captured from per-level methods (message, info, step, etc.)
  readonly tables: Array<{
    items: Array<unknown>;
    columns: Array<ColumnDef<unknown>>;
    caption?: string;
  }>;
  readonly details: Array<{
    item: unknown;
    columns: Array<ColumnDef<unknown>>;
    title?: string;
  }>;
  readonly trees: Array<{ roots: Array<TreeNode<unknown>>; def: TreeDef<unknown>; title?: string }>;
  readonly results: Array<{ data: unknown; schema: Schema.Schema<unknown> }>;
  readonly spinnerMessages: Array<string>;
  readonly notes: Array<{ message: string; title?: string }>;
  readonly boxes: Array<{ message: string; title?: string; opts?: BoxOptions }>;
  readonly cancelMessages: Array<string>;
  readonly introTitle: Option<string>;
  readonly outroMessage: Option<string>;
}
```

Tests assert on typed data, not formatted strings:

```typescript
expect(testRenderer.state.tables[0].items).toHaveLength(3);
expect(testRenderer.state.tables[0].columns[0].header).toBe("Name");
expect(testRenderer.state.trees[0].roots).toHaveLength(1);
expect(testRenderer.state.trees[0].roots[0].children).toHaveLength(3);
```

The default `TestRenderer` returns `false` from `result()` (interactive behavior). A `TestMachineRenderer` variant returns `true` for testing the machine output code path. Both capture all calls for assertion.

### 13. Layer wiring

The composition at the `run()` boundary:

```
Verbosity (from -q / -v / -vv flags)
CliRenderer (from --json + TTY detection)
  ├── InteractiveRenderer (TTY, no --json)
  ├── MachineRenderer (--json or piped stdout)
  └── TestRenderer (test layers)
CliPrompt (from nonInteractiveFlag)
  ├── InteractivePrompt (TTY, fails fast when nonInteractive)
  └── TestPrompt (test layers, canned responses)
Effect LogLevel (derived from verbosity)
```

**CliEnvironment is removed.** Its responsibilities are absorbed:

- **verbose / debug** → `Verbosity` service (Decision 3)
- **nonInteractive** → `nonInteractiveFlag` GlobalFlag setting, read at the prompt layer boundary
- **yes** → per-command flag, checked by the handler before calling `prompt.confirm()` (not a service concern)

`makeFoundationLayer(format)` becomes `makeFoundationLayer(options)` where options includes the resolved `--json` flag and terminal capabilities. The `--json` flag is per-command in the CLI parser but resolved early via argv scanning (same mechanism as the current `resolveFormatFromArgv`) so it's available at layer construction time. The foundation provides `CliRenderer | CliPrompt | Verbosity`.

`CliPrompt` replaces the existing `Input` service — same prompt methods, renamed for consistency with `CliRenderer`.

### 14. CliPrompt stays separate, shares channel awareness with CliRenderer

**Decision:** Prompts remain a separate `CliPrompt` service. The service is not merged into `CliRenderer`. Both services share the channel model: prompts render on stderr (interactive chrome) and read from stdin; `CliRenderer` owns stdout for data and stderr for chrome.

**Rationale:** `CliRenderer` is write-only output. `CliPrompt` is read-write input collection. They're separate concerns with different lifecycles — a prompt occupies both stderr and stdin, waiting for user input, while the renderer fires and forgets. Merging them would conflate "display information" with "collect input," making the interface harder to reason about and test.

The core tension is interleaving: a handler does `spinner → stop → table → confirm → spinner → stop → success`. If the renderer writes to stderr and prompts write to stdout, visual ordering breaks. Since both use stderr for chrome, they share the same visual column (Clack's guide-line system) and interleave correctly.

#### Service shape

Carries forward all current `Input` methods, renamed for consistency. Config types are renamed accordingly (`TextConfig` → `TextOpts`, etc.) but shapes are unchanged.

```typescript
interface CliPrompt {
  readonly text: (opts: TextOpts) => Effect.Effect<string, PromptCancelled>;
  readonly password: (opts: PasswordOpts) => Effect.Effect<string, PromptCancelled>;
  readonly confirm: (opts: ConfirmOpts) => Effect.Effect<boolean, PromptCancelled>;
  readonly select: <T>(opts: SelectOpts<T>) => Effect.Effect<T, PromptCancelled>;
  readonly multiselect: <T>(
    opts: MultiselectOpts<T>,
  ) => Effect.Effect<ReadonlyArray<T>, PromptCancelled>;
  readonly groupMultiselect: <T>(
    opts: GroupMultiselectOpts<T>,
  ) => Effect.Effect<ReadonlyArray<T>, PromptCancelled>;
  readonly selectKey: <T extends string>(
    opts: SelectKeyOpts<T>,
  ) => Effect.Effect<T, PromptCancelled>;
  readonly autocomplete: <T>(opts: AutocompleteOpts<T>) => Effect.Effect<T, PromptCancelled>;
  readonly autocompleteMultiselect: <T>(
    opts: AutocompleteMultiselectOpts<T>,
  ) => Effect.Effect<ReadonlyArray<T>, PromptCancelled>;
  readonly path: (opts: PathOpts) => Effect.Effect<string, PromptCancelled>;
}
```

#### Internal non-interactive resolution

The prompt layer is constructed with the resolved `nonInteractive` value at the `run()` boundary. The resolution chain (previously in `CliEnvironment`) moves to a standalone resolver that the prompt layer boundary calls:

```typescript
// cli-prompt/resolve-non-interactive.ts
import { Flag, GlobalFlag } from "effect/unstable/cli";

export const nonInteractiveFlag = GlobalFlag.setting("axm-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

const isCI = (): boolean => process.env["CI"] === "true";

// Resolution chain: explicit --non-interactive flag → CI=true → !stdin.isTTY
export const resolveNonInteractive = Effect.gen(function* () {
  const flag = yield* nonInteractiveFlag;
  return Option.getOrElse(flag, () => isCI() || process.stdin.isTTY !== true);
});
```

This is the same logic as the current `isNonInteractive` in `utils/environment.ts`, relocated to the prompt module since it's only consumed by the prompt layer. The `run()` boundary resolves it once and passes the boolean to `makeInteractivePrompt`.

Every prompt method checks this internally — if non-interactive and no default, fail fast; if non-interactive with a default, use it silently.

`--yes` is **not** handled inside the prompt service. It's a per-command flag — handlers check it before calling `prompt.confirm()`. This keeps `--yes` semantics explicit at the call site and avoids threading a per-command flag into a shared service.

```typescript
// InteractivePrompt constructed with nonInteractive at the boundary:
const makeInteractivePrompt = (nonInteractive: boolean) => ({
  confirm: (opts) =>
    Effect.gen(function* () {
      // --non-interactive with no default → fail fast
      if (nonInteractive && opts.default === undefined) {
        yield* makeAppError({
          code: "PROMPT_REQUIRED",
          what: `Confirmation required: ${opts.message}`,
          howToFix: Option.some("Pass --yes to auto-accept"),
        });
      }

      // --non-interactive with default → use it silently
      if (nonInteractive) return opts.default!;

      // Interactive → show Clack prompt
      return yield* clackConfirm(opts);
    }),
  // ...other prompt methods follow the same pattern
});
```

#### --json mode and prompts

When `--json` is active, prompts still work — but only on stderr. The principle: `--json` controls stdout (data channel). Prompts are interactive input collection on stderr/stdin. A user running `axm init --json` might want structured output as JSON while still being prompted for the project name. This matches how `gh` works — `gh pr create --json` still prompts for title/body if not provided via flags.

However, `--json` implies `--non-interactive` for commands that don't take input. `axm search foo --json` is a pure data query with nothing to prompt for. The prompt service doesn't need to know about `--json`; the existing `--non-interactive` resolution chain handles this. Commands that support `--json` and have required input document the corresponding flags.

#### fromFlagOrPrompt and autoConfirm helpers

The gather-then-execute pattern — use a flag value if present, otherwise prompt — is formalized as helpers:

```typescript
const fromFlagOrPrompt = <T>(
  value: Option.Option<T>,
  prompt: () => Effect.Effect<T, PromptCancelled>,
) => Option.match(value, { onNone: prompt, onSome: Effect.succeed });

// --yes handling at the handler level (not inside the prompt service)
const autoConfirm = (yes: boolean, prompt: () => Effect.Effect<boolean, PromptCancelled>) =>
  yes ? Effect.succeed(true) : prompt();
```

This makes the boundary between "input gathering" and "execution with output" visible in handler code. `--yes` is checked explicitly by the handler via `autoConfirm`, not hidden inside the prompt service. Prompts cluster at the top, output flows below:

```typescript
const handleInit = (args: InitHandlerArgs) =>
  Effect.gen(function* () {
    const out = yield* CliRenderer;
    const prompt = yield* CliPrompt;

    // --- Input gathering (prompts) ---
    const name = yield* fromFlagOrPrompt(args.name, () =>
      prompt.text({ message: "Extension name:", validate: validateName }),
    );

    const agents = yield* fromFlagOrPrompt(args.agents, () =>
      prompt.multiselect({
        message: "Which agents?",
        options: [
          { value: "claude-code", label: "Claude Code" },
          { value: "cursor", label: "Cursor" },
          { value: "github-copilot", label: "GitHub Copilot" },
        ],
      }),
    );

    // --- Execution with output (renderer) ---
    const spin = yield* out.spinner("Creating workspace...");
    // ...
  });
```

#### TestPrompt implementation

Mirrors the `TestRenderer` pattern. Tests provide canned responses; the `TestPrompt` pops from the queue and fails if the queue is empty (handler asked for unexpected input):

```typescript
interface TestPromptConfig {
  readonly textResponses: ReadonlyArray<string>;
  readonly confirmResponses: ReadonlyArray<boolean>;
  readonly selectResponses: ReadonlyArray<unknown>;
  readonly multiselectResponses: ReadonlyArray<ReadonlyArray<unknown>>;
}
```

```typescript
interface TestPromptState {
  readonly textCalls: Array<TextOpts>;
  readonly confirmCalls: Array<ConfirmOpts>;
  readonly selectCalls: Array<SelectOpts<unknown>>;
  readonly multiselectCalls: Array<MultiselectOpts<unknown>>;
}
```

Usage:

```typescript
const testPrompt = TestPrompt.make({
  textResponses: ["my-project"],
  confirmResponses: [true],
  multiselectResponses: [["claude-code", "cursor"]],
});

await Effect.runPromise(
  handleInit({ name: Option.none(), agents: Option.none() }).pipe(
    Effect.provide(testPrompt.layer),
    Effect.provide(testRenderer.layer),
  ),
);

expect(testPrompt.state.textCalls).toHaveLength(1);
expect(testPrompt.state.textCalls[0].message).toBe("Extension name:");
```

#### What stays unchanged

- **Severity model** (`--force` for errors, warnings always shown) — unchanged
- **PromptCancelled** as a control flow signal (exit 0), separate from `AppError` — unchanged
- **Resolution chain** for `--non-interactive` (explicit flag → `CI=true` → `!stdin.isTTY`) — unchanged, but resolved at the prompt layer boundary instead of via `CliEnvironment`
- **Flag independence** (`--yes` ≠ `--non-interactive` ≠ `--force`) — unchanged; `--yes` moves from service-internal to handler-explicit

### 15. Module organization

Three new core modules replace six existing ones. All follow the `unstable/` namespace convention with one barrel (`index.ts`) per module.

#### `@axm.sh/core/unstable/cli-renderer` (new)

Replaces `unstable/output/`, `unstable/activity/`, and `unstable/output-format.ts`.

| File                          | Exports                                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli-renderer.ts`             | `CliRenderer`, `SpinnerHandle`, `SpinnerOptions`, `ProgressHandle`, `ProgressConfig`, `TaskLogConfig`, `TaskLogHandle`, `TaskLogGroupHandle`, `Task`, `LogLevel`, `LogMessage`, `ColumnDef`, `TreeNode`, `TreeDef`, `BoxOptions` |
| `terminal-capabilities.ts`    | `TerminalCapabilities`, `resolveTerminalCapabilities`                                                                                                                                                                            |
| `cli-renderer-interactive.ts` | `InteractiveRenderer` layer — Clack chrome, table formatter, tree formatter                                                                                                                                                      |
| `cli-renderer-machine.ts`     | `MachineRenderer` layer — JSON/NDJSON stdout, chrome no-ops                                                                                                                                                                      |
| `cli-renderer-test.ts`        | `TestRenderer`, `TestMachineRenderer`, `TestRendererState`                                                                                                                                                                       |
| `annotations.ts`              | `column()`, `hidden()`, annotation symbols (`ColumnHeader`, `ColumnPriority`, etc.)                                                                                                                                              |
| `command-output.ts`           | `columnsFrom()`, `emitMany()`, `emitOne()`, `CommandOutputOpts`                                                                                                                                                                  |
| `index.ts`                    | Barrel — re-exports all public API                                                                                                                                                                                               |

#### `@axm.sh/core/unstable/cli-prompt` (new)

Replaces `unstable/input/`.

| File                         | Exports                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli-prompt.ts`              | `CliPrompt`, config types (`TextOpts`, `ConfirmOpts`, `SelectOpts`, `MultiselectOpts`, `GroupMultiselectOpts`, `SelectKeyOpts`, `AutocompleteOpts`, `AutocompleteMultiselectOpts`, `PasswordOpts`, `PathOpts`) |
| `cli-prompt-interactive.ts`  | `InteractivePrompt` layer — Clack prompts, non-interactive fail-fast                                                                                                                                           |
| `cli-prompt-test.ts`         | `TestPrompt`, `TestPromptConfig`, `TestPromptState`                                                                                                                                                            |
| `resolve-non-interactive.ts` | `nonInteractiveFlag`, `resolveNonInteractive`                                                                                                                                                                  |
| `helpers.ts`                 | `fromFlagOrPrompt()`, `autoConfirm()`                                                                                                                                                                          |
| `index.ts`                   | Barrel                                                                                                                                                                                                         |

#### `@axm.sh/core/unstable/verbosity` (new)

| File           | Exports                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `verbosity.ts` | `Verbosity`, `VerbosityLevel`, `LevelOrder`, `makeVerbosityLayer()`, `verbosityToLogLevel()` |
| `helpers.ts`   | `whenNotQuiet()`, `whenVerbose()`, `whenDebug()`                                             |
| `index.ts`     | Barrel                                                                                       |

#### `unstable/cli-flags/` (modified)

| Change | Item                                                                                        |
| ------ | ------------------------------------------------------------------------------------------- |
| Add    | `quietFlag` — `-q` / `--quiet` global flag                                                  |
| Add    | `jsonFlag` — `--json` per-command flag                                                      |
| Remove | `outputFormatFlag` — replaced by `jsonFlag`                                                 |
| Remove | `CliEnvironment`, `makeCliEnvironmentLayer`, `CliEnvironmentTest` — absorbed by `Verbosity` |

#### `unstable/cli-runtime/` (modified)

| Change | Item                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Update | `makeFoundationLayer({ json, terminalCapabilities })` — provides `CliRenderer \| CliPrompt \| Verbosity` instead of `Output \| Activity \| Input \| CliEnvironment` |
| Update | `CliRuntimeFoundation` type → `CliRenderer \| CliPrompt \| Verbosity`                                                                                               |
| Update | `withCliErrorHandling` — reads `Verbosity` instead of `verboseFlag`/`debugFlag` directly                                                                            |
| Remove | `makeUiLayer` — absorbed into `makeFoundationLayer`                                                                                                                 |
| Remove | `resolveFormat`, `resolveCliFormat` — replaced by `--json` flag + `TerminalCapabilities`                                                                            |

#### Removed modules

| Module                      | Replacement                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| `unstable/output/`          | `unstable/cli-renderer/`                                                       |
| `unstable/activity/`        | `unstable/cli-renderer/`                                                       |
| `unstable/input/`           | `unstable/cli-prompt/`                                                         |
| `unstable/output-format.ts` | Removed — NDJSON event schemas move to `cli-renderer/` if needed for streaming |

Package exports `./unstable/output`, `./unstable/activity`, `./unstable/input`, and `./unstable/output-format` are removed from `package.json`. New exports: `./unstable/cli-renderer`, `./unstable/cli-prompt`, `./unstable/verbosity`.

CLI package: `src/output.ts` (re-export barrel for `output-format`) is removed.

#### Handler import paths

| Symbol                                          | Package export                       |
| ----------------------------------------------- | ------------------------------------ |
| `CliRenderer`, types, annotations, emit helpers | `@axm.sh/core/unstable/cli-renderer` |
| `CliPrompt`, `fromFlagOrPrompt`, `autoConfirm`  | `@axm.sh/core/unstable/cli-prompt`   |
| `Verbosity`, `whenNotQuiet/Verbose/Debug`       | `@axm.sh/core/unstable/verbosity`    |
| `TestRenderer`, `TestMachineRenderer`           | `@axm.sh/core/unstable/cli-renderer` |
| `TestPrompt`                                    | `@axm.sh/core/unstable/cli-prompt`   |

## Risks / Trade-offs

**Single service may grow large** → CliRenderer has ~15 methods. If features like streaming tables or interactive selection are added later, the interface could bloat.
Mitigation: The service is intentionally flat (no nested namespaces). If it grows past ~20 methods, split into trait-like sub-interfaces composed via intersection types. This is a future concern, not a current one.

**Schema-per-command is upfront work** → Every `--json`-supporting command needs a schema before shipping machine output.
Mitigation: Start with commands that already have ad-hoc JSON (whoami). Add schemas incrementally as commands gain `--json` support. Commands without a schema simply don't expose `--json`.

**Custom table and tree formatter maintenance** → Building table and tree renderers instead of using a library means maintaining layout logic. The tree formatter is recursive (indentation, guide lines, box-drawing connectors, variable-width icons including emoji) and has more surface area than the table formatter.
Mitigation: Both formatters are minimal and deliberately scoped. The table formatter handles columns, alignment, and truncation. The tree formatter handles indentation and connectors. If requirements grow, re-evaluate library adoption.

**Verbosity helpers add boilerplate** → Handlers wrap output calls in `whenVerbose(...)` / `whenNotQuiet(...)`.
Mitigation: This is explicit and readable — better than implicit filtering. The alternative (renderer checks verbosity internally) would couple format and volume decisions.

**Schema AST traversal** → `columnsFrom` walks Effect Schema's AST to read annotations from property signatures. Property signatures may be wrapped in transformations, optionals, or refinements.
Mitigation: Effect v4 provides `SchemaAST.resolve(ast)` which handles intermediate AST wrappers, and `SchemaAST.isObjects(ast)` for safe struct detection. These APIs are more robust than raw annotation access. If v4 APIs prove insufficient, fall back to a registration pattern where schemas call a `registerColumns()` function alongside the struct definition.

**Prerequisite spike:** Before starting implementation, spike `columnsFrom` against a non-trivial schema (nested optionals, branded types, enums, `Schema.optional`) to validate that the v4 `SchemaAST` APIs work as expected. This spike gates phase 1 — if the APIs are insufficient, the annotation-based approach needs redesign before building the full infrastructure.

**`columnsFrom` uses a type assertion** → The `(item as Record<string, unknown>)[key]` pattern in `columnsFrom` accesses a dynamic key on generic `T`. Production implementation should use a type-safe accessor (e.g., a generic property getter derived from the schema AST) to avoid the assertion.

## Migration

This is a sweeping change (3 services → 1, CliEnvironment removed, flag changes, test helper changes). Migration proceeds in phases:

0. **Spike Schema AST** — Validate `columnsFrom` against non-trivial schemas (nested optionals, branded types, enums, `Schema.optional`). Gates phase 1.

1. **Implement new services and wire verbosity** — Create `CliRenderer`, `Verbosity`, and `CliPrompt` services with their layer implementations (`InteractiveRenderer`, `MachineRenderer`, `TestRenderer`). Add `resolveVerbosityFromArgv`, `-q`/`-v`/`-vv` flags, `makeVerbosityLayer`, and `whenVerbose`/`whenNotQuiet` helpers at the `run()` boundary. Verbosity lands with the new services so migrated handlers can use it immediately. These exist alongside the current services.

2. **Add adapter layers** — Implement `Output` and `Activity` as thin wrappers over `CliRenderer`, and `Input` as a re-export of `CliPrompt`. Existing handlers continue working unchanged. The adapter layers are temporary scaffolding.

3. **Migrate handlers** — Convert handlers one at a time from `Output`/`Activity`/`Input` to `CliRenderer`/`CliPrompt`. Each handler migration is an independent, reviewable PR. Add output schemas, `--json` support, and verbosity-conditional output as handlers are touched.

4. **Update test infrastructure** — Replace `makeOutputTestLayer()` + `makeActivityTestLayer()` + `makeInputTestLayer()` with `TestRenderer` + `TestPrompt`. Migrate tests alongside their handlers.

5. **Remove adapters** — Once all handlers are migrated, remove the adapter layers, the old service definitions, `CliEnvironment`, and the `--output-format` flag.

Phases 0-2 can land in a single PR (spike first, then services + adapters). Phase 3 proceeds incrementally. Phase 5 is the breaking change — all handlers must be migrated before adapters are removed.

## Appendix: Handler Sketches

These sketches demonstrate the full CliRenderer surface area across realistic handler implementations. Each handler is annotated with the methods it exercises.

### A. List handler — emitMany, withSpinner, intro/outro

A typical CRUD list command: fetch data, show as table interactively or JSON in machine mode. The output schema (defined in `output.ts`) drives both paths.

**Methods exercised:** `intro`, `outro`, `warn`, `withSpinner`, `emitMany`

```typescript
// commands/skills/list/output.ts
import { Schema } from "effect";
import { column } from "@axm.sh/core/unstable/cli-renderer";

export const SkillListItem = Schema.Struct({
  name: Schema.String.pipe(column({ header: "Name", width: "fill" })),
  version: Schema.String.pipe(column({ header: "Version", width: "auto" })),
  enabled: Schema.Boolean.pipe(
    column<boolean>({ header: "Enabled", format: (v) => (v ? "yes" : "no") }),
  ),
  source: Schema.String.pipe(column({ header: "Source", priority: 1 })),
  installedAt: Schema.String.pipe(column({ header: "Installed", priority: 1 })),
});

export type SkillListItem = typeof SkillListItem.Type;
```

```typescript
// commands/skills/list/handler.ts
import { Effect, Option } from "effect";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { emitMany } from "@axm.sh/core/unstable/cli-renderer";
import { SkillListItem } from "./output";

interface ListArgs {
  readonly workspace: string;
  readonly tag: Option.Option<string>;
}

export const handleList = (args: ListArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    yield* renderer.intro("Skills");

    const skills = yield* renderer.withSpinner("Fetching skills…", () => fetchSkills(args), {
      stopMessage: (result) => `Found ${result.length} skills`,
    });

    if (skills.length === 0) {
      yield* renderer.warn("No skills installed");
      yield* renderer.outro("Done");
      return;
    }

    // Schema drives everything — JSON serialization, table columns, priority filtering
    yield* emitMany(skills, { schema: SkillListItem, title: "Skills" });

    yield* renderer.outro("Done");
  });
```

### B. Show handler — emitOne (detail), tree (nested), note

A detail/inspect command: show structured info about a single entity, with nested dependencies. `emitOne` renders the entity as a vertical key-value detail view in interactive mode.

**Methods exercised:** `step`, `withSpinner`, `emitOne` (→ `detail`), `tree` (nested), `note`

```typescript
// commands/skills/show/output.ts
import { Schema } from "effect";
import { column } from "@axm.sh/core/unstable/cli-renderer";

export const SkillInfo = Schema.Struct({
  name: Schema.String.pipe(column({ header: "Name" })),
  version: Schema.String.pipe(column({ header: "Version" })),
  type: Schema.String.pipe(column({ header: "Type" })),
  source: Schema.String.pipe(column({ header: "Source" })),
  publisher: Schema.String.pipe(column({ header: "Publisher" })),
  license: Schema.optional(Schema.String).pipe(column({ header: "License" })),
  enabled: Schema.Boolean.pipe(
    column<boolean>({ header: "Enabled", format: (v) => (v ? "yes" : "no") }),
  ),
  dependencies: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      version: Schema.String,
      type: Schema.String,
      transitive: Schema.optional(
        Schema.Array(
          Schema.Struct({ name: Schema.String, version: Schema.String, type: Schema.String }),
        ),
      ),
    }),
  ),
  deprecation: Schema.optional(Schema.String),
  replacement: Schema.optional(Schema.String),
});

export type SkillInfo = typeof SkillInfo.Type;
```

```typescript
// commands/skills/show/handler.ts
import { Effect, Option } from "effect";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { emitOne } from "@axm.sh/core/unstable/cli-renderer";
import { SkillInfo } from "./output";

interface ShowArgs {
  readonly name: string;
}

export const handleShow = (args: ShowArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    yield* renderer.step(`Looking up ${args.name}`);

    const skill = yield* renderer.withSpinner(`Resolving ${args.name}…`, () =>
      resolveSkill(args.name),
    );

    // Schema drives JSON output in machine mode + vertical key-value detail in interactive mode
    yield* emitOne(skill, { schema: SkillInfo, title: skill.name });

    // Dependency tree (nested) — display-only, not part of the output schema
    if (skill.dependencies.length > 0) {
      yield* renderer.tree(
        skill.dependencies.map((dep) => ({
          data: dep,
          children: dep.transitive?.map((t) => ({ data: t })),
        })),
        {
          label: (d) => `${d.name}@${d.version}`,
          detail: (d) => d.type,
          icon: (d) => (d.type === "pack" ? "📦" : "◆"),
        },
        "Dependencies",
      );
    }

    // Freeform note for deprecation guidance
    if (skill.deprecation !== undefined) {
      yield* renderer.note(
        `This skill is deprecated: ${skill.deprecation}\n\nConsider migrating to ${skill.replacement ?? "an alternative"}.`,
        "Deprecation Notice",
      );
    }
  });
```

### C. Install handler — progress, spinner lifecycle, log variants, tree (flat list)

A mutation command: install with progress tracking, multiple log levels, and a file summary. Mutation commands define lightweight output schemas for their result shape — simpler than entity schemas but still validated.

**Methods exercised:** `intro`, `outro`, `info`, `success`, `warn`, `error`, `step`, `spinner` (manual handle), `withProgress`, `result`, `tree` (flat list)

```typescript
// commands/skills/install/handler.ts
import { Effect, Option, Schema } from "effect";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { whenNotQuiet } from "@axm.sh/core/unstable/verbosity";

const InstallResult = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  files: Schema.Number,
});

interface InstallArgs {
  readonly name: string;
  readonly version: Option.Option<string>;
  readonly force: boolean;
}

export const handleInstall = (args: InstallArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    yield* renderer.intro("Install Skill");
    yield* renderer.step(`Installing ${args.name}`);

    // Resolve phase — manual spinner for multi-step control
    const spin = yield* renderer.spinner("Resolving version…");
    const resolved = yield* resolveVersion(args.name, args.version);
    yield* spin.update(`Resolved ${resolved.name}@${resolved.version}`);

    // Check conflicts
    const conflict = yield* checkConflicts(resolved);
    if (Option.isSome(conflict) && !args.force) {
      yield* spin.stop("Conflict detected");
      yield* renderer.error(
        `Conflicts with ${Option.getOrThrow(conflict).name} — use --force to override`,
      );
      yield* renderer.outro("Install cancelled");
      return;
    }
    if (Option.isSome(conflict)) {
      yield* renderer.warn(`Forcing past conflict with ${Option.getOrThrow(conflict).name}`);
    }
    yield* spin.stop("Resolved");

    // Download phase — progress bar
    const files = yield* renderer.withProgress(
      { max: resolved.fileCount },
      `Downloading ${resolved.name}@${resolved.version}`,
      (progress) =>
        Effect.gen(function* () {
          const downloaded: Array<string> = [];
          yield* Effect.forEach(resolved.files, (file) =>
            Effect.gen(function* () {
              yield* downloadFile(file);
              downloaded.push(file.path);
              yield* progress.advance();
            }),
          );
          return downloaded;
        }),
      "Download complete",
    );

    // Post-install
    yield* renderer.withSpinner("Linking…", () => linkSkill(resolved));

    // Machine output — lightweight schema for mutation result
    const resultData = { name: resolved.name, version: resolved.version, files: files.length };
    if (yield* renderer.result(resultData, InstallResult)) return;

    // Interactive summary — flat list of created files
    yield* renderer.tree(
      files.map((f) => ({ data: f })),
      { label: (f) => f, icon: () => "+" },
      "Created files",
    );

    yield* renderer.success(`Installed ${resolved.name}@${resolved.version}`);
    yield* whenNotQuiet(renderer.info(`${files.length} files written`));

    yield* renderer.outro("Done");
  });
```

### D. Watch handler — resultStream, spinner, streaming output

A long-running streaming command: watch for changes and emit events.

**Methods exercised:** `info`, `spinner` (long-lived), `resultStream`, `raw`

```typescript
// commands/skills/watch/handler.ts
import { Effect, Schema, Stream } from "effect";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

const WatchEvent = Schema.Struct({
  type: Schema.String,
  skill: Schema.String,
  version: Schema.String,
  timestamp: Schema.String,
});

interface WatchArgs {
  readonly workspace: string;
  readonly filter: Option.Option<string>;
}

export const handleWatch = (args: WatchArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    yield* renderer.info("Watching workspace for skill changes…");

    const eventStream = watchSkillChanges(args.workspace, args.filter);

    // Machine mode — stream NDJSON events, short-circuit
    if (yield* renderer.resultStream(eventStream, WatchEvent)) return;

    // Interactive mode — live spinner + log each event
    const spin = yield* renderer.spinner("Watching…");

    yield* Stream.runForEach(eventStream, (event) =>
      Effect.gen(function* () {
        yield* spin.update(`Last: ${event.type} ${event.skill} at ${event.timestamp}`);
        yield* renderer.info(`${event.type}: ${event.skill}@${event.version}`);
      }),
    );
  });
```

### E. Export handler — raw, json, no chrome

A data export command: output raw content or structured JSON with no chrome.

**Methods exercised:** `json`, `raw`

```typescript
// commands/workspace/export/handler.ts
import { Effect } from "effect";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

interface ExportArgs {
  readonly format: "json" | "yaml";
}

export const handleExport = (args: ExportArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const workspace = yield* loadWorkspace();

    switch (args.format) {
      case "json":
        // json() writes formatted JSON to stdout in both modes
        yield* renderer.json(workspace.toJSON());
        break;
      case "yaml":
        // raw() writes unformatted string to stdout in both modes
        yield* renderer.raw(workspace.toYAML());
        break;
    }
  });
```

### F. Init handler — full lifecycle with grouped tree

A scaffold command: create files, show grouped status, guide the user. Defines a lightweight output schema for the result shape.

**Methods exercised:** `intro`, `outro`, `step`, `success`, `withSpinner`, `result`, `tree` (grouped with union type), `note`

```typescript
// commands/init/handler.ts
import { Effect, Schema } from "effect";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

const InitResult = Schema.Struct({
  created: Schema.Array(Schema.String),
  skipped: Schema.Array(Schema.String),
});

type GroupNode = { readonly kind: "group"; readonly name: string; readonly count: number };
type FileNode = {
  readonly kind: "file";
  readonly path: string;
  readonly status: "created" | "skipped";
};

export const handleInit = () =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    yield* renderer.intro("Initialize Workspace");
    yield* renderer.step("Setting up workspace");

    const result = yield* renderer.withSpinner("Creating files…", () => scaffoldWorkspace(), {
      stopMessage: (r) => `Created ${r.created.length} files`,
    });

    // Machine output
    const initResult = {
      created: result.created.map((f) => f.path),
      skipped: result.skipped.map((f) => f.path),
    };
    if (yield* renderer.result(initResult, InitResult)) return;

    // Grouped tree: created vs skipped files
    yield* renderer.tree<GroupNode | FileNode>(
      [
        ...(result.created.length > 0
          ? [
              {
                data: { kind: "group" as const, name: "Created", count: result.created.length },
                children: result.created.map((f) => ({
                  data: { kind: "file" as const, path: f.path, status: "created" as const },
                })),
              },
            ]
          : []),
        ...(result.skipped.length > 0
          ? [
              {
                data: {
                  kind: "group" as const,
                  name: "Skipped (already exist)",
                  count: result.skipped.length,
                },
                children: result.skipped.map((f) => ({
                  data: { kind: "file" as const, path: f.path, status: "skipped" as const },
                })),
              },
            ]
          : []),
      ],
      {
        label: (item) => (item.kind === "group" ? `${item.name} (${item.count})` : item.path),
        icon: (item) =>
          item.kind === "file" ? (item.status === "created" ? "+" : "○") : undefined,
      },
    );

    yield* renderer.success("Workspace initialized");

    yield* renderer.note(
      "Next steps:\n  1. Run `axm skills install` to add skills\n  2. Edit settings.json to configure your workspace\n  3. Run `axm skills list` to see installed skills",
      "Getting Started",
    );

    yield* renderer.outro("Ready");
  });
```

### G. Scaffold handler — fromFlagOrPrompt, prompt+renderer interplay

A command that gathers input via prompts (or flags), then executes with renderer output. Demonstrates the gather-then-execute pattern where prompts cluster at the top and output flows below.

**Methods exercised:** `CliPrompt.text`, `CliPrompt.multiselect`, `CliPrompt.confirm`, `fromFlagOrPrompt`, `intro`, `outro`, `success`, `withSpinner`, `result`, `tree` (flat)

```typescript
// commands/new/handler.ts
import { Effect, Option, Schema } from "effect";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt, fromFlagOrPrompt, autoConfirm } from "@axm.sh/core/unstable/cli-prompt";

const NewExtensionResult = Schema.Struct({
  name: Schema.String,
  agents: Schema.Array(Schema.String),
  files: Schema.Array(Schema.String),
});

interface NewHandlerArgs {
  readonly name: Option.Option<string>;
  readonly agents: Option.Option<ReadonlyArray<string>>;
  readonly yes: boolean;
}

export const handleNew = (args: NewHandlerArgs) =>
  Effect.gen(function* () {
    const out = yield* CliRenderer;
    const prompt = yield* CliPrompt;

    yield* out.intro("New Extension");

    // --- Input gathering (prompts cluster at the top) ---
    const name = yield* fromFlagOrPrompt(args.name, () =>
      prompt.text({
        message: "Extension name:",
        validate: (v) => (v.length > 0 ? undefined : "Name is required"),
      }),
    );

    const agents = yield* fromFlagOrPrompt(args.agents, () =>
      prompt.multiselect({
        message: "Which agents should this extension support?",
        options: [
          { value: "claude-code", label: "Claude Code" },
          { value: "cursor", label: "Cursor" },
          { value: "github-copilot", label: "GitHub Copilot" },
        ],
        required: true,
      }),
    );

    // --yes checked explicitly at the handler level
    const proceed = yield* autoConfirm(args.yes, () =>
      prompt.confirm({
        message: `Create extension "${name}" for ${agents.length} agents?`,
      }),
    );
    if (!proceed) {
      yield* out.outro("Cancelled");
      return;
    }

    // --- Execution with output (renderer flows below) ---
    const files = yield* out.withSpinner("Scaffolding extension…", () =>
      scaffoldExtension(name, agents),
    );

    // Machine output
    if (yield* out.result({ name, agents, files: files.map((f) => f.path) }, NewExtensionResult))
      return;

    // Interactive summary
    yield* out.tree(
      files.map((f) => ({ data: f.path })),
      { label: (f) => f },
      "Created files",
    );

    yield* out.success(`Extension "${name}" created`);
    yield* out.outro("Done");
  });
```

**Test for this handler** — TestPrompt provides canned responses, TestRenderer captures output:

```typescript
it("scaffolds extension with prompted inputs", async () => {
  const testPrompt = TestPrompt.make({
    textResponses: ["my-extension"],
    multiselectResponses: [["claude-code", "cursor"]],
    confirmResponses: [true],
  });
  const testRenderer = TestRenderer.make();

  await Effect.runPromise(
    handleNew({ name: Option.none(), agents: Option.none(), yes: false }).pipe(
      Effect.provide(testPrompt.layer),
      Effect.provide(testRenderer.layer),
      // ...other layers
    ),
  );

  // Verify prompts were asked
  expect(testPrompt.state.textCalls).toHaveLength(1);
  expect(testPrompt.state.textCalls[0].message).toBe("Extension name:");
  expect(testPrompt.state.multiselectCalls).toHaveLength(1);
  expect(testPrompt.state.confirmCalls).toHaveLength(1);

  // Verify output
  expect(testRenderer.state.results[0].data).toEqual({
    name: "my-extension",
    agents: ["claude-code", "cursor"],
    files: expect.any(Array),
  });
});

it("skips prompts when flags provided", async () => {
  const testPrompt = TestPrompt.make({ confirmResponses: [true] });
  const testRenderer = TestRenderer.make();

  await Effect.runPromise(
    handleNew({
      name: Option.some("my-extension"),
      agents: Option.some(["claude-code"]),
      yes: false,
    }).pipe(Effect.provide(testPrompt.layer), Effect.provide(testRenderer.layer)),
  );

  // No text or multiselect prompts — flags provided values
  expect(testPrompt.state.textCalls).toHaveLength(0);
  expect(testPrompt.state.multiselectCalls).toHaveLength(0);
  // Confirm still asked (--yes not passed)
  expect(testPrompt.state.confirmCalls).toHaveLength(1);
});
```

### Surface coverage matrix

| Method               | A (list) | B (show)      | C (install) | D (watch) | E (export) | F (init) | G (new) |
| -------------------- | -------- | ------------- | ----------- | --------- | ---------- | -------- | ------- |
| `intro`              | ✓        |               | ✓           |           |            | ✓        | ✓       |
| `outro`              | ✓        |               | ✓           |           |            | ✓        | ✓       |
| `message`            |          |               |             |           |            |          |         |
| `info`               |          |               | ✓           | ✓         |            |          |         |
| `success`            |          |               | ✓           |           |            | ✓        | ✓       |
| `step`               |          | ✓             | ✓           |           |            | ✓        |         |
| `warn`               | ✓        |               | ✓           |           |            |          |         |
| `error`              |          |               | ✓           |           |            |          |         |
| `cancel`             |          |               |             |           |            |          |         |
| `note`               |          | ✓             |             |           |            | ✓        |         |
| `box`                |          |               |             |           |            |          |         |
| `streamLog`          |          |               |             |           |            |          |         |
| `spinner` (manual)   |          |               | ✓           | ✓         |            |          |         |
| `withSpinner`        | ✓        | ✓             | ✓           |           |            | ✓        | ✓       |
| `withProgress`       |          |               | ✓           |           |            |          |         |
| `taskLog`            |          |               |             |           |            |          |         |
| `runTasks`           |          |               |             |           |            |          |         |
| `emitMany`           | ✓        |               |             |           |            |          |         |
| `emitOne`            |          | ✓             |             |           |            |          |         |
| `result` (direct)    |          |               | ✓           |           |            | ✓        | ✓       |
| `detail`             |          | (via emitOne) |             |           |            |          |         |
| `tree` (flat)        |          |               | ✓           |           |            |          | ✓       |
| `tree` (nested)      |          | ✓             |             |           |            |          |         |
| `tree` (grouped)     |          |               |             |           |            | ✓        |         |
| `resultStream`       |          |               |             | ✓         |            |          |         |
| `json`               |          |               |             |           | ✓          |          |         |
| `raw`                |          |               |             |           | ✓          |          |         |
| `whenNotQuiet`       |          |               | ✓           |           |            |          |         |
| `prompt.text`        |          |               |             |           |            |          | ✓       |
| `prompt.multiselect` |          |               |             |           |            |          | ✓       |
| `prompt.confirm`     |          |               |             |           |            |          | ✓       |
| `fromFlagOrPrompt`   |          |               |             |           |            |          | ✓       |
