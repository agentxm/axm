---
status: active
last-reviewed: 2026-05-08
version: 0.2.0
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
- Breaking JSON changes require an OpenSpec change and contract tests

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

The schema is the contract. It should define:

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

- `result` and `resultStream` emit command data to stdout
- `list(entity, ...)`, `detail(entity, ...)`, and `tree(entity, ...)` render
  entity-shaped data through the registry while preserving the same JSON payload
- `breadcrumbs` emits advisory follow-up tasks; machine mode also emits
  `breadcrumb` events on stderr
- `json` and `raw` are escape hatches; use them sparingly
- `info`, `message`, `success`, `warn`, `error`, spinners, and progress are
  diagnostics
- In machine mode, diagnostics are NDJSON on stderr; they are not part of the
  command result

Handlers should compute structured data first, then render once. Avoid
interleaving business logic with ad hoc log formatting.

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

### Raw Scalar Commands

Some commands are intentionally pipe-friendly in text mode, like `auth token`.

- text mode may emit a raw scalar when that is the primary UX
- `--json` must still return a typed result

---

## JSON Shape

Use a top-level object for every command result.

Machine mode wraps every successful payload in a flat success envelope:

```json
{
  "ok": true,
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
```

Why an object, even for lists:

- metadata can be added without replacing the top-level type
- consumers do not need out-of-band knowledge to interpret the payload

Recommended top-level fields:

- exactly one primary payload key:
  - `data` for single resources
  - `items` for collections
  - `result` for operation summaries
- optional metadata:
  - `count`
  - `warnings`
  - `nextCursor`
  - `generatedAt`

Reserved top-level fields:

- `ok`
- `summary`
- `breadcrumbs`

Payload schemas must not define reserved fields. Avoid top-level `type` for
successful command results unless it adds real domain meaning.

Advisory follow-up tasks use breadcrumbs. When a result needs breadcrumbs, add
them to the same flat envelope:

```json
{
  "ok": true,
  "result": {},
  "summary": "Created command @acme/commands/review",
  "breadcrumbs": [
    { "task": "edit", "description": "Edit `.axm/extensions/.../review.md`" },
    { "task": "sync", "description": "Apply changes", "command": ["axm", "sync"] }
  ]
}
```

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
  "message": "No authentication token is available",
  "breadcrumbs": [
    { "task": "login", "description": "Authenticate", "command": ["axm", "auth", "login"] }
  ]
}
```

Rules:

- use `ok: false` for error routing
- include `code`; this is the stable agent-facing discriminator
- include `message`; it is user-facing prose
- include `breadcrumbs` for structured follow-up tasks when useful
- emit a matching stderr `error` event in machine mode

The shell already conveys the process exit status, so the envelope does not
restate it.

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

- stdout: final JSON result object
- stderr: NDJSON diagnostics for logs and progress

Keep that split. Do not overload `--json` to mean "mixed result and progress
stream".

If we need consumable streaming results later, add an explicit mode with its
own contract and version.

Recommended stderr event shape:

```json
{"type":"progress","phase":"download","percent":25,"message":"Downloading"}
{"type":"log","level":"info","message":"Resolved 3 skills"}
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

---

## Adoption Plan

1. Treat this guide as the source of truth for machine output
2. Decide JSON support based on external integration needs
3. Convert read-only commands first: list, info, and whoami-style queries
4. Convert mutating commands next with operation summary schemas
5. Keep `--json` off commands until their contract passes the shipping gate
6. Keep JSON error payloads aligned with `ok`, `code`, `message`, and
   `breadcrumbs`
7. Add help-level field documentation and machine-mode tests per command

---

## See Also

- [CLI Design Guide](./cli-design.md) - command structure and handler patterns
- [Command Line Interface Guidelines](https://clig.dev/) - broader CLI design
  principles
