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

## Registry and authentication precedence

`AXM_REGISTRY_LOCATION` replaces the built-in extension source location. It
accepts a non-empty URL or filesystem path; relative paths resolve from the
current execution directory. When it is unset, AXM uses `AXM_REGISTRY_URL`,
which defaults to `https://registry.agentxm.ai`.

For the default AgentXM Registry origin, ambient credentials resolve in this
order:

1. a non-empty `AXM_TOKEN` value;
2. the trimmed, non-empty contents of the readable file named by
   `AXM_TOKEN_FILE`;
3. the stored credential from `axm login`.

Prefer `AXM_TOKEN_FILE` in automation so the secret does not need to live in
the process environment or command line. Restrict the file to the account that
runs AXM. Diagnostics redact credential values, and ambient credentials are not
persisted as login sessions. The explicit `axm token` command returns the
effective token when requested. Ambient
credentials are not forwarded to custom registry origins; configure those
sources explicitly.

## Startup network behavior

Set `AXM_NO_UPDATE_CHECK=1` to disable informational startup update requests
and notifications in every output and interaction mode. Explicit commands
still perform their required network operations; for example, `axm upgrade`
resolves a release when asked to upgrade. This setting does not disable local
compatibility checks performed by `axm lint`.

## Telemetry

Telemetry is execution policy, not workspace state. `DO_NOT_TRACK=1` disables
telemetry and takes precedence over `AXM_TELEMETRY`. Otherwise:

- `AXM_TELEMETRY=0` or `false` disables telemetry;
- `AXM_TELEMETRY=errors` sends error telemetry only;
- `AXM_TELEMETRY=1` or `true` enables usage and error telemetry; and
- an unset, empty, or unrecognized value uses the default of usage and error
  telemetry.

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

| Variable                       | Classification    | Values and default                                               | Effect, precedence, and applicable modes                                                                                                                                 |
| ------------------------------ | ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AXM_REGISTRY_LOCATION`        | stable automation | Non-empty URL or path; built-in source when unset                | Highest-precedence extension source location for all modes. Relative paths resolve from the execution directory.                                                         |
| `AXM_REGISTRY_URL`             | stable automation | URL; `https://registry.agentxm.ai`                               | Default Registry service and authentication origin when `AXM_REGISTRY_LOCATION` is unset.                                                                                |
| `AXM_TOKEN_FILE`               | stable automation | Readable file path; unset                                        | Preferred non-interactive credential. Its trimmed contents take precedence over stored credentials, but follow `AXM_TOKEN`. Applies only to the default Registry origin. |
| `AXM_TOKEN`                    | stable automation | Non-empty token; unset                                           | Highest-precedence ambient credential for the default Registry origin. More exposed than `AXM_TOKEN_FILE`; never log it.                                                 |
| `AXM_USER_HOME`                | stable automation | Non-empty home-directory path; platform home when unset          | Relocates the user workspace and application resources described above; project state remains in the selected project.                                                   |
| `AXM_NO_UPDATE_CHECK`          | stable automation | `1` disables; enabled otherwise                                  | Unconditionally disables the informational startup update check in every output and interaction mode.                                                                    |
| `AXM_TELEMETRY`                | stable automation | `0`, `false`, `errors`, `1`, or `true`; all telemetry by default | Controls telemetry for the current process. `DO_NOT_TRACK=1` wins. Unrecognized values use the default.                                                                  |
| `AXM_VERBOSE`                  | stable automation | `1` or `true` enables; disabled otherwise                        | Enables verbose diagnostics unless quiet mode is selected. Debug mode takes precedence.                                                                                  |
| `AXM_DEBUG`                    | stable automation | `1` or `true` enables; disabled otherwise                        | Enables debug diagnostics unless quiet mode is selected; takes precedence over verbose mode.                                                                             |
| `AXM_ASCII`                    | stable automation | Non-empty enables; Unicode glyphs otherwise                      | Selects ASCII display symbols in human output while preserving content; JSON mode is unaffected. See locale and terminal inputs above.                                   |
| `AXM_INSTALL_DIR`              | stable automation | Absolute directory path; `$AXM_USER_HOME/.axm/bin`               | Selects the destination directory used by the public shell and PowerShell installers.                                                                                    |
| `AXM_INSTALL_VERSION`          | stable automation | Exact `1.2.3`-style release; automatic selection when unset      | Selects one immutable release for the public installers without stable-channel discovery.                                                                                |
| `AXM_CLAUDE_SKILLS_DIR`        | internal          | Directory path; agent default when unset                         | Test/development override for Claude Code's skill directory. An empty override is invalid.                                                                               |
| `AXM_GEMINI_CLI_SKILLS_DIR`    | internal          | Directory path; agent default when unset                         | Test/development override for Gemini CLI's skill directory. An empty override is invalid.                                                                                |
| `AXM_INSTALL_BASE_URL`         | internal          | URL; release-derived URL when unset                              | Test/development override for the public installers' artifact base URL.                                                                                                  |
| `AXM_INSTALL_ENTRYPOINT`       | internal          | `cmd` or unset                                                   | PowerShell wrapper hint used only to render shell-appropriate PATH guidance.                                                                                             |
| `AXM_INSTALL_GITHUB_REPO`      | internal          | GitHub `owner/repo`; `agentxm/axm`                               | Test/development override for install-script artifact retrieval. It does not change upgrade release authority.                                                           |
| `AXM_TELEMETRY_BASE_URL`       | internal          | URL; AXM telemetry service                                       | Test/development override for the telemetry endpoint.                                                                                                                    |
| `AXM_TELEMETRY_ENABLE_IN_TEST` | internal          | `true` enables; disabled under Vitest otherwise                  | Allows telemetry transport during tests. It has no supported external automation contract.                                                                               |

## Where to go next

- `axm help settings` — durable workspace state and recognized settings keys
- `axm help machine-output` — JSON and NDJSON output contracts
- `axm help upgrade` — explicit upgrade selection and execution
- `axm whoami` — inspect current authentication without printing a token
