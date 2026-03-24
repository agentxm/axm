## ADDED Requirements

### Requirement: Output service provides semantic message output

The `Output` service SHALL be defined at `src/output/output.ts` as an Effect service. It SHALL provide methods `message`, `info`, `success`, `step`, `warn`, `error`, `intro`, `outro`, `cancel`, `note`, and `box`, each returning `Effect<void>`. These methods SHALL have 1:1 behavioral parity with the former `ClackLog` methods they replace.

#### Scenario: Info message

- **WHEN** a handler calls `output.info("Processing 3 skills")`
- **THEN** that message SHALL be written with info-level formatting

#### Scenario: Success message

- **WHEN** a handler calls `output.success("Installation complete")`
- **THEN** that message SHALL be written with success-level formatting

#### Scenario: Warning message

- **WHEN** a handler calls `output.warn("Skill already installed")`
- **THEN** that message SHALL be written with warning-level formatting

#### Scenario: Error message

- **WHEN** a handler calls `output.error("Failed to resolve source")`
- **THEN** that message SHALL be written with error-level formatting

#### Scenario: Plain message

- **WHEN** a handler calls `output.message("See docs for details")`
- **THEN** that message SHALL be written without semantic icon or prefix

#### Scenario: Step message

- **WHEN** a handler calls `output.step("Open this URL in your browser")`
- **THEN** that message SHALL be written with step-level formatting

#### Scenario: Intro

- **WHEN** a handler calls `output.intro("axm skills install")`
- **THEN** a session-opening frame SHALL render with that title

#### Scenario: Outro

- **WHEN** a handler calls `output.outro("Done")`
- **THEN** a session-closing frame SHALL render with that message

#### Scenario: Cancel message

- **WHEN** a handler calls `output.cancel("Operation cancelled")`
- **THEN** a cancellation notice SHALL render with that message

#### Scenario: Note with title

- **WHEN** a handler calls `output.note("Run axm skills install", "Next steps")`
- **THEN** a boxed callout SHALL render with `Next steps` as title and the message as body

#### Scenario: Note without title

- **WHEN** a handler calls `output.note("Operation complete")`
- **THEN** a boxed callout SHALL render with the message body and no title

#### Scenario: Box with options

- **WHEN** a handler calls `output.box("content", "title", { rounded: true, width: 60 })`
- **THEN** a configurable box SHALL render respecting the provided `BoxOptions`

### Requirement: Output service provides streaming text output

The `Output` service SHALL provide a `stream` method accepting a `StreamLevel` and a `Stream<string, E, R>`, returning `Effect<void, AppError | E, R>`. `StreamLevel` SHALL be a union of `"message" | "info" | "success" | "step" | "warn" | "error"`. The text-mode layer SHALL render the collected stream content with the visual formatting corresponding to the specified level.

#### Scenario: Stream info-level text

- **WHEN** a handler calls `output.stream("info", textStream)`
- **THEN** the stream SHALL be consumed and rendered with info-level formatting

#### Scenario: Stream warn-level text

- **WHEN** a handler calls `output.stream("warn", textStream)`
- **THEN** the stream SHALL be consumed and rendered with warn-level formatting

#### Scenario: Stream error-level text

- **WHEN** a handler calls `output.stream("error", textStream)`
- **THEN** the stream SHALL be consumed and rendered with error-level formatting

### Requirement: Output service provides typed result emission

The `Output` service SHALL provide a `result` method accepting a Schema encoder, typed data, and a text renderer function. The layer SHALL resolve the output format internally — handlers SHALL NOT pass or resolve the output format.

#### Scenario: Result in text mode

- **WHEN** a handler calls `output.result(schema, data, textRenderer)` in text mode
- **THEN** `textRenderer(data)` SHALL be called and the result written to stdout

#### Scenario: Result in json mode

- **WHEN** a handler calls `output.result(schema, data, textRenderer)` in json mode
- **THEN** the data SHALL be encoded via the schema and written to stdout as a single JSON object

#### Scenario: Result in stream-json mode

- **WHEN** a handler calls `output.result(schema, data, textRenderer)` in stream-json mode
- **THEN** the data SHALL be encoded via the schema and written to stdout as `{ "type": "result", "data": <encoded> }`

### Requirement: Output service has structured output layers

The `Output` service SHALL have a structured layer factory `OutputStructured(mode)` where mode is `"json" | "stream-json"`. In json mode, messages SHALL route to stderr. In stream-json mode, messages SHALL emit NDJSON log events on stdout. The NDJSON event schemas SHALL be unchanged from the current `output.ts` definitions.

#### Scenario: Structured info in stream-json mode

- **WHEN** a handler calls `output.info("Processing")` in stream-json mode
- **THEN** stdout SHALL receive `{"type":"log","level":"info","message":"Processing"}`

#### Scenario: Structured warn in json mode

- **WHEN** a handler calls `output.warn("Conflict")` in json mode
- **THEN** the message SHALL be written to stderr (not stdout)

#### Scenario: Structured stream in stream-json mode

- **WHEN** a handler calls `output.stream("info", textStream)` in stream-json mode
- **THEN** the collected stream content SHALL be emitted as a NDJSON log event

### Requirement: Output service is injectable and testable

The `Output` service SHALL expose a test layer factory `makeOutputTestLayer()` returning `[Layer, MockOutputService]`. The mock SHALL record all method calls with method names and arguments for assertion.

#### Scenario: Mock records output calls

- **WHEN** code calls `output.info("a")` then `output.warn("b")` with the test layer
- **THEN** the mock SHALL record both calls with method names and messages

#### Scenario: Handler depends only on Output

- **WHEN** a handler uses only output behavior (messages, result, stream)
- **THEN** its Effect type signature SHALL require only `Output`

### Requirement: Output live layer imports @clack/prompts directly

The `OutputLive` layer at `src/output/output-live.ts` SHALL import `@clack/prompts` directly. No intermediate `clack-effect/` module SHALL exist between the Output service and Clack.

#### Scenario: No clack-effect dependency

- **WHEN** the `src/output/` module is inspected
- **THEN** it SHALL NOT import from `clack-effect/`
- **AND** it SHALL import `@clack/prompts` in `output-live.ts` only
