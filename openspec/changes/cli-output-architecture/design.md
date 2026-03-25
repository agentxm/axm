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

- Interactive prompt redesign (Input service unchanged)
- Telemetry/observability output changes
- Error formatting changes (AppError rendering stays in runtime-envelope)
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
    // Chrome (stderr in both modes; no-op in machine mode)
    readonly intro: (title: string) => Effect<void>;
    readonly outro: (message: string) => Effect<void>;
    readonly info: (message: string) => Effect<void>;
    readonly success: (message: string) => Effect<void>;
    readonly step: (message: string) => Effect<void>;
    readonly warn: (message: string) => Effect<void>;
    readonly error: (message: string) => Effect<void>;
    readonly note: (message: string, title?: string) => Effect<void>;
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

    // Data display (stdout; only executes in interactive mode after result() short-circuit)
    readonly table: <T>(
      items: ReadonlyArray<T>,
      columns: ReadonlyArray<ColumnDef<T>>,
      caption?: string,
    ) => Effect<void>;
    readonly tree: <T>(
      roots: ReadonlyArray<TreeNode<T>>,
      def: TreeDef<T>,
      title?: string,
    ) => Effect<void>;

    // Machine data output (stdout; no-op in interactive mode)
    readonly result: (data: unknown) => Effect<boolean>;
    readonly resultStream: (stream: Stream<unknown>) => Effect<boolean>;

    // Both modes (stdout)
    readonly json: (data: unknown) => Effect<void>;
    readonly raw: (content: string) => Effect<void>;
  }
>()("@axm.sh/cli/CliRenderer") {}
```

**LogMessage** is a tagged union used internally by renderer implementations for structured capture (TestRenderer) and filtering:

```typescript
type LogMessage =
  | { readonly _tag: "info"; readonly message: string }
  | { readonly _tag: "success"; readonly message: string }
  | { readonly _tag: "step"; readonly message: string }
  | { readonly _tag: "warn"; readonly message: string }
  | { readonly _tag: "error"; readonly message: string };
```

The per-level methods on the service interface (`info`, `success`, `step`, `warn`, `error`) delegate to `LogMessage` internally. Handlers call `renderer.step("msg")` directly — the tagged union is an implementation detail, not part of the handler-facing API.

### 2. Replace --output-format with per-command --json

**Decision:** A per-command `--json` boolean flag replaces the global `--output-format text|json|stream-json`. Only commands that declare an output schema (Decision 7) include the flag. The flag feeds into renderer layer selection — when active, the `MachineRenderer` is used, which suppresses chrome and makes data display methods no-ops.

**Alternatives considered:**

- (a) Keep `--output-format` with three values → users shouldn't choose between json and stream-json; the handler knows
- (b) Global `--json` flag on every command → commands without structured output (e.g., `init`) would accept `--json` and do nothing
- (c) Per-command `--json` flag → chosen; only appears in `--help` for commands that support it
- (d) No flag, always auto-detect from TTY → removes explicit opt-in, surprising when stdout is a TTY but user wants JSON

**Rationale:** `--json` is per-command in the CLI parser — a reusable `Flag` definition in `cli-flags/index.ts`, declared in the command config. It only appears in `--help` for commands that support it.

However, the flag drives renderer layer selection, not handler branching. The `run()` boundary scans argv for `--json` (same early-resolution mechanism as the current `resolveFormatFromArgv`) to select the `MachineRenderer`. This gives automatic chrome suppression — `axm skills list --json | jq` produces clean JSON on stdout with no spinner messages on stderr.

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
- (b) Embed in CliEnvironment (add level to existing service) → CliEnvironment is about environment detection, not output policy
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

The existing `debugFlag` and `verboseFlag` in `cli-flags` are reused. A new `quietFlag` is added. Conflict resolution: highest wins (`-q -v` → verbose). The resolved level is provided via `makeVerbosityLayer(level)` at the `run()` boundary.

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
    const v = yield* Verbosity;
    const skills = yield* fetchSkills(args);

    // Verbose JSON includes extra fields; result() short-circuits in machine mode
    const data = v.isAtLeast("verbose")
      ? skills.map((s) => ({ ...s, source: s.source, installedAt: s.installedAt }))
      : skills.map((s) => ({ name: s.name, version: s.version, enabled: s.enabled }));
    if (yield* renderer.result(data)) return;

    // Table columns with priority handle verbose display automatically
    yield* renderer.table(skills, columns);
    yield* whenVerbose(renderer.info(`${skills.length} skills found`));
  });
```

### 4. Stdout/stderr channel separation

**Decision:** Enforce channel separation unconditionally in both modes.

| Channel    | Methods                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| **stdout** | `result`, `resultStream`, `table`, `tree`, `json`, `raw`                                    |
| **stderr** | `intro`, `outro`, `info`, `success`, `step`, `warn`, `error`, `note`, `spinner`, `progress` |

**Rationale:** This makes `axm skills list --json | jq` work cleanly — chrome goes to stderr, JSON goes to stdout. When piping without `--json`, chrome is still visible on stderr while stdout carries nothing (handler didn't call `result()`). The current implementation already routes structured output chrome to `console.error` — this formalizes and extends that pattern.

### 5. Two-axis terminal detection

**Decision:** Detect `canRender` and `isInteractive` independently.

| Axis            | Detection                                              | Purpose                            |
| --------------- | ------------------------------------------------------ | ---------------------------------- |
| `canRender`     | `stdout.isTTY`, `FORCE_COLOR`, `NO_COLOR`, `TERM=dumb` | Colors, box-drawing characters     |
| `isInteractive` | `canRender && !isCI`                                   | Animated spinners, dynamic updates |

**Rationale:** CI environments (GitHub Actions) have TTY-like stdout but shouldn't get animated spinners. Currently, CI detection is done via `isNonInteractive` which conflates "don't prompt" with "don't animate." Splitting into two axes lets CI get colored static output (spinner start/stop messages) without animation frames.

These axes are resolved once at the `run()` boundary and stored in a `TerminalCapabilities` value provided to the renderer layer.

### 6. result() / resultStream() return boolean

**Decision:** `result()` returns `true` in machine mode (data emitted), `false` in interactive mode (no-op). This enables the short-circuit idiom:

```typescript
if (yield * renderer.result(data)) return;
// ... interactive table/tree rendering follows
```

**Alternatives considered:**

- (a) Handlers call both `result()` and `table()` unconditionally; each is a no-op in the wrong mode → works but wastes table formatting effort in machine mode
- (b) Handler branches on its own `--json` flag → handler takes on chrome suppression responsibility; if handler forgets to return, both `result()` and `table()` write to stdout
- (c) Boolean return with short-circuit → chosen; explicit, handler reads clearly, chrome suppression is automatic

**Rationale:** This is the _only_ format-aware branch a handler should contain. It exists because interactive mode needs to collect and format data differently (tables, summaries) than machine mode (raw JSON). The renderer handles mode switching — the handler just checks the boolean. Chrome suppression, `table()`/`tree()` no-ops, and clean stdout are all handled by the `MachineRenderer` without handler involvement.

### 7. Schema-driven output with annotations

**Decision:** Each command that supports `--json` declares a single Effect `Schema` for its output shape. The schema is annotated with display metadata (column headers, priority, alignment, formatting). One definition drives five outputs: TypeScript types, JSON serialization, table columns, JSON Schema documentation, and field descriptions.

**Alternatives considered:**

- (a) Separate schema + hand-written `ColumnDef<T>` arrays → two definitions to keep in sync; handlers manually construct column arrays
- (b) Schema with display annotations → chosen; single source of truth, columns derived automatically

#### Output annotations

Symbol-keyed annotations that Effect Schema carries on fields. The renderer reads them; JSON serialization ignores them.

```typescript
// output/annotations.ts

const ColumnHeader = Symbol.for("axm/output/ColumnHeader");
const ColumnPriority = Symbol.for("axm/output/ColumnPriority");
const ColumnAlign = Symbol.for("axm/output/ColumnAlign");
const ColumnWidth = Symbol.for("axm/output/ColumnWidth");
const DisplayFormat = Symbol.for("axm/output/DisplayFormat");
const Hidden = Symbol.for("axm/output/Hidden");

// Annotation helper — wraps Schema.annotations for ergonomics
const column = (opts: {
  header: string;
  priority?: number; // 0 = always, 1 = verbose. Default 0
  align?: "left" | "right";
  width?: "auto" | "fill" | number;
  format?: (value: unknown) => string;
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
    column({ header: "Enabled", format: (v) => ((v as boolean) ? "yes" : "no") }),
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

A utility reads annotations from the schema AST and produces `ColumnDef<T>` arrays:

```typescript
// output/output-def.ts

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
  if (ast._tag !== "TypeLiteral") return [];

  return ast.propertySignatures
    .filter((prop) => !prop.type.annotations?.[Hidden])
    .filter((prop) => prop.type.annotations?.[ColumnHeader] !== undefined)
    .map((prop) => {
      const ann = prop.type.annotations ?? {};
      const key = String(prop.name);
      const format = ann[DisplayFormat] as ((v: unknown) => string) | undefined;
      return {
        key,
        header: ann[ColumnHeader] as string,
        value: (item: T) => {
          const raw = (item as Record<string, unknown>)[key];
          if (format) return format(raw);
          if (raw == null) return "";
          return String(raw);
        },
        priority: (ann[ColumnPriority] as number) ?? 0,
        align: (ann[ColumnAlign] as "left" | "right") ?? "left",
        width: (ann[ColumnWidth] as "auto" | "fill" | number) ?? "auto",
      };
    });
};
```

#### Emit helpers

`emitOne` and `emitMany` tie the schema to the renderer — one function handles the entire result/table output path:

```typescript
// output/command-output.ts

interface CommandOutputOpts<T> {
  readonly schema: Schema.Schema<T>;
  readonly title?: string;
}

// For array output (list commands)
const emitMany = <T>(items: ReadonlyArray<T>, opts: CommandOutputOpts<T>) =>
  Effect.gen(function* () {
    const out = yield* CliRenderer;
    if (yield* out.result(items.map(Schema.encodeSync(opts.schema)))) return;
    yield* out.table(items, columnsFrom(opts.schema), opts.title);
  });

// For single-item output (detail/info commands)
const emitOne = <T>(data: T, opts: CommandOutputOpts<T>) =>
  Effect.gen(function* () {
    const out = yield* CliRenderer;
    if (yield* out.result(Schema.encodeSync(opts.schema)(data))) return;
    yield* out.table([data], columnsFrom(opts.schema), opts.title);
  });
```

#### What one definition drives

| Derived artifact   | How                                                               |
| ------------------ | ----------------------------------------------------------------- |
| TypeScript types   | `typeof SkillListItem.Type` — inferred by Effect Schema           |
| JSON serialization | `Schema.encode` — validated, typed                                |
| Table columns      | `columnsFrom(schema)` — reads annotations, produces `ColumnDef[]` |
| JSON Schema files  | `JSONSchema.make(schema)` — standard JSON Schema for docs         |
| Field descriptions | `Schema.annotations({ description })` — carried to JSON Schema    |

**Verbosity is automatic via `priority`.** The renderer filters columns by priority based on the resolved verbosity level. A `priority: 1` column only appears when `--verbose` is active. Handlers define the schema once; the renderer handles the rest.

**The `hidden()` annotation** is for fields that should appear in JSON output but never in tables — internal identifiers, integrity hashes, metadata useful for machines but noise for humans.

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

**table() and tree() stay on the service interface** even though the `result()` short-circuit means they only execute in interactive mode. Removing them would force handlers to call standalone utilities directly, and the TestRenderer couldn't capture what was displayed. Keeping them on the interface preserves testability: `expect(testRenderer.tables).toHaveLength(1)`.

### 9. Unified tree primitive for structured non-tabular output

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

### 10. Three renderer implementations

**Decision:** Three `Layer` implementations, selected at the `run()` boundary:

| Implementation        | Purpose                                        | Selection           |
| --------------------- | ---------------------------------------------- | ------------------- |
| `InteractiveRenderer` | Clack-based chrome, formatted tables and trees | TTY + no `--json`   |
| `MachineRenderer`     | JSON/NDJSON to stdout, chrome suppressed       | `--json` or non-TTY |
| `TestRenderer`        | Captures structured calls                      | Test layers         |

**Alternatives considered:**

- (a) Single class with mode flag (Rich pattern) → simpler code but harder to test; every method has an if/else
- (b) Two production implementations + test → chosen; each implementation is straightforward with no branching

The `MachineRenderer` makes chrome methods no-ops (no spinner text on stderr when piping), `table()`/`tree()` no-ops (display is irrelevant in machine mode), and `result()`/`resultStream()` write JSON to stdout and return `true`. The `InteractiveRenderer` does the inverse: chrome methods render via Clack, `table()`/`tree()` format to stdout, `result()` is a no-op returning `false`.

Selection uses `Layer.unwrapEffect` at the `run()` boundary, matching the current `makeUiLayer` pattern but producing a single `CliRenderer` layer instead of `Output | Activity`.

### 11. TestRenderer design

**Decision:** The test renderer captures all calls as structured data in a mutable state object, extending the current `makeOutputTestLayer` pattern to cover the full CliRenderer surface.

```typescript
interface TestRendererState {
  readonly logs: Array<LogMessage>; // captured from per-level methods (info, step, etc.)
  readonly tables: Array<{
    items: Array<unknown>;
    columns: Array<ColumnDef<unknown>>;
    caption?: string;
  }>;
  readonly trees: Array<{ roots: Array<TreeNode<unknown>>; def: TreeDef<unknown>; title?: string }>;
  readonly results: Array<unknown>;
  readonly spinnerMessages: Array<string>;
  readonly notes: Array<{ message: string; title?: string }>;
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

### 12. Layer wiring

The composition at the `run()` boundary:

```
CliEnvironment (nonInteractive, from argv/env)
  ├── Verbosity (from -q / -v / -vv flags)
  ├── CliRenderer (from --json + TTY detection)
  │     ├── InteractiveRenderer (TTY, no --json)
  │     ├── MachineRenderer (--json or piped stdout)
  │     └── TestRenderer (test layers)
  └── Effect LogLevel (derived from verbosity)
```

`makeFoundationLayer(format)` becomes `makeFoundationLayer(options)` where options includes the resolved `--json` flag and terminal capabilities. The `--json` flag is per-command in the CLI parser but resolved early via argv scanning (same mechanism as the current `resolveFormatFromArgv`) so it's available at layer construction time. The foundation provides `CliRenderer | Verbosity | Input | CliEnvironment`.

## Risks / Trade-offs

**Single service may grow large** → CliRenderer has ~15 methods. If features like streaming tables or interactive selection are added later, the interface could bloat.
Mitigation: The service is intentionally flat (no nested namespaces). If it grows past ~20 methods, split into trait-like sub-interfaces composed via intersection types. This is a future concern, not a current one.

**Schema-per-command is upfront work** → Every `--json`-supporting command needs a schema before shipping machine output.
Mitigation: Start with commands that already have ad-hoc JSON (whoami). Add schemas incrementally as commands gain `--json` support. Commands without a schema simply don't expose `--json`.

**Custom table and tree formatter maintenance** → Building table and tree renderers instead of using a library means maintaining layout logic. The tree formatter is recursive (indentation, guide lines, box-drawing connectors, variable-width icons including emoji) and has more surface area than the table formatter.
Mitigation: Both formatters are minimal and deliberately scoped. The table formatter handles columns, alignment, and truncation. The tree formatter handles indentation and connectors. If requirements grow, re-evaluate library adoption.

**Verbosity helpers add boilerplate** → Handlers wrap output calls in `whenVerbose(...)` / `whenNotQuiet(...)`.
Mitigation: This is explicit and readable — better than implicit filtering. The alternative (renderer checks verbosity internally) would couple format and volume decisions.

**Schema AST traversal may be fragile** → `columnsFrom` walks Effect Schema's AST to read annotations from property signatures. The AST is public API but not trivial to traverse — property signatures may be wrapped in transformations, optionals, or refinements, which could hide annotations behind intermediate AST nodes.
Mitigation: Spike `columnsFrom` against a non-trivial schema (nested optionals, branded types, enums, `Schema.optional`) before building the full infrastructure. If AST traversal proves too fragile, fall back to a registration pattern where schemas call a `registerColumns()` function alongside the struct definition — less elegant but robust.

## Appendix: Handler Sketches

These sketches demonstrate the full CliRenderer surface area across realistic handler implementations. Each handler is annotated with the methods it exercises.

### A. List handler — emitMany, withSpinner, intro/outro

A typical CRUD list command: fetch data, show as table interactively or JSON in machine mode. The output schema (defined in `output.ts`) drives both paths.

**Methods exercised:** `intro`, `outro`, `warn`, `withSpinner`, `emitMany`

```typescript
// commands/skills/list/output.ts
import { Schema } from "effect";
import { column } from "@/output/annotations";

export const SkillListItem = Schema.Struct({
  name: Schema.String.pipe(column({ header: "Name", width: "fill" })),
  version: Schema.String.pipe(column({ header: "Version", width: "auto" })),
  enabled: Schema.Boolean.pipe(
    column({ header: "Enabled", format: (v) => ((v as boolean) ? "yes" : "no") }),
  ),
  source: Schema.String.pipe(column({ header: "Source", priority: 1 })),
  installedAt: Schema.String.pipe(column({ header: "Installed", priority: 1 })),
});

export type SkillListItem = typeof SkillListItem.Type;
```

```typescript
// commands/skills/list/handler.ts
import { Effect, Option } from "effect";
import { CliRenderer } from "@/cli-renderer";
import { emitMany } from "@/output/command-output";
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

### B. Show handler — emitOne, tree (nested), note

A detail/inspect command: show structured info about a single entity, with nested dependencies.

**Methods exercised:** `step`, `withSpinner`, `emitOne`, `tree` (nested), `note`

```typescript
// commands/skills/show/output.ts
import { Schema } from "effect";
import { column } from "@/output/annotations";

export const SkillInfo = Schema.Struct({
  name: Schema.String.pipe(column({ header: "Name" })),
  version: Schema.String.pipe(column({ header: "Version" })),
  type: Schema.String.pipe(column({ header: "Type" })),
  source: Schema.String.pipe(column({ header: "Source" })),
  publisher: Schema.String.pipe(column({ header: "Publisher" })),
  license: Schema.optional(Schema.String).pipe(column({ header: "License" })),
  enabled: Schema.Boolean.pipe(
    column({ header: "Enabled", format: (v) => ((v as boolean) ? "yes" : "no") }),
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
import { CliRenderer } from "@/cli-renderer";
import { emitOne } from "@/output/command-output";
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

    // Schema drives JSON + key-value table in interactive mode
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
    if (Option.isSome(skill.deprecation)) {
      yield* renderer.note(
        `This skill is deprecated: ${Option.getOrThrow(skill.deprecation)}\n\nConsider migrating to ${skill.replacement ?? "an alternative"}.`,
        "Deprecation Notice",
      );
    }
  });
```

### C. Install handler — progress, spinner lifecycle, log variants, tree (flat list)

A mutation command: install with progress tracking, multiple log levels, and a file summary. Mutation commands typically use `result()` directly rather than `emitOne`/`emitMany` since their output shape is ad-hoc (not a domain entity with meaningful table columns).

**Methods exercised:** `intro`, `outro`, `info`, `success`, `warn`, `error`, `step`, `spinner` (manual handle), `withProgress`, `result`, `tree` (flat list)

```typescript
// commands/skills/install/handler.ts
import { Effect, Option } from "effect";
import { CliRenderer, whenNotQuiet } from "@/cli-renderer";

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
      { total: resolved.fileCount },
      `Downloading ${resolved.name}@${resolved.version}`,
      (progress) =>
        Effect.gen(function* () {
          const downloaded: Array<string> = [];
          yield* Effect.forEach(resolved.files, (file) =>
            Effect.gen(function* () {
              yield* downloadFile(file);
              downloaded.push(file.path);
              yield* progress.increment();
            }),
          );
          return downloaded;
        }),
      "Download complete",
    );

    // Post-install
    yield* renderer.withSpinner("Linking…", () => linkSkill(resolved));

    // Machine output — ad-hoc shape, not a domain schema
    const resultData = { name: resolved.name, version: resolved.version, files: files.length };
    if (yield* renderer.result(resultData)) return;

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
import { Effect, Stream } from "effect";
import { CliRenderer } from "@/cli-renderer";

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
    if (yield* renderer.resultStream(eventStream)) return;

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
import { CliRenderer } from "@/cli-renderer";

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

A scaffold command: create files, show grouped status, guide the user. Like install, uses `result()` directly since the output shape is ad-hoc.

**Methods exercised:** `intro`, `outro`, `step`, `success`, `withSpinner`, `result`, `tree` (grouped with union type), `note`

```typescript
// commands/init/handler.ts
import { Effect } from "effect";
import { CliRenderer } from "@/cli-renderer";

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

    // Machine output — ad-hoc shape
    if (
      yield* renderer.result({
        created: result.created.map((f) => f.path),
        skipped: result.skipped.map((f) => f.path),
      })
    )
      return;

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

### Surface coverage matrix

| Method             | A (list) | B (show) | C (install) | D (watch) | E (export) | F (init) |
| ------------------ | -------- | -------- | ----------- | --------- | ---------- | -------- |
| `intro`            | ✓        |          | ✓           |           |            | ✓        |
| `outro`            | ✓        |          | ✓           |           |            | ✓        |
| `info`             |          |          | ✓           | ✓         |            |          |
| `success`          |          |          | ✓           |           |            | ✓        |
| `step`             |          | ✓        | ✓           |           |            | ✓        |
| `warn`             | ✓        |          | ✓           |           |            |          |
| `error`            |          |          | ✓           |           |            |          |
| `note`             |          | ✓        |             |           |            | ✓        |
| `spinner` (manual) |          |          | ✓           | ✓         |            |          |
| `withSpinner`      | ✓        | ✓        | ✓           |           |            | ✓        |
| `withProgress`     |          |          | ✓           |           |            |          |
| `emitMany`         | ✓        |          |             |           |            |          |
| `emitOne`          |          | ✓        |             |           |            |          |
| `result` (direct)  |          |          | ✓           |           |            | ✓        |
| `tree` (flat)      |          |          | ✓           |           |            |          |
| `tree` (nested)    |          | ✓        |             |           |            |          |
| `tree` (grouped)   |          |          |             |           |            | ✓        |
| `resultStream`     |          |          |             | ✓         |            |          |
| `json`             |          |          |             |           | ✓          |          |
| `raw`              |          |          |             |           | ✓          |          |
| `whenNotQuiet`     |          |          | ✓           |           |            |          |
