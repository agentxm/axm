# Machine output

Pass `--json` to receive one complete machine-readable document on stdout.
Warnings, errors, suggestions, progress, and task logs use one JSON object per
line (NDJSON) on stderr. Human text never shares the machine stdout channel.

## Success documents

Ordinary command results use a flat success envelope:

```json
{
  "ok": true,
  "result": {}
}
```

The payload schema supplies the top-level keys after `ok`:

| Command class | Primary keys and nesting                                      |
| ------------- | ------------------------------------------------------------- |
| Mutation plan | `result.outcome`, plan counts, and `result.steps[]`           |
| Single query  | Usually `data` or a purpose-built named resource key          |
| Collection    | `items[]`, `count`, and command-specific counts or cursors    |
| Publish       | `mode`, optional `selection`, and `results[]`                 |
| Suggestions   | Optional top-level `suggestions[]` beside the primary payload |

`axm view <ref> <field> --json` deliberately uses `value` for a selected scalar
or array. `axm token --json` and `axm token create --json` deliberately return
the requested token under `data`; do not log or forward that document.

Built-in formatter documents are the two success-envelope exceptions:

```json
{ "type": "help", "name": "axm", "usage": "axm <subcommand> [flags]" }
```

```json
{ "type": "version", "name": "axm", "version": "0.23.0" }
```

## Errors

Expected errors and defects return the fixed stdout envelope:

```json
{
  "ok": false,
  "code": "auth",
  "title": "Unauthorized",
  "detail": "Credentials are missing, expired, or invalid."
}
```

The matching stderr stream ends with an event such as:

```json
{ "type": "error", "code": "auth", "message": "Credentials are missing, expired, or invalid." }
```

Normal, verbose, and debug error surfaces redact credentials from metadata,
response bodies, causes, stacks, URLs, suggestions, and telemetry.

## Consumption

- Parse the entire stdout buffer once; ordinary `--json` is not a result stream.
- Parse each non-empty stderr line independently as JSON.
- Branch on `ok` for ordinary results and errors, or `type` for built-in help
  and version documents.
- Branch on the process exit code as documented by `axm help exit-codes`.

Future streaming results require a separate explicit mode and contract.
