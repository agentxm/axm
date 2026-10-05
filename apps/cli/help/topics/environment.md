# Environment

AXM environment variables control the current process. They are not workspace
state, are never written to `axm.json`, and do not travel with a
workspace. The reference below lists the supported values and defaults.

Variables classified as **stable automation** are the supported public
contract for scripts, CI, and agents. Variables classified as **internal** are
reserved for AXM development and tests; they may change without notice and
should not be used in external automation.

Set `AXM_USER_HOME` to a non-empty absolute path to select a home for AXM's
user resources. The user workspace lives at `.axm/workspace/` beneath that
home. Restricted file credentials, pending device login, install metadata,
and the default self-managed executable also use the selected home.
Project state remains in the selected project. This setting does not change
the operating-system account or its keychain.

## Native MCP configuration selection

Set `AXM_VSCODE_USER_MCP_CONFIG` to the absolute `mcp.json` path for the
VS Code profile you intend to manage. AXM does not guess an active user profile.
Project configuration stays in `.vscode/mcp.json`. This selects local
configuration only; remote windows and native authentication remain host-owned.

AXM captures `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `COPILOT_HOME`,
`PI_CODING_AGENT_DIR` and `XDG_CONFIG_HOME` as native configuration-root inputs
when present. Use the same roots when launching the corresponding host.
These selection inputs do not resolve any MCP credential reference.

## Registry credentials

For the effective default Registry, ambient credentials resolve in this
order:

1. a non-empty `AXM_TOKEN` value;
2. the trimmed, non-empty contents of the readable file named by
   `AXM_TOKEN_FILE`;
3. in a GitHub Actions job granted `permissions: id-token: write`, a workload
   token for the job's trusted publisher (see below);
4. the stored credential from `axm login`.

Prefer `AXM_TOKEN_FILE` in automation so the secret does not need to live in
the process environment or command line. Restrict the file to the account that
runs AXM. Diagnostics redact credential values, and ambient credentials are not
persisted as login sessions. `axm token --output token` writes the effective
token, and nothing else, to stdout. Ambient credentials are never forwarded to
any non-default Registry origin. Configure the durable Registry choice with
`defaultRegistry` and `sources` in settings; see `axm help settings`.

## Publishing from GitHub Actions

A GitHub Actions job granted `permissions: id-token: write` can authenticate
without a stored secret. GitHub gives such a job `ACTIONS_ID_TOKEN_REQUEST_URL`
and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`. When both are set, no explicit token is
supplied, and `AXM_TRUSTED_PUBLISHING` is not `0`, AXM requests an ID token
whose audience is the default Registry's origin and exchanges it at that
Registry for a short-lived workload token. The exchange happens when a command
first needs a credential, such as publishing, `axm whoami`, or `axm token`, at
most once per invocation; reads that need no credential stay anonymous and ask
for no ID token. From then on the workload token is presented only to the
default Registry origin. The Registry accepts the exchange only when an active
trusted publisher matches the job's repository, workflow file, and
environment; register one in
[web settings](https://agentxm.ai/u/settings/trusted-publishers). The workload
token can do only what that trusted publisher permits, has no refresh token,
and is never retried after the Registry rejects it. `axm whoami` names the
trusted publisher, and `axm token --output token` writes the workload token.

When the job cannot obtain an ID token, or no trusted publisher accepts it, AXM
fails with `auth_required` and names what to change. A job that holds the
ID-token variables for another purpose and should not use trusted publishing
sets `AXM_TRUSTED_PUBLISHING=0`; an explicit `AXM_TOKEN` or `AXM_TOKEN_FILE`
also takes precedence.

## Creating a token for automation

Create access tokens in [web settings](https://agentxm.ai/u/settings/tokens).
Choose the token's permission and resource restrictions there, then copy its
one-time secret into your automation secret store. A workflow hands that secret
to AXM as `AXM_TOKEN` or through `AXM_TOKEN_FILE`. `axm token list` and
`axm token revoke` remain available in the CLI.

Success means AXM issued the token and stdout accepted it, not that the
receiving tool stored it, or that anything was still reading: acceptance is the
runtime taking the bytes. `pipefail` reports a failure on either side. If the
consumer fails after reading, revoke the token by the ID shown on stderr with
`axm token revoke <id>`. If stdout fails before accepting the whole token, AXM
revokes that new token once, within 10 seconds, reports the outcome on stderr,
and exits nonzero. A forced exit, a lost Registry answer, or an unreachable
Registry can leave it active, and a creation the Registry did not definitively
refuse — no answer, an unreadable one, or a gateway or server error — may or
may not have issued a token: check `axm token list` before creating another,
and revoke unwanted tokens by ID, since names are not unique. Trust the
receiving tool not to echo its input; a pipe does not keep a secret from a
process that can read it.

## Startup network behavior

Set `AXM_NO_UPDATE_CHECK=1` to disable informational startup update requests
and notifications in every output and interaction mode. Explicit commands
still perform their required network operations; for example, `axm upgrade`
resolves a release when asked to upgrade. This setting does not disable local
compatibility checks performed by `axm lint`.

## Telemetry

Telemetry is execution policy, not workspace state. Any nonempty `DO_NOT_TRACK` or
`DISABLE_TELEMETRY` disables telemetry, including `0`, `false`, or whitespace.
Empty standard flags do not disable it. Otherwise:

- `AXM_TELEMETRY=0` or `false` disables telemetry;
- `AXM_TELEMETRY=errors` sends error reports only;
- `AXM_TELEMETRY=1` or `true` enables usage events and error reports; and
- an absent `AXM_TELEMETRY` enables usage and errors by default;
- an explicitly empty or unrecognized value disables telemetry.

Successful fresh skill installs report public coordinates only: a production
Registry publisher binding and package name, or an unauthenticated GitHub-public
repository and the skill's repository-relative directory. Immutable revision,
project/user scope, install/reinstall kind, and verified target agent IDs accompany
the event. Local, private, unknown-visibility, and unsupported sources are omitted;
repairs and unchanged installs do not count. Caller agent identity is a finite,
best-effort detection result shared with usage and errors; unknown stays unknown.
No account identity or person profile is attached.

An error report describes at most one failure per invocation, the one that
ended it: a stable failure kind and category, whether AXM handled it, when it
occurred, the stage where the invocation ended (startup, configuration,
command, or output), the command name without its arguments, the AXM version,
runtime, platform, and architecture, whether it ran in CI, and random IDs that
correlate the report.
It never includes error messages, stack traces, arguments, file paths,
environment values, or extension content. Successful and cancelled invocations
send no error report.

When telemetry is enabled, AXM creates a random pseudonymous installation ID at
`$AXM_USER_HOME/.axm/telemetry/installation-id` (or the equivalent path under
the platform home). It does not derive this identity from the hostname. If that
file cannot be read or created, AXM sends error reports without an installation
ID, skips usage events, and leaves the file as it is. Each usage
event and error report also receives a fresh event ID so delivery retries can
be deduplicated, and those from one invocation share a random invocation ID.
When a command ends, AXM waits at most 250 ms in total for telemetry delivery,
and not at all when the command is interrupted. CI uses the same defaults and opt-outs, without prompting.

Set `AXM_TELEMETRY_PREVIEW=1` or `true` to see exactly what telemetry would
send. AXM prints each payload to stderr, one line per payload, and sends
nothing. With `--json`, each line is an NDJSON `log` event. Preview obeys
`DO_NOT_TRACK`, `DISABLE_TELEMETRY`, and `AXM_TELEMETRY`: it never enables telemetry by itself and
prints nothing while telemetry is off. Preview starts no GitHub visibility
requests, so Git installs without already-established public evidence are omitted.

```sh
AXM_TELEMETRY=1 AXM_TELEMETRY_PREVIEW=1 axm lint
```

A top-level `telemetry` key in `axm.json` is unrecognized and is
reported by strict workspace linting.

## Interaction and text-output modes

`--non-interactive` guarantees that AXM never opens a prompt. When required
input is missing, the command fails with an actionable error instead. JSON
mode and non-interactive environments, including CI and a non-TTY stdin, apply
the same prompt prohibition.

For command error reports, `--quiet` takes precedence over debug and verbose
requests. Debug takes precedence over verbose. Use `--verbose` or `-v` for
available cause details, and `--debug` for available stack details.
`AXM_VERBOSE=1` or `true` and `AXM_DEBUG=1` or `true` request the same detail
levels. Credential values remain redacted at every level. With JSON output,
quiet mode suppresses progress while preserving results and other diagnostics.

Human output styles a stream only when that stream is itself a capable TTY:
a piped stdout stays plain even while stderr is attached to a terminal, and
the live progress frame animates only on a TTY stderr. `NO_COLOR`,
`FORCE_COLOR=0`, and `TERM=dumb` each force plain output without ANSI
styling or terminal hyperlinks on both streams. `FORCE_COLOR` does not turn a
pipe into a terminal or enable animation. A stream that is not a TTY is never
wrapped, truncated, or padded to a terminal width.

Human output draws status symbols, change markers, tree connectors, and
separators with Unicode characters. Set `AXM_ASCII=1` to use ASCII symbols;
any non-empty value requests the same mode. `TERM=dumb` also selects ASCII,
as do declared `LC_ALL`, `LC_CTYPE`, and `LANG` values that consistently name
non-UTF-8 locales. Content such as extension names keeps its original
characters. These display controls do not change JSON documents.

## Variable reference

| Variable                     | Classification    | Values and default                                                  | Effect, precedence, and applicable modes                                                                                                                                           |
| ---------------------------- | ----------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AXM_TOKEN_FILE`             | stable automation | Readable file path; unset                                           | Preferred non-interactive credential. Its trimmed contents take precedence over stored credentials, but follow `AXM_TOKEN`. Applies only to the effective default Registry origin. |
| `AXM_TOKEN`                  | stable automation | Non-empty token; unset                                              | Highest-precedence ambient credential for the effective default Registry origin. More exposed than `AXM_TOKEN_FILE`; never log it.                                                 |
| `AXM_TRUSTED_PUBLISHING`     | stable automation | `0` disables; enabled otherwise                                     | `0` stops AXM from exchanging a GitHub Actions job's ID token for a workload token, even when the job offers one.                                                                  |
| `AXM_USER_HOME`              | stable automation | Non-empty home-directory path; platform home when unset             | Relocates the user workspace and application resources described above; project state remains in the selected project.                                                             |
| `AXM_NO_UPDATE_CHECK`        | stable automation | `1` disables; enabled otherwise                                     | Unconditionally disables the informational startup update check in every output and interaction mode.                                                                              |
| `AXM_TELEMETRY`              | stable automation | `0`, `false`, `errors`, `1`, or `true`; usage and errors by default | Controls telemetry for the current process. Nonempty `DO_NOT_TRACK` or `DISABLE_TELEMETRY` wins. Empty or unrecognized explicit values disable collection.                         |
| `DO_NOT_TRACK`               | stable automation | Any nonempty value disables                                         | Standard opt-out; overrides `AXM_TELEMETRY`.                                                                                                                                       |
| `DISABLE_TELEMETRY`          | stable automation | Any nonempty value disables                                         | Standard opt-out, equal precedence to `DO_NOT_TRACK`.                                                                                                                              |
| `AXM_TELEMETRY_PREVIEW`      | stable automation | `1` or `true` enables; disabled otherwise                           | Prints each would-be telemetry payload to stderr and sends nothing. Obeys both standard opt-outs and `AXM_TELEMETRY`; writes nothing while telemetry is off.                       |
| `AXM_VERBOSE`                | stable automation | `1` or `true` enables; disabled otherwise                           | Enables verbose diagnostics unless quiet mode is selected. Debug mode takes precedence.                                                                                            |
| `AXM_DEBUG`                  | stable automation | `1` or `true` enables; disabled otherwise                           | Enables debug diagnostics unless quiet mode is selected; takes precedence over verbose mode.                                                                                       |
| `AXM_ASCII`                  | stable automation | Non-empty enables; Unicode glyphs otherwise                         | Selects ASCII display symbols in human output while preserving content; JSON mode is unaffected. See locale and terminal inputs above.                                             |
| `AXM_INSTALL_DIR`            | stable automation | Absolute directory path; `$AXM_USER_HOME/.axm/bin`                  | Selects the destination directory used by the public shell and PowerShell installers.                                                                                              |
| `AXM_INSTALL_VERSION`        | stable automation | Exact `1.2.3`-style release; automatic selection when unset         | Selects one immutable release for the public installers without stable-channel discovery.                                                                                          |
| `AXM_VSCODE_USER_MCP_CONFIG` | stable automation | Absolute profile `mcp.json` path; unresolved when unset             | Selects the local VS Code user MCP file. An unset or invalid selection is reported rather than guessed.                                                                            |
| `AXM_CLAUDE_SKILLS_DIR`      | internal          | Directory path; agent default when unset                            | Test/development override for Claude Code's skill directory. An empty override is invalid.                                                                                         |
| `AXM_GEMINI_CLI_SKILLS_DIR`  | internal          | Directory path; agent default when unset                            | Test/development override for Gemini CLI's skill directory. An empty override is invalid.                                                                                          |
| `AXM_INSTALL_BASE_URL`       | internal          | URL; release-derived URL when unset                                 | Test/development override for the public installers' artifact base URL.                                                                                                            |
| `AXM_INSTALL_ENTRYPOINT`     | internal          | `cmd` or unset                                                      | PowerShell wrapper hint used only to render shell-appropriate PATH guidance.                                                                                                       |
| `AXM_TELEMETRY_BASE_URL`     | internal          | URL; AXM telemetry service                                          | Test/development override for the telemetry endpoint.                                                                                                                              |

## Where to go next

- `axm help settings` — durable workspace state and recognized settings keys
- `axm help machine-output` — JSON and NDJSON output contracts
- `axm help upgrade` — explicit upgrade selection and execution
- `axm whoami` — inspect current authentication without printing a token
