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
    readonly log: (message: LogMessage) => Effect<void>;
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

**LogMessage** is a tagged union replacing the current per-level methods:

```typescript
type LogMessage =
  | { readonly _tag: "info"; readonly message: string }
  | { readonly _tag: "success"; readonly message: string }
  | { readonly _tag: "step"; readonly message: string }
  | { readonly _tag: "warn"; readonly message: string }
  | { readonly _tag: "error"; readonly message: string };
```

Convenience constructors (`Log.info("msg")`, `Log.warn("msg")`) reduce verbosity at call sites.

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
    yield* whenVerbose(renderer.log(Log.info(`${skills.length} skills found`)));
  });
```

### 4. Stdout/stderr channel separation

**Decision:** Enforce channel separation unconditionally in both modes.

| Channel    | Methods                                                  |
| ---------- | -------------------------------------------------------- |
| **stdout** | `result`, `resultStream`, `table`, `tree`, `json`, `raw` |
| **stderr** | `intro`, `outro`, `log`, `note`, `spinner`, `progress`   |

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

### 7. Schema-per-command for typed output

**Decision:** Each command that supports `--json` declares an Effect `Schema` for its output shape. This schema is the single source of truth for:

- JSON field names and types
- Runtime validation
- Future: shell tab-completion for field names

```typescript
// In skills/list/schema.ts
export const SkillListResult = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  source: Schema.String,
  enabled: Schema.Boolean,
});
```

Column definitions for `table()` are co-located with the schema but defined separately as `ColumnDef<T>` arrays — they express display concerns (headers, widths, alignment, priority) that don't belong in the data schema. The typed `items` array is the same data passed to both `result()` and `table()` — one data shape, two output paths.

**Rationale:** Schema validates the data contract for machine consumers. Column definitions control the human presentation. Keeping them separate avoids polluting data schemas with display annotations, while co-locating them ensures they stay in sync.

### 8. Typed table API with column definitions

**Decision:** `table()` takes typed data + column definitions, not pre-stringified rows. The renderer owns all formatting decisions.

```typescript
interface ColumnDef<T> {
  readonly header: string;
  readonly value: (item: T) => string;
  readonly width?: "auto" | "fill" | number;
  readonly align?: "left" | "right";
  readonly priority?: number; // 0 = always shown (default), 1 = verbose only
}
```

Handler usage:

```typescript
yield *
  renderer.table(skills, [
    { header: "Name", value: (s) => s.name, width: "fill" },
    { header: "Version", value: (s) => s.version, width: "auto" },
    { header: "Source", value: (s) => s.source, priority: 1 },
  ]);
```

**Alternatives considered:**

- (a) `TableData` with `ReadonlyArray<ReadonlyArray<string>>` → handler stringifies data before the renderer sees it; renderer can't truncate intelligently, align by type, or adapt to terminal width
- (b) Typed items + column defs → chosen

**Rationale:** The renderer needs the raw data and column metadata to make formatting decisions: right-align numbers, truncate long names with ellipsis, adapt columns to terminal width, and filter by `priority` based on available space or verbosity. Pre-stringified rows strip this information.

The `priority` field replaces the pattern of writing separate `whenNotQuiet(table(...))` and `whenVerbose(table(...))` calls with different column sets — one `table()` call with priority annotations handles both.

The `TestRenderer` captures both the raw `items` array and the `columns` definitions. Tests assert on typed data, not formatted strings.

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
  readonly logs: Array<LogMessage>;
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

## Appendix: Handler Sketches

These sketches demonstrate the full CliRenderer surface area across realistic handler implementations. Each handler is annotated with the methods it exercises.

### A. List handler — table, result, withSpinner, intro/outro, verbosity

A typical CRUD list command: fetch data, show as table interactively or JSON in machine mode.

**Methods exercised:** `intro`, `outro`, `log` (info, warn), `withSpinner`, `result`, `table`

```typescript
// commands/skills/list/handler.ts
import { Effect, Option } from "effect";
import { CliRenderer, Log, whenVerbose, whenNotQuiet } from "@/cli-renderer";
import { Verbosity } from "@/verbosity";

interface ListArgs {
  readonly workspace: string;
  readonly tag: Option.Option<string>;
}

const columns: ReadonlyArray<ColumnDef<Skill>> = [
  { header: "Name", value: (s) => s.name, width: "fill" },
  { header: "Version", value: (s) => s.version, width: "auto" },
  { header: "Enabled", value: (s) => (s.enabled ? "yes" : "no"), width: "auto" },
  { header: "Source", value: (s) => s.source, width: "auto", priority: 1 },
  { header: "Installed", value: (s) => s.installedAt.toISOString(), width: "auto", priority: 1 },
];

export const handleList = (args: ListArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const v = yield* Verbosity;

    yield* renderer.intro("Skills");

    const skills = yield* renderer.withSpinner("Fetching skills…", () => fetchSkills(args), {
      stopMessage: (result) => `Found ${result.length} skills`,
    });

    if (skills.length === 0) {
      yield* renderer.log(Log.warn("No skills installed"));
      yield* renderer.outro("Done");
      return;
    }

    // Machine output — short-circuit if active
    const data = v.isAtLeast("verbose")
      ? skills.map((s) => ({
          name: s.name,
          version: s.version,
          enabled: s.enabled,
          source: s.source,
          installedAt: s.installedAt,
        }))
      : skills.map((s) => ({ name: s.name, version: s.version, enabled: s.enabled }));
    if (yield* renderer.result(data)) return;

    // Interactive display
    yield* renderer.table(skills, columns);
    yield* whenVerbose(
      renderer.log(Log.info(`${skills.length} skills across ${countSources(skills)} sources`)),
    );

    yield* renderer.outro("Done");
  });
```

### B. Show handler — tree (key-value + nested), note, json

A detail/inspect command: show structured info about a single entity, with nested dependencies.

**Methods exercised:** `log` (step, error), `withSpinner`, `result`, `tree` (key-value and nested), `note`

```typescript
// commands/skills/show/handler.ts
import { Effect, Option } from "effect";
import { CliRenderer, Log } from "@/cli-renderer";

interface ShowArgs {
  readonly name: string;
}

export const handleShow = (args: ShowArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    yield* renderer.log(Log.step(`Looking up ${args.name}`));

    const skill = yield* renderer.withSpinner(`Resolving ${args.name}…`, () =>
      resolveSkill(args.name),
    );

    // Machine output
    if (yield* renderer.result(skill)) return;

    // Key-value display via tree (depth-1, detail as value)
    yield* renderer.tree(
      [
        { data: { key: "Version", value: skill.version } },
        { data: { key: "Type", value: skill.type } },
        { data: { key: "Source", value: skill.source } },
        { data: { key: "Publisher", value: skill.publisher } },
        { data: { key: "License", value: Option.getOrElse(skill.license, () => "—") } },
        { data: { key: "Enabled", value: skill.enabled ? "yes" : "no" } },
      ],
      { label: (kv) => kv.key, detail: (kv) => kv.value },
      skill.name,
    );

    // Dependency tree (nested)
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

A mutation command: install with progress tracking, multiple log levels, and a file summary.

**Methods exercised:** `intro`, `outro`, `log` (info, success, warn, error, step), `spinner` (manual handle), `withProgress`, `result`, `tree` (flat list)

```typescript
// commands/skills/install/handler.ts
import { Effect, Option } from "effect";
import { CliRenderer, Log, whenNotQuiet } from "@/cli-renderer";

interface InstallArgs {
  readonly name: string;
  readonly version: Option.Option<string>;
  readonly force: boolean;
}

export const handleInstall = (args: InstallArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    yield* renderer.intro("Install Skill");
    yield* renderer.log(Log.step(`Installing ${args.name}`));

    // Resolve phase — manual spinner for multi-step control
    const spin = yield* renderer.spinner("Resolving version…");
    const resolved = yield* resolveVersion(args.name, args.version);
    yield* spin.update(`Resolved ${resolved.name}@${resolved.version}`);

    // Check conflicts
    const conflict = yield* checkConflicts(resolved);
    if (Option.isSome(conflict) && !args.force) {
      yield* spin.stop("Conflict detected");
      yield* renderer.log(
        Log.error(`Conflicts with ${Option.getOrThrow(conflict).name} — use --force to override`),
      );
      yield* renderer.outro("Install cancelled");
      return;
    }
    if (Option.isSome(conflict)) {
      yield* renderer.log(
        Log.warn(`Forcing past conflict with ${Option.getOrThrow(conflict).name}`),
      );
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

    // Machine output
    const resultData = { name: resolved.name, version: resolved.version, files: files.length };
    if (yield* renderer.result(resultData)) return;

    // Interactive summary — flat list of created files
    yield* renderer.tree(
      files.map((f) => ({ data: f })),
      { label: (f) => f, icon: () => "+" },
      "Created files",
    );

    yield* renderer.log(Log.success(`Installed ${resolved.name}@${resolved.version}`));
    yield* whenNotQuiet(renderer.log(Log.info(`${files.length} files written`)));

    yield* renderer.outro("Done");
  });
```

### D. Watch handler — resultStream, spinner, streaming output

A long-running streaming command: watch for changes and emit events.

**Methods exercised:** `log` (info), `spinner` (long-lived), `resultStream`, `raw`

```typescript
// commands/skills/watch/handler.ts
import { Effect, Stream } from "effect";
import { CliRenderer, Log } from "@/cli-renderer";

interface WatchArgs {
  readonly workspace: string;
  readonly filter: Option.Option<string>;
}

export const handleWatch = (args: WatchArgs) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    yield* renderer.log(Log.info("Watching workspace for skill changes…"));

    const eventStream = watchSkillChanges(args.workspace, args.filter);

    // Machine mode — stream NDJSON events, short-circuit
    if (yield* renderer.resultStream(eventStream)) return;

    // Interactive mode — live spinner + log each event
    const spin = yield* renderer.spinner("Watching…");

    yield* Stream.runForEach(eventStream, (event) =>
      Effect.gen(function* () {
        yield* spin.update(`Last: ${event.type} ${event.skill} at ${event.timestamp}`);
        yield* renderer.log(Log.info(`${event.type}: ${event.skill}@${event.version}`));
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

A scaffold command: create files, show grouped status, guide the user.

**Methods exercised:** `intro`, `outro`, `log` (step, success), `withSpinner`, `result`, `tree` (grouped with union type), `note`

```typescript
// commands/init/handler.ts
import { Effect } from "effect";
import { CliRenderer, Log } from "@/cli-renderer";

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
    yield* renderer.log(Log.step("Setting up workspace"));

    const result = yield* renderer.withSpinner("Creating files…", () => scaffoldWorkspace(), {
      stopMessage: (r) => `Created ${r.created.length} files`,
    });

    // Machine output
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

    yield* renderer.log(Log.success("Workspace initialized"));

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
| `outro`            | ✓        | ✓        | ✓           |           |            | ✓        |
| `log` (info)       | ✓        |          | ✓           | ✓         |            |          |
| `log` (success)    |          |          | ✓           |           |            | ✓        |
| `log` (step)       |          | ✓        | ✓           |           |            | ✓        |
| `log` (warn)       | ✓        |          | ✓           |           |            |          |
| `log` (error)      |          |          | ✓           |           |            |          |
| `note`             |          | ✓        |             |           |            | ✓        |
| `spinner` (manual) |          |          | ✓           | ✓         |            |          |
| `withSpinner`      | ✓        | ✓        | ✓           |           |            | ✓        |
| `withProgress`     |          |          | ✓           |           |            |          |
| `table`            | ✓        |          |             |           |            |          |
| `tree` (flat)      |          |          | ✓           |           |            |          |
| `tree` (key-value) |          | ✓        |             |           |            |          |
| `tree` (nested)    |          | ✓        |             |           |            |          |
| `tree` (grouped)   |          |          |             |           |            | ✓        |
| `result`           | ✓        | ✓        | ✓           |           |            | ✓        |
| `resultStream`     |          |          |             | ✓         |            |          |
| `json`             |          |          |             |           | ✓          |          |
| `raw`              |          |          |             |           | ✓          |          |
| `whenVerbose`      | ✓        |          |             |           |            |          |
| `whenNotQuiet`     |          |          | ✓           |           |            |          |
