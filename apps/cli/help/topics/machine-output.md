# Machine output

Failure documents carry the optional `diagnosticId` when available. The ID identifies the same local record as human output and any
consent-controlled remote report. See `axm help diagnostics` to review or export
the local evidence.

Pass `--json` to receive one complete machine-readable document on stdout.
Warnings, errors, suggestions, and lifecycle progress use one JSON object per
line (NDJSON) on stderr. Human text never shares the machine stdout channel.

## Stability

At public launch, stdout shapes, documented payload enums, stderr event types
and payloads, error codes, and exit-code mappings freeze. A breaking change
requires a new affected contract-family version; consumers do not infer the
contract from the CLI release number. `result-envelope-v1` is detected by shape
and adds no top-level contract key. Result payloads declare their family under
`result.contract`, including `plan-result-v4`, `publish-result-v3`,
`registry-transition-v1`, and `upgrade-assessment-v1`. Knowledge queries use
`query.contract: "knowledge-query-v1"`; capabilities use
`capabilities.contract: "knowledge-discovery-capabilities-v1"` and
`queryContract` to refer to the query contract.

Diagnostic-record contents remain unfrozen support artifacts, including
`result.record` and exported files. They carry no `diagnostic-record-v1`
discriminator. Automation relies on the failure envelope's error code, recovery
suggestions, and optional `diagnosticId`.

## Success documents

The `result-envelope-v1` contract gives every ordinary
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

`axm help machine-output-schema` publishes the generated JSON Schema for these
payloads. `x-axm-routes` maps each structured-result command path (for example,
`axm skills list`) to a family `$ref` in the document's `$defs`. Validate
`result` against that reference. The root schema accepts the union of result
families; the envelope's generic `result` field is unchanged. The document also
references the error envelope and formatter help/version schemas separately.
With `--json`, schema help returns a parsed object under `result.schema`;
without it, stdout is the raw JSON Schema. Diagnostic-record contents remain
outside the frozen contract even when a generated schema describes them.

Workspace mutation results are discriminated by
`result.contract: "plan-result-v4"`. Outcomes are `previewed`, `applied`,
`no-op`, `partial`, `failed`, `blocked`, `cancelled`, or `interrupted`. For
every ordinary result, `ok` is `true` exactly when the process exits 0 and
`false` when it exits nonzero.

Each unit of work is one semantic closure that settles independently:
committed closures stand even when a later closure fails, a failed closure
rolls back only itself, and mixed commits and failures report `partial` at
exit 1. `result.atomicity` names the `declared` and `applied` class —
`closure-atomic` or `non-rollbackable`. Unit states are `planned`, `ready`,
`committed`, `unchanged`, `failed`, `rolled-back`, `blocked`, `skipped`,
`cancelled`, or `interrupted`; a unit of a failed or interrupted closure also
carries a `disposition` of `restored`, `retained`, `untouched`, or `unknown`.
`result.interruption.disposition` uses the same vocabulary; `untouched`
means that no work was attempted before termination.
An `interrupted` unit was started but its settlement was not observed —
started work is never reported as not attempted. Inspect `result.counts`,
unit dispositions, and `result.recovery.retained` when recovering a partial
or interrupted result. `result.recovery.entries[]` relates each preserved
`recoveryPath` to its `originalPath` and identifies a `retired-entry` or
`snapshot`. A foreign edit can prevent restoration; preserved recovery data
does not mean that AXM overwrote that edit.

`result.nativeLocations[]` describes each physical ownership unit, with a
structured `address` for an entry, whole file, key path, or managed region.
It separates path aliases, configured consumers, potential readers, policy
reasons, ownership evidence, change state, and availability evidence.
`result.nativeLocationCounts` counts units, physical files or directories,
and distinct configured consumers separately. Two agents sharing one file do
not mean two physical writes. `changed`, `retained`, `blocked`, and
`unverified` count unit states. Rolled-back or unsettled units do not retain
planned claims of committed native changes. Native MCP and Hook units use
`ownership: "declared"` and `proof: "effective-native-declaration"`; that is current
authorization, not historical ownership. Hook addresses identify the settings key
and selected canonical script roots. `retained` does not mean execution stopped.

Every root and typed extension list uses the same inventory envelope:
`filter`, `items[]`, `count`, `totalCount`, and `managementCounts`.
`nativeLocationCounts` is present when native locations were observed; root
lifecycle filters also include assessment `coverage`. Counts describe the
selected items; `totalCount` precedes the lifecycle filter.

Each item carries `type`, `name`, `scope`, `management`, `installed`, `enabled`,
`source`, and `agentOutcomes`, with optional `fqn`, `version`, and
`nativeLocations`. `management` is `configured`, `implicit`, `leftover`,
`undeclared`, or `unmanaged`; `managementCounts` uses these same keys. Source
objects discriminate acquisition authority with `kind`: `registry`, `git`,
`http`, `path`, `workspace`, `bundled`, `inline`, or `unmanaged`. When source
facts are unavailable, `unknown` makes that absence explicit. Source locators
and accepted identity stay distinct from the local name and management state.
MCP items retain local connection and resolution facts; Knowledge items retain
bundle contents and instruction-entry details. Sourced Rule and hook extension
items retain `locked`; Pack items retain `owner`. Internal origin tags and the
superseded `classification`, `sourceType`, and `ref` keys are absent.

Lists, typed show results, and mutation plans use `agentOutcomes[]` for
per-agent lifecycle outcomes. Each row carries `extensionType`, `name`,
`agentId`, `outcome`, `reasonCode`, and `reason`. The outcome is one of
`projected`, `current`, `not-applicable`, `unsupported`, `blocked`, or `failed`.
`reasonCode` uses the published `ConfiguredAgentReasonCodeSchema` enum;
`axm.sh/runtime` exports it with `ConfiguredAgentOutcomeSchema`. Show results
retain the core outcome and may add inspection fields, warnings, configuration,
projection, readiness, runtime, and manual actions. They do not report a
separate `agents[]` shape.

Agent outcomes use `nativeUnits[]` to reference these ownership units. Each
reference contains `scope` (`project` or `user`) and a structured `address`
with the same entry, file, key-path, or region shape. Inventory duplicate
entries use this same reference shape. These values are JSON objects, so
consumers never parse an encoded internal map key.

Native file readback establishes what was written. An agent's runtime may
select a different configuration, so its availability remains `unverified`
unless there is separate evidence of that selection. Preview describes the
planned native locations without claiming that application occurred.

`axm sync --preview --fail-on-change --json` retains the ordinary preview
step details but returns `ok: false`, `result.divergence: true`, and exit 1
when the plan contains changes. A converged workspace returns a `no-op`
result and exit 0. Planning or validation failures retain their normal error
or failed-plan contract.

`axm view <extension> <field> --json` places the selected scalar or array directly
under `result`. `axm token show` and `axm token create` never return a secret in a
JSON document: `--json` is a usage error before any credential is read or
created. Use `--plain` to write only the token to stdout.

Stderr error events use `{type: "error", code, message}`. Their `code` uses
the same `ErrorCode` vocabulary as envelope codes and plan failure categories;
`axm help exit-codes` pairs these strings with process exits. The additional
stderr-only code `interrupted` requires `signal: "SIGINT" | "SIGTERM"`.
Other error codes carry no signal. Error events have no `reason` field.

Published-extension Registry mutations use `result.contract:
"registry-transition-v1"`. `action` identifies yank, unyank, deprecate,
undeprecate, archive, unarchive, visibility-set, or visibility-reconcile.
`fqn` is the unversioned extension identity; an exact release uses a separate
`version`. The Registry supplies the acknowledged `before`, `after`,
`disposition` (`changed` or `already-current`), and `revision`. These writes
always report `restorable: false`.

Before/after state follows the action: archival and deprecation carry nullable
publisher guidance, visibility carries public/private values, and a single
version carries its yank state. An all-available yank carries the available
version collection before and after the atomic write, plus `affectedVersions`.
It does not affect future publication.

Publish results are discriminated by `result.contract: "publish-result-v3"`.
They separate `selection.decisions`, the authoritative `publicationSet`, and
`execution.outcomes`. A failed item identifies an operation that actually
failed and carries a typed `cause`; a blocked item was not attempted and names
its causal item or finding through `blockedBy`. Counts are derived from those
outcomes, so blocked items never increment `failed`.

An interrupted publish still emits one complete document, with
`result.interruption.signal` and per-item evidenced states: a recorded
response keeps its `success` or `failed` status, an upload that was
dispatched with no recorded response reports `status: "unknown"` with
`reason: "interrupted"` — the registry may have committed the version — and
work the interruption prevented stays `pending`. AXM never auto-retries the
replay-unsafe upload; the recovery command verifies before it re-runs.

After a post-preflight partial publication or an interruption,
`result.recovery.cmd` is a credential-free generic `axm publish` command over
only the failed, indeterminate, or interrupted items and their blocked
dependents. `result.recovery.remainingItems[]` names that exact
continuation set, while `blockedDependents[]` identifies the subset that was
not attempted. The command verifies byte-identical versions created by an
earlier attempt and retries versions that remain absent. A rejected preflight
has findings and corrective suggestions instead of a partial-publication
recovery command.

An upload failure's `cause` includes a stable error `class`, `retryable`, and,
when a Registry request policy ran, `attemptCount`, `maxAttempts`,
`attemptsExhausted`, and `retryStoppedBy`. Retry stop reasons are
`attempt-limit`, `deadline`, or `replay-unsafe`. `requestId`, `responseStatus`,
and `problemCode` are included when the Registry supplied them. Opaque response
bodies are not included. Automation should use these fields rather than matching
error messages.

`axm mcps list --json` keeps connection, source, and resolution identities
separate. Each item includes `localName`, a discriminated `source` object, and
either a Registry `resolution` with exact version and integrity or `null`.
Automation should not infer the published source from the local name.

Built-in formatter documents are the two success-envelope exceptions:

`axm help --json` returns topic index entries with `name`, `description`, and
`kind`. `axm help <topic> --json` returns either
`{topic, kind: "markdown", content}` or
`{topic, kind: "json-schema", schema}`. A schema is a JSON object, so consumers
do not parse an escaped JSON string. Human schema help still prints raw JSON.
`axm help <command-path> --json` delegates to formatter help without an envelope.

```json
{
  "type": "help",
  "description": "Manage agent extensions",
  "usage": "axm <subcommand> [flags]",
  "flags": []
}
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
  "detail": "Credentials were rejected, are invalid, or expired."
}
```

Recognized failures may also include an optional schema-backed `problem`
object. For example, an unsupported lockfile version reports facts without
requiring message parsing:

```json
{
  "ok": false,
  "code": "validation",
  "title": "Unsupported workspace lockfile version",
  "detail": "Workspace lockfile at /workspace/axm-lock.yaml declares version 12, but this AXM supports version 11. This workspace requires a newer AXM.",
  "problem": {
    "code": "workspace-lockfile-version-unsupported",
    "path": "/workspace/axm-lock.yaml",
    "observedVersion": 12,
    "supportedVersion": 11,
    "direction": "newer"
  },
  "suggestions": [
    {
      "description": "Upgrade AXM before accessing this workspace.",
      "cmd": "axm upgrade"
    }
  ]
}
```

The matching stderr stream ends with an event such as:

```json
{
  "type": "error",
  "code": "auth",
  "message": "Credentials were rejected, are invalid, or expired."
}
```

The required fields are `ok: false`, `code`, `title`, and `detail`. The only
optional error-envelope fields are:

- `diagnosticId`: the optional ID of retained local support evidence;
- `cause[]`: redacted cause-chain entries under `--verbose` or `--debug` only,
  with `_tag`, `message`, and optional `code`; `stack` appears only under
  `--debug`. Only this shape is frozen; tags, messages, and stacks are unfrozen
  diagnostic content. Messages contain human text or the cause tag rather than
  serialized object fields;
- `problem`: schema-backed details for a recognized problem, discriminated by
  its `code`;
- `metadata.request`: Registry `service`, `url`, and optional `method`;
- `metadata.response`: numeric `status` and optional `requestId`,
  `problemCode`, and redacted `body`;
- `metadata.requestPolicy`: `retryable`, `attemptCount`, `maxAttempts`,
  `exhausted`, `replaySafety`, and optional `stoppedBy`;
- `status: "pending-human"`, `retryable`, and `blockedOn: "human"`: the command is waiting for a person and can resume;
- `action`: an `open-url` action; human handoffs include `purpose`,
  `requestRef`, `registryUrl`, `url`, `expiresAt`, `intervalSeconds`, and
  `resume`, with `fallbackUrl` and `code` for device sign-in; and
- `suggestions[]`: typed recovery actions with a description and optional
  command or URL.

Exit 4 with `code: "auth"` means supplied or stored credentials were rejected,
invalid, or expired. Missing credentials or a sign-in/authorization flow that
needs a person uses exit 13 with `code: "auth_required"` and
`blockedOn: "human"`. Expired and denied pending flows use
`auth_expired`/exit 14 and `auth_denied`/exit 15 respectively.

Normal, verbose, and debug error surfaces redact credentials from metadata,
response bodies, causes, stacks, URLs, suggestions, and telemetry.

Device sign-in uses `axm login --device-code --json` to start or re-emit the
matching pending request. Its successful initiation returns `ok: true`, exit 0,
and `result.status: "pending-human"`; this means the handoff is available,
not that credentials were stored. `axm login --device-code --wait-for-human 300
--json` starts or reuses that request, shows the handoff on stderr, waits up to
300 seconds (never past the code's expiry), saves the credentials, and returns
one final document. A wait that ends first returns the pending action with
`code: "timeout"` and exit 16, and the request stays resumable; expiry and
denial are terminal. A bounded wait always uses device-code sign-in, with or
without `--device-code`. The `action` uses `purpose: "login"` and
includes both the complete browser link and the clean fallback URL and code.
Keep the same Registry. `--restart` explicitly replaces a pending sign-in;
repeating initiation does not.

Publishing requires you to be signed in. A signed-out `axm publish` reports
`code: "auth_required"` with exit 13 and creates nothing on the Registry; sign
in and publish again:

```sh
axm login
axm publish @acme/skills/review --json
```

Interactive Registry writes open the verification page and retry once after
verification. The browser's approval page and the originating command report
different milestones: read the final command result to establish completion.

## Registry request recovery

Every Registry request has a 10-second attempt timeout and a 30-second total
deadline. AXM may make at most three attempts for replay-safe reads, using
capped exponential backoff with jitter. A `Retry-After` response header, or
typed `retryAfterSeconds` guidance on a 429 or 503 response, can extend that
backoff only when the next attempt still fits inside the total deadline.

AXM does not automatically retry a Registry mutation unless the request has a
Registry-supported idempotency key that makes exact replay safe. Cancellation
interrupts an active request or retry delay immediately. After retries are
exhausted, automation receives one final error envelope and nonzero exit. Its
`metadata.requestPolicy` records whether the failure remains retryable, the
attempt and policy bounds, whether recovery was exhausted, the stop reason,
and the request's replay-safety class. Use those typed fields with the stable
`code`, request metadata, response request ID, and problem code for
diagnostics. Debug stderr records attempt evidence without changing the stdout
contract.

## Stderr events

The public `MachineEventSchema` from `axm.sh/runtime` decodes the closed set
of five NDJSON event types. Each event has the fields below:

| `type`        | Payload fields                                                                     |
| ------------- | ---------------------------------------------------------------------------------- |
| `progress`    | `event`: one lifecycle event described below                                       |
| `log`         | `level`: `info`, `warn`, or `error`; `message`: string                             |
| `error`       | `code`: an error code; `message`: string; `signal` required only for `interrupted` |
| `suggestion`  | `description`: string; optional `cmd` and `url`: strings                           |
| `instruction` | `message`: string                                                                  |

## Progress events

Every long-running operation publishes its lifecycle to stderr as it happens,
one event per line, wrapped in the `progress` envelope:

```json
{
  "type": "progress",
  "event": {
    "_tag": "UnitStarted",
    "seq": 4,
    "atMs": 1756900000123,
    "unitId": "skill:code-review",
    "label": "code-review",
    "index": 0,
    "total": 2
  }
}
```

Envelope documents use `type`; kernel lifecycle unions and diagnostic
`cause[]` entries use `_tag`. AXM preserves the kernel event discriminator.

`event` is one typed lifecycle event discriminated by `_tag`:
`OperationStarted` (`operationId`, `name`, `mode`), `PhaseStarted` (`phase`:
`resolution`, `planning`, `preview`, `confirmation`, `validation`,
`acquisition`, `apply`, `verification`, or `restoration`), `UnitStarted` and `UnitResolved` (`unitId`, `label`, `index`,
optional `total`; the resolved event carries the unit `state`, and an optional
`failure` with the `category` and `detail` its producer settled with when that
state is `failed` or `blocked`), `UnitProgress`
(`unitId`, `done`, optional `total`, `unit` of `bytes`, `files`, or `items`, and
optional `attempt` with `n` and `of` when retrying),
`Waiting` and `WaitEnded` (`subject`, with the waiting event's `blockingClass`
and `detail`), and `OperationSettled` (`outcome`). Events carry identifiers,
labels, counts, states, and the producer's own category and detail for a unit
that did not settle — never presentation wording: a consumer words every event
itself, and a failure detail is redacted before it is published, exactly as the
error envelope's is.

The published lifecycle enum values, in schema order, are:

| Field                      | Values                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `OperationStarted.mode`    | `query`, `preview`, `apply`                                                                                              |
| `PhaseStarted.phase`       | `resolution`, `planning`, `preview`, `confirmation`, `validation`, `acquisition`, `apply`, `verification`, `restoration` |
| `OperationSettled.outcome` | `previewed`, `applied`, `no-op`, `partial`, `failed`, `blocked`, `cancelled`, `interrupted`, `completed`                 |

Read-only operations use `mode: "query"` and settle successfully as `completed`.
Mutation plans use `preview` or `apply`; their plan-result mode and outcomes
retain the mutation vocabulary described above.

Within one operation `seq` increases strictly from 1 and `atMs` is wall-clock
milliseconds. Exactly one `OperationSettled` event ends the operation, and it
is written before the stdout result document. `--quiet` suppresses progress
events and nothing else on stderr.

## Blocking classes

A blocked plan or unit names a `BlockingClass`. The closed vocabulary and
terminal exit mapping are:

| Class                | Exit                           |
| -------------------- | ------------------------------ |
| `approval-required`  | 2                              |
| `override-required`  | 2                              |
| `precondition-unmet` | cause                          |
| `dependency-failed`  | cause                          |
| `dependency-cycle`   | 6                              |
| `stale-candidate`    | 6                              |
| `policy-excluded`    | 6                              |
| `resource-conflict`  | 6                              |
| `external-blocked`   | Waiting only; no terminal exit |
| `human-required`     | Waiting only; no terminal exit |
| `operation-aborted`  | cause                          |

`cause` means the error code carried by `blocking.causeCode`, then the
operation failure's category, or exit 1 if neither is supplied. See
`axm help exit-codes` for the error-code mapping. `external-blocked` and
`human-required` describe a live `Waiting` event; the eventual settlement
supplies the terminal outcome and exit.

## Consumption

- Parse the entire stdout buffer once; ordinary `--json` is not a result stream.
- Parse each non-empty stderr line independently as JSON.
- Structurally validate stdout: formatter documents have `type: "help"` or
  `type: "version"`; ordinary result documents own `result`; expected errors
  own `ok: false`, `code`, `title`, and `detail` without `result`.
- In JavaScript and TypeScript clients, decode with
  `MachineOutputDocumentSchema` and branch with
  `detectMachineOutputDocumentKind` from `axm.sh/runtime`.
- The four document kinds are `result-envelope-v1`, `error-envelope-v1`,
  `help-document-v1`, and `version-document-v1`.
- Branch on `ok` or the process exit code for ordinary results and errors; they
  agree.
- Read every ordinary command payload from `result`.

Future streaming results require a separate explicit mode and contract.

Error-envelope `code` and plan `failure.category` retain snake_case as a
deliberate exception to kebab-case CLI enums. Registry `problemCode` is
preserved unchanged.
