## ADDED Requirements

### Requirement: result() emits schema-validated JSON and returns mode indicator

The `CliRenderer.result(data, schema)` method SHALL validate `data` against the provided Effect `Schema`, emit the validated JSON to stdout in machine mode and return `true`, or no-op and return `false` in interactive mode. This enables the short-circuit idiom for mode branching.

#### Scenario: result() in machine mode emits JSON and returns true

- **WHEN** the `MachineRenderer` is active
- **AND** a handler calls `renderer.result(data, OutputSchema)`
- **THEN** the data SHALL be validated against `OutputSchema`
- **AND** the validated JSON SHALL be written to stdout
- **AND** the method SHALL return `true`

#### Scenario: result() in interactive mode is no-op and returns false

- **WHEN** the `InteractiveRenderer` is active
- **AND** a handler calls `renderer.result(data, OutputSchema)`
- **THEN** no output SHALL be produced
- **AND** the method SHALL return `false`

#### Scenario: Short-circuit idiom prevents dual output

- **WHEN** a handler uses `if (yield* renderer.result(data, schema)) return;`
- **AND** machine mode is active
- **THEN** only JSON SHALL be emitted
- **AND** subsequent interactive display calls (`table`, `tree`, etc.) SHALL NOT execute

### Requirement: resultStream() emits NDJSON with sequence numbers

The `CliRenderer.resultStream(stream, schema)` method SHALL consume a `Stream<T>` and emit each item as a NDJSON line on stdout in machine mode, returning `true`. In interactive mode it SHALL no-op and return `false`.

#### Scenario: resultStream() in machine mode emits NDJSON

- **WHEN** the `MachineRenderer` is active
- **AND** a handler calls `renderer.resultStream(eventStream, EventSchema)`
- **THEN** each stream item SHALL be validated against `EventSchema`
- **AND** each SHALL be emitted as a newline-delimited JSON line on stdout
- **AND** the method SHALL return `true`

#### Scenario: resultStream() in interactive mode is no-op

- **WHEN** the `InteractiveRenderer` is active
- **AND** a handler calls `renderer.resultStream(eventStream, EventSchema)`
- **THEN** no output SHALL be produced
- **AND** the method SHALL return `false`

### Requirement: Schema-per-command with display annotations

Each command that supports `--json` SHALL declare a single Effect `Schema` for its output shape. The schema SHALL carry display metadata via symbol-keyed annotations: `ColumnHeader`, `ColumnPriority`, `ColumnAlign`, `ColumnWidth`, `DisplayFormat`, and `Hidden`.

#### Scenario: Schema annotated with column metadata

- **WHEN** a field is annotated with `column({ header: "Name", width: "fill" })`
- **THEN** the annotation SHALL carry `ColumnHeader: "Name"` and `ColumnWidth: "fill"`
- **AND** JSON serialization SHALL ignore the display annotations

#### Scenario: Hidden annotation excludes field from display

- **WHEN** a field is annotated with `hidden()`
- **THEN** the field SHALL appear in JSON output
- **AND** the field SHALL NOT appear in table or detail views

#### Scenario: Priority annotation controls verbose visibility

- **WHEN** a field is annotated with `column({ header: "Source", priority: 1 })`
- **THEN** the field SHALL only appear in table/detail views when verbosity is `verbose` or higher
- **AND** the field SHALL always appear in JSON output regardless of verbosity

### Requirement: columnsFrom derives ColumnDef from annotated schema

A `columnsFrom(schema)` utility SHALL read annotations from the schema's AST and produce a `ReadonlyArray<ColumnDef<T>>`. It SHALL handle intermediate AST wrappers (transformations, optionals, refinements) via Effect v4's `SchemaAST.resolve()`.

#### Scenario: Struct schema produces ColumnDef array

- **WHEN** `columnsFrom(SkillListItem)` is called on a struct schema with annotated fields
- **THEN** a `ColumnDef` array SHALL be returned with one entry per non-hidden annotated field
- **AND** each entry SHALL include `key`, `header`, `value` accessor, `priority`, `align`, and `width`

#### Scenario: Hidden fields are excluded from ColumnDef

- **WHEN** a field has the `Hidden` annotation
- **THEN** `columnsFrom` SHALL NOT include it in the returned array

### Requirement: emitMany helper for list commands

The `emitMany(items, opts)` helper SHALL call `renderer.result(items, Schema.Array(opts.schema))` for machine output, and if that returns `false`, call `renderer.table(items, columnsFrom(opts.schema), opts.title)` for interactive display.

#### Scenario: emitMany in machine mode emits JSON array

- **WHEN** the `MachineRenderer` is active
- **AND** a handler calls `emitMany(skills, { schema: SkillListItem })`
- **THEN** the skills array SHALL be emitted as JSON on stdout
- **AND** `table()` SHALL NOT be called

#### Scenario: emitMany in interactive mode renders table

- **WHEN** the `InteractiveRenderer` is active
- **AND** a handler calls `emitMany(skills, { schema: SkillListItem, title: "Skills" })`
- **THEN** a formatted table SHALL be rendered on stdout with columns derived from the schema

### Requirement: emitOne helper for detail commands

The `emitOne(data, opts)` helper SHALL call `renderer.result(data, opts.schema)` for machine output, and if that returns `false`, call `renderer.detail(data, columnsFrom(opts.schema), opts.title)` for interactive display.

#### Scenario: emitOne in machine mode emits JSON object

- **WHEN** the `MachineRenderer` is active
- **AND** a handler calls `emitOne(skill, { schema: SkillInfo, title: skill.name })`
- **THEN** the skill object SHALL be emitted as JSON on stdout

#### Scenario: emitOne in interactive mode renders detail view

- **WHEN** the `InteractiveRenderer` is active
- **AND** a handler calls `emitOne(skill, { schema: SkillInfo, title: skill.name })`
- **THEN** a vertical key-value detail view SHALL be rendered on stdout

### Requirement: json() and raw() write unconditionally to stdout

The `json(data)` method SHALL write formatted JSON to stdout in both modes. The `raw(content)` method SHALL write an unformatted string to stdout in both modes. Neither method validates against a schema.

#### Scenario: json() writes formatted JSON

- **WHEN** a handler calls `renderer.json(data)`
- **THEN** `JSON.stringify(data, null, 2)` SHALL be written to stdout
- **AND** this SHALL work in both interactive and machine modes

#### Scenario: raw() writes unformatted string

- **WHEN** a handler calls `renderer.raw(yamlContent)`
- **THEN** the raw string SHALL be written to stdout without formatting
