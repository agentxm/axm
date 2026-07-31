---
status: active
last-reviewed: 2026-07-31
version: 0.5.0
description: CLI renderer design for human output, machine JSON contracts, and stderr diagnostics
depends-on:
  - ../../AGENTS.md
  - ./cli-design.md
---

# CLI Renderer Guide

How `axm` should structure CLI output across `InteractiveRenderer` and
`MachineRenderer`. This guide defines the public machine-readable contract for
stdout JSON and stderr diagnostics. JSON output is a product API, not a
serialization of terminal text.

> [CLI Conventions](../../AGENTS.md#cli-conventions) - flags and command behavior
>
> [CLI Design Guide](./cli-design.md) - command structure and handler conventions

This guide owns the output contract. Command naming, flags, prompts, and
handler authoring live in [CLI Design Guide](./cli-design.md).

## Key Resources

- [GitHub CLI formatting](https://cli.github.com/manual/gh_help_formatting) -
  per-command JSON fields and formatting ergonomics
- [GitHub CLI repo view](https://cli.github.com/manual/gh_repo_view) -
  discoverable JSON fields on a detail command
- [GitHub CLI pr checks](https://cli.github.com/manual/gh_pr_checks) -
  derived machine-oriented fields
- [cargo metadata](https://doc.rust-lang.org/nightly/cargo/commands/cargo-metadata.html) -
  explicit format versioning and additive evolution
- [terraform output](https://developer.hashicorp.com/terraform/cli/commands/output) -
  raw scalar versus JSON output
- [terraform JSON format](https://developer.hashicorp.com/terraform/internals/json-format) -
  schema design
- [Effect Schema Classes](https://effect.website/docs/schema/classes/) -
  class-based schemas and modeling tradeoffs
- [Effect Schema Documentation](https://effect.website/docs/schema/) -
  schema construction, encoding, and decoding

---

## Core Philosophy

- JSON is a stable interface for scripts, editors, and future apps
- Human text and machine data are different products; do not derive one from
  the other
- whether a command should support JSON is driven by external integration value,
  not by its current implementation shape
- Effect Schema v4 is the source of truth for published JSON output contracts
- `--json` should ship only once the output schema is published and tested
- stdout is reserved for final data; diagnostics belong on stderr
- a successful non-streaming `--json` invocation emits at most one complete
  JSON document on stdout
- Breaking JSON changes require explicit issue/design rationale and contract tests

---

## When Commands Should Support JSON

A command should support JSON when its result is functionally useful to
external consumers, whether through shell scripts, editors, desktop apps, or
other clients.

Good fits:

- query commands that return current state or identity
- list commands used for inspection or selection
- detail commands used to fetch one resource
- mutating commands whose outcome matters to a caller after execution
- raw-scalar commands where machine consumers still benefit from typed output

Poor fits:

- purely conversational or menu-like commands with no durable result
- prompt-only flows whose primary behavior is collecting input
- commands whose only output is transient progress narration

This is a product decision, not an implementation shortcut. A command may
clearly deserve JSON before its output schema has been designed.

### Shipping Gate

`--json` is a global CLI mode and should parse on every command. The shipping
gate applies to whether a command publishes a structured stdout result. A
command should emit a schema-backed stdout result only when all of the following
are true:

- the result shape is defined with a published Effect Schema v4 schema
- help can describe the payload keys and major fields
- the handler builds structured data first and renders once
- machine output is encoded from the schema-backed result shape
- machine-output tests cover the contract

These are release gates for publishing a structured stdout contract, not for
parsing `--json` itself. Commands that do not yet publish a result may still run
in machine mode and emit diagnostics on stderr only.

---

## Schema Source Of Truth

Use Effect Schema v4 for all published machine-readable output:

- command results on stdout
- structured error payloads
- machine stderr event contracts

The schema is the contract. Each shipped command path is also classified in
`packages/cli/src/machine-output-contracts.ts`; its exact comparison with the
real Effect command tree makes unclassified additions, aliases, and removals
fail tests. The schema should define:

- the wire shape
- the derived TypeScript type
- the stable field names and field types

Export schema and type together:

```typescript
export const SkillsListOutputSchema = Schema.Struct({
  items: Schema.Array(SkillListItemSchema),
  count: Schema.Number,
});
export type SkillsListOutput = typeof SkillsListOutputSchema.Type;
```

Do not add a top-level `command` discriminator to successful JSON payloads. The
invoked CLI command is already known out of band, and entity-driven renderers
carry human rendering metadata without changing the wire payload.

If a nested resource payload has its own version field, keep that nested version
local to the resource schema.

### Preferred Schema Forms

For CLI wire contracts, prefer simple data schemas:

- `Schema.Struct`
- `Schema.Array`
- `Schema.Union`
- `Schema.Literal`
- schema-level transforms when the wire type and in-memory type differ

Do not default to `Schema.Class` for CLI output.

Use `Schema.Class` only when the output type is also a meaningful shared domain
model with invariants or behavior. Most CLI result payloads are better modeled
as plain wire schemas.

### Encoding Rule

Machine output should be encoded through the schema, not treated as arbitrary
objects passed directly to `JSON.stringify`.

That means:

- handlers build typed result values
- renderers encode those values from the schema-backed contract
- tests assert the encoded wire shape

This keeps the published contract and the emitted bytes aligned.

---

## Renderer Boundaries

`CliRenderer` owns channel discipline:

- `result` emits one schema-encoded command document to stdout
- `list(entity, ...)`, `detail(entity, ...)`, and `tree(entity, ...)` render
  entity-shaped data through the registry while preserving the same JSON payload
- `suggestions` emits advisory follow-up tasks; machine mode also emits
  `suggestion` events on stderr
- `json` and `raw` are text-mode escape hatches; guard them behind a
  schema-backed `result` call when the command supports machine output
- `info`, `message`, and `success` are human narration; machine mode silences
  those messages
- `warn`, `error`, spinners, progress, task logs, and suggestions are signal
  diagnostics; machine mode emits them as NDJSON on stderr

Handlers should compute structured data first, then render once. Avoid
interleaving business logic with ad hoc log formatting. Render-once applies to
the **result** channel; long-running phases still emit live progress through
the renderer's progress APIs — see
[Progress And Liveness](#progress-and-liveness).

---

## Progress And Liveness

A command is never silent while working. Perceived responsiveness matters more
than raw speed: a CLI that prints nothing during a network fetch reads as hung,
and users and agents interrupt healthy runs.

Normative rules:

- **First feedback within ~100 ms.** Every command produces visible
  acknowledgment near-instantly — either its result (fast commands) or a
  progress line naming the current phase.
- **Slow phases run under a progress API.** Any phase that can plausibly exceed
  ~1 second — registry resolution, network fetch, subprocess execution, bulk
  file I/O — runs under `withSpinner`, `withProgress`, or `runTasks`, with a
  message naming the phase and subject (`Resolving @acme/skills/foo…`). Do not
  hand-roll progress with `info` lines or `console.log`.
- **Progress is transient scaffolding, not a transcript.** A spinner settles
  into the final outcome line. Interrupted or failed phases settle the line
  (via the renderer) rather than leaving a dangling animation frame. Progress
  narration never substitutes for the outcome-first result.
- **Progress is exempt from render-once.** The render-once rule governs the
  result channel (stdout, one render at the end). Progress emitted through the
  renderer's progress APIs is a stderr diagnostic and runs mid-flight by
  design.
- **Quiet-by-default is not silent-while-working.** Omitting transport plumbing
  from default output governs _what detail_ appears, not _whether_ liveness
  appears. A spinner naming the current phase is not plumbing; the registry
  URLs and probe details behind it belong in `--verbose`.

Per-mode behavior is owned by the renderer implementations — handlers call the
progress APIs and the renderer adapts:

| Mode                      | Behavior                                                       |
| ------------------------- | -------------------------------------------------------------- |
| Interactive TTY           | Animated spinner / progress bar; settles into the outcome line |
| Non-TTY / CI / `NO_COLOR` | Static phase line per update; no animation, no ANSI            |
| `--json`                  | NDJSON `progress` events on stderr; stdout result untouched    |
| `--quiet`                 | Progress suppressed; errors still surface                      |
| `--verbose`               | Progress retained, plus the plumbing detail behind each phase  |

---

## Supported Output Classes

### Query Commands

Return current state or identity.

- Detail command -> one entity object
- List command -> `items` array plus summary metadata when useful
- Empty lists still return a valid result, not an info log

Register shared entity renderers with the TypeScript-only entity registry. The
registry owns human columns/detail/tree rendering; it does not add fields to
machine JSON.

### Mutating Commands

Return an operation summary, not a transcript.

Include:

- what changed
- what was skipped
- warnings that affect automation
- identifiers needed for follow-up commands

Publish and extension-mutation commands that receive `links.html` from the
registry must surface it twice: include the URL in the human success message,
and add a suggestion with `{ "description": "View in browser", "url": "..." }`.
For plan-based commands, keep `links` on the successful step result so `--json`
emits `result.steps[].links.html` instead of inventing a top-level primary URL.

### Raw Scalar Commands

Some commands are intentionally pipe-friendly in text mode, like `auth token`.

- text mode may emit a raw scalar when that is the primary UX
- `--json` must still return a typed result

---

## JSON Shape

Use a top-level object for every command result.

Since CLI 0.25.0, machine mode wraps every ordinary payload under the single
top-level `result` key. Built-in `--help --json` and `--version --json` are the
deliberate formatter-owned exceptions and use their `type: "help"` /
`type: "version"` schemas:

```json
{
  "ok": true,
  "result": {
    "items": [
      {
        "name": "@acme/skills/code-review",
        "source": "registry",
        "scope": "project",
        "enabled": true
      }
    ],
    "count": 1
  }
}
```

This is a versioned breaking change from 0.24.x, which flattened payload-schema
keys into the envelope and therefore exposed command-specific top-level keys.

Why one payload key:

- consumers always read `.result`
- command payload schemas can evolve without competing for envelope keys
- objects, collections, and scalars share one routing contract

Reserved top-level fields:

- `ok`
- `result`
- `summary`
- `suggestions`

The renderer unwraps a payload schema whose only field is `result` for
compatibility with operation-document schemas; all other schema-encoded values
become the value of the envelope's `result`. Avoid a payload-level `type`
unless it adds real domain meaning.

Advisory follow-up tasks use suggestions. When a result needs suggestions, add
them to the same flat envelope:

```json
{
  "ok": true,
  "result": {},
  "summary": "Created command @acme/commands/review",
  "suggestions": [
    { "description": "Edit `.axm/extensions/.../review.md`" },
    { "description": "Apply changes", "cmd": "axm sync" }
  ]
}
```

Suggestions use `{ description, cmd?, url? }`. Use imperative voice, no trailing
period, backtick literal commands and paths, and one task per suggestion. Set
`cmd` whenever `description` suggests a runnable `axm` command. Set `url` for a
browser destination; do not encode URLs as shell commands. `cmd` replaces the
older `command: string[]` form; do not emit both.

---

## Field Rules

- Use `camelCase`
- Prefer stable, semantic names over UI labels
- Keep ids opaque strings
- Use numbers for counts and durations, never numeric strings
- Use ISO 8601 UTC timestamps
- Use `null` for absent singular values
- Use `[]` or `{}` for empty collections and maps
- Do not change a field's type across commands or schema versions
- Do not serialize display formatting into data fields

If a value is derived for machine consumers, expose it explicitly. `gh pr
checks` adding `bucket` on top of raw `state` is the right pattern.

---

## Errors

JSON errors use a fixed envelope:

```json
{
  "ok": false,
  "code": "auth",
  "title": "Unauthorized",
  "detail": "No authentication token is available",
  "suggestions": [{ "description": "Authenticate", "cmd": "axm auth login" }]
}
```

Rules:

- for every ordinary result, `ok` is `true` exactly when the process exits 0
  and `false` when it exits nonzero
- use `ok: false` for error routing and nonzero operation results
- include `code`; this is the stable agent-facing discriminator
- include `title` and `detail`; `detail` is user-facing prose
- include `suggestions` for structured follow-up tasks when useful
- emit a matching stderr `error` event in machine mode

The shell already conveys the process exit status, so the envelope does not
restate it. Exit codes are derived 1:1 from `code`; see the `ExitCode` enum
in `packages/core/src/unstable/app-error/app-error.ts` for the mapping and
the reserved ranges (1–12 in use, 13–127 reserved, 128+ for POSIX signals).

### Secret Safety

Error and diagnostic surfaces redact credential-shaped text and exact secret
values found under sensitive metadata keys. This applies to normal, verbose,
and debug output, including response bodies, cause chains, stacks, URLs,
suggestions, machine stderr events, and telemetry. Command result payloads are
not generically redacted because `axm token --json` and `axm token create
--json` intentionally return a requested token; those token result fields are
the only secret-bearing output exception.

---

## Help And Discoverability

Follow `gh` here:

- a command should advertise `--json` only after it passes the shipping gate
- help should describe the top-level payload keys and important nested fields
- every JSON-capable command should have a machine-output test
- publish the output type and schema from one place

Future-friendly extension:

- add field catalogs per command first
- add field projection later if needed
- do not add `--json <fields>` until the base schemas are stable

---

## Streaming And Diagnostics

Current contract:

- stdout: zero or one complete final JSON document
- stderr: signal-only NDJSON diagnostics for warnings, errors, suggestions,
  progress, and task logs

Keep that split. Do not overload `--json` to mean "mixed result and progress
stream". The runtime buffers stdout and validates the complete channel before
releasing it; concatenated documents or stray text become an internal contract
error instead of leaking malformed output.

If we need consumable streaming results later, add an explicit mode with its
own contract and version.

Recommended stderr event shape:

```json
{"type":"progress","phase":"download","percent":25,"message":"Downloading"}
{"type":"log","level":"warn","message":"Skipped disabled skill foo"}
{"type":"error","code":"auth","message":"No authentication token is available"}
```

---

## Handler Pattern

For commands that support machine output:

1. Build a result object in domain terms
2. Validate or encode it with an Effect Schema
3. Render once through `CliRenderer.result`, `list`, `detail`, or `tree`

Do not emit human `info` lines as the primary data path for JSON-capable
commands.

`renderer.result` (and the entity helpers) return a `boolean`. They emit only
in machine mode; in text mode they return `false` so the handler can render a
human view. The pattern is:

```typescript
const emitted = yield * renderer.result(payload, ResultSchema);
if (emitted) return;
yield * renderer.raw(humanText); // or renderer.message / renderer.table
```

Never call `process.stdout.write` directly from a handler — JSON mode would
leak unstructured bytes onto the result channel and break the contract.

## Defects And Unhandled Panics

`writeDefect(cause, format)` in `runtime-envelope.ts` is the single channel for
unexpected errors:

- text mode: human message on stderr
- json mode: NDJSON `error` event on stderr **plus** `{ ok: false, code:
"internal", message }` envelope on stdout

Production callers reach this through `withCliErrorHandling`; do not bypass it.
The same redaction boundary applies before defects reach stderr, stdout, or
telemetry.

---

## Adoption Plan

1. Treat this guide as the source of truth for machine output
2. Decide JSON support based on external integration needs
3. Convert read-only commands first: list, info, and whoami-style queries
4. Convert mutating commands next with operation summary schemas
5. Keep `--json` off commands until their contract passes the shipping gate
6. Keep JSON error payloads aligned with `ok`, `code`, `message`, and
   `suggestions`
7. Add help-level field documentation and machine-mode tests per command

---

## See Also

- [CLI Design Guide](./cli-design.md) - command structure and handler patterns
- [Command Line Interface Guidelines](https://clig.dev/) - broader CLI design
  principles
