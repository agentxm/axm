# Machine output

Pass `--json` to receive one complete machine-readable document on stdout.
Warnings, errors, suggestions, and lifecycle progress use one JSON object per
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

Workspace mutation results are discriminated by
`result.contract: "plan-result-v3"`. Outcomes are `previewed`, `applied`,
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
An `interrupted` unit was started but its settlement was not observed —
started work is never reported as not attempted. Inspect `result.counts`,
unit dispositions, and `result.recovery.retained` when recovering a partial
or interrupted result.

`axm sync --preview --fail-on-change --json` retains the ordinary preview
step details but returns `ok: false`, `result.divergence: true`, and exit 1
when the plan contains changes. A converged workspace returns a `no-op`
result and exit 0. Planning or validation failures retain their normal error
or failed-plan contract.

`axm view <extension> <field> --json` places the selected scalar or array directly
under `result`. Token commands also place their command payload under `result`;
do not log or forward token result documents.

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
  "detail": "Workspace lockfile at /workspace/axm-lock.yaml declares version 8, but this AXM supports version 7. This workspace requires a newer AXM.",
  "problem": {
    "code": "workspace-lockfile-version-unsupported",
    "path": "/workspace/axm-lock.yaml",
    "observedVersion": 8,
    "supportedVersion": 7,
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

- `cause[]`: redacted cause-chain entries with `_tag`, `message`, and optional
  `code` and `stack`;
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

## Human verification and resume

An unattended Registry write (`--json` or `--non-interactive`) returns its
pending verification immediately. It does not open a browser, wait for the
person, or retry the challenged write. Its existing error envelope has
`ok: false`, `code: "auth_required"`, `status: "pending-human"`,
`blockedOn: "human"`, and exit 13. The `action` identifies the request and
contains the browser URL and resume instructions.

Open `action.url`, verify the displayed action and target, then rerun the same
command with its original inputs and `--step-up-request` set to
`action.requestRef`:

```sh
axm unyank @acme/skills/review@1.2.3 --json
axm unyank @acme/skills/review@1.2.3 --json \
  --step-up-request 'https://registry.agentxm.ai/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc'
```

The reference above is illustrative; use the exact value returned for your
request. Resume first checks that request on the selected Registry. Pending
verification returns the same handoff, verified evidence permits one attempt
through the original command, and terminal requests are never silently
replaced. Changed inputs remain subject to the Registry's intent-binding
checks. A request reference is not a credential or authorization proof.

Add `--wait-for-human 60` to wait for at most 60 seconds, bounded further by
the request expiry. A wait timeout returns the same pending action with
`code: "timeout"` and exit 16. Expiry uses exit 14; cancellation uses exit 15.
An already consumed request requires checking the earlier action's outcome.
Existing login credentials remain in place throughout this handoff.

Device sign-in uses `axm login --device-code --json` to start or re-emit the
matching pending request. Its successful initiation returns `ok: true`, exit 0,
and `result.status: "pending-human"`; this means the handoff is available,
not that credentials were stored. Resume it with `axm login --wait --json`,
optionally adding `--timeout 60`. The `action` uses `purpose: "login"` and
includes both the complete browser link and the clean fallback URL and code.
Keep the same Registry and scopes. `--restart` explicitly replaces a pending
sign-in; repeating initiation does not.

Publish without existing publication authority uses the same pending-human
error envelope, with `action.purpose: "publish"` and exit 13:

```sh
axm publish @acme/skills/review --json
axm publish @acme/skills/review --json \
  --authorization-request 'https://registry.agentxm.ai/v1/auth/publish-requests/pubreq_01h455vb4pexka56gq5w2r7cpc'
```

Use the exact returned `action.requestRef`; the URL above is illustrative.
Keep the original command inputs and local AXM user home. AXM retains a private
proof there so a later process can resume the request. Copying its public URL to
another machine does not transfer that proof. Changed archive bytes, publication
membership, visibility inputs, or Registry require a new review.

Add `--wait-for-human 60` for a bounded wait. Approval authorizes the reviewed
publication; check the final `publish-result-v3` document to determine which
uploads completed. If approval was already exchanged, follow the explicit
recovery instruction to verify publication outcomes before requesting fresh
consent. AXM does not silently replace the request or replay uploads.

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

`event` is one typed lifecycle event discriminated by `_tag`:
`OperationStarted` (`operationId`, `name`, `mode`), `PhaseStarted` (`phase`:
`resolution`, `planning`, `preview`, `confirmation`, `validation`, `apply`, or
`restoration`), `UnitStarted` and `UnitResolved` (`unitId`, `label`, `index`,
optional `total`; the resolved event carries the unit `state`), `UnitProgress`
(`unitId`, `done`, optional `total`, `unit` of `bytes`, `files`, or `items`),
`Waiting` and `WaitEnded` (`subject`, with the waiting event's `blockingClass`
and `detail`), and `OperationSettled` (`outcome`). Events carry identifiers,
labels, counts, and states, never presentation wording.

Within one operation `seq` increases strictly from 1 and `atMs` is wall-clock
milliseconds. Exactly one `OperationSettled` event ends the operation, and it
is written before the stdout result document. `--quiet` suppresses progress
events and nothing else on stderr.

## Consumption

- Parse the entire stdout buffer once; ordinary `--json` is not a result stream.
- Parse each non-empty stderr line independently as JSON.
- Structurally validate stdout: formatter documents have `type: "help"` or
  `type: "version"`; ordinary result documents own `result`; expected errors
  own `ok: false`, `code`, `title`, and `detail` without `result`.
- In JavaScript and TypeScript clients, decode with
  `MachineOutputDocumentSchema` and branch with
  `detectMachineOutputDocumentKind` from `axm.sh/runtime`.
- Branch on `ok` or the process exit code for ordinary results and errors; they
  agree.
- Read every ordinary command payload from `result`.

Future streaming results require a separate explicit mode and contract.
