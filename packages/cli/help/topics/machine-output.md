# Machine output

Pass `--json` to receive one complete machine-readable document on stdout.
Warnings, errors, suggestions, progress, and task logs use one JSON object per
line (NDJSON) on stderr. Human text never shares the machine stdout channel.

## Success documents

The `axm.machine-output/result-envelope-v1` contract gives every ordinary
command result the same envelope:

```json
{
  "ok": true,
  "result": {}
}
```

The command-specific payload always lives under `result`. Collections put
`items[]`, counts, and cursors inside `result`; queries put their resource
fields inside `result`; mutations put their outcome and steps inside `result`.
Only optional `summary` and `suggestions[]` may sit beside it.

Mutation-plan outcomes are `no-op`, `applied`, `partial`, `failed`,
`cancelled`, or `previewed`. For every ordinary result, `ok` is `true` exactly
when the process exits 0 and `false` when it exits nonzero. Inspect step counts
and committed artifacts when recovering a partial result.

`axm view <ref> <field> --json` places the selected scalar or array directly
under `result`. Token commands also place their command payload under `result`;
do not log or forward token result documents.

Publish results are discriminated by `result.contract: "publish-result-v2"`.
They separate `selection.decisions`, the authoritative `publicationSet`, and
`execution.outcomes`. A failed item identifies an operation that actually
failed and carries a typed `cause`; a blocked item was not attempted and names
its causal item or finding through `blockedBy`. Counts are derived from those
outcomes, so blocked items never increment `failed`.

After a post-preflight partial publication, `result.recovery.cmd` is a
credential-free generic `axm publish` command over the exact admitted
identities. It verifies byte-identical versions created by the earlier attempt
and retries versions that remain absent. A rejected preflight has findings and
corrective suggestions instead of a partial-publication recovery command.

Built-in formatter documents are the two success-envelope exceptions:

```json
{ "type": "help", "name": "axm", "usage": "axm <subcommand> [flags]" }
```

```json
{ "type": "version", "name": "axm", "version": "1.2.3" }
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
- Structurally validate stdout: formatter documents have `type: "help"` or
  `type: "version"`; ordinary result documents own `result`; expected errors
  own `ok: false`, `code`, `title`, and `detail` without `result`.
- In JavaScript and TypeScript clients, decode with
  `MachineOutputDocumentSchema` and branch with
  `detectMachineOutputDocumentKind` from
  `@agentxm/client-core/unstable/cli-runtime`.
- Branch on `ok` or the process exit code for ordinary results and errors; they
  agree.
- Read every ordinary command payload from `result`.

Future streaming results require a separate explicit mode and contract.
