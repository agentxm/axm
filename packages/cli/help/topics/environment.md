# Environment

AXM environment variables control the current process. They are not workspace
state, are never written to `axm.json`, and do not travel with a
workspace. Unless a row says otherwise, an unset or empty variable uses the
documented default.

Variables classified as **stable automation** are the supported public
contract for scripts, CI, and agents. Variables classified as **internal** are
reserved for AXM development and tests; they may change without notice and
should not be used in external automation.

`AXM_USER_HOME` provides a hermetic user-home override. When non-empty, AXM
places the user workspace at `.axm/workspace/` beneath that directory and puts
restricted file credentials, pending device login state, install metadata, and
the self-managed binary in the surrounding `.axm/` application home. It does
not fall back to the platform home for those resources. Project `.axm` remains
in the project; performance-only state uses the platform cache directory.

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
3. a command token flag, when the command provides one; then
4. the stored credential from `axm login`.

Prefer `AXM_TOKEN_FILE` in automation so the secret does not need to live in
the process environment or command line. Restrict the file to the account that
runs AXM. AXM does not print or persist ambient token values. Ambient
credentials are not forwarded to custom registry origins; configure those
sources explicitly.

## Startup network behavior

The informational startup update check runs only in an attended, interactive
terminal. It is skipped in agent sessions, CI or other non-interactive
environments, JSON mode, non-TTY sessions, and while `axm upgrade` is running.
`AXM_NO_UPDATE_CHECK=1` disables it unconditionally. Explicit commands can
still perform their documented network operations; for example, `axm upgrade`
must resolve a release when asked to upgrade.

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

`--quiet` shows only final outcomes, errors, and values or actions required to
continue. It suppresses narration, diagnostics, progress, tables, and other
optional detail. Quiet wins over `--verbose`, `--debug`, `AXM_VERBOSE`, and
`AXM_DEBUG` in every combination. Verbose and debug output remain redacted:
credentials, tokens, secret environment values, sensitive causes, stacks,
suggestions, and telemetry payloads are never intentionally rendered.

Human output uses color and interactive activity only when stdout is a capable
TTY. `NO_COLOR`, `FORCE_COLOR=0`, CI, a non-TTY stdout, and `TERM=dumb` each
force plain output without ANSI styling or terminal hyperlinks on stdout or
stderr.

## Variable reference

| Variable                       | Classification    | Values and default                                               | Effect, precedence, and applicable modes                                                                                                                                           |
| ------------------------------ | ----------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AXM_REGISTRY_LOCATION`        | stable automation | Non-empty URL or path; built-in source when unset                | Highest-precedence extension source location for all modes. Relative paths resolve from the execution directory.                                                                   |
| `AXM_REGISTRY_URL`             | stable automation | URL; `https://registry.agentxm.ai`                               | Default Registry service and authentication origin when `AXM_REGISTRY_LOCATION` is unset.                                                                                          |
| `AXM_TOKEN_FILE`               | stable automation | Readable file path; unset                                        | Preferred non-interactive credential. Its trimmed contents take precedence over flags and stored credentials, but follow `AXM_TOKEN`. Applies only to the default Registry origin. |
| `AXM_TOKEN`                    | stable automation | Non-empty token; unset                                           | Highest-precedence ambient credential for the default Registry origin. More exposed than `AXM_TOKEN_FILE`; never log it.                                                           |
| `AXM_USER_HOME`                | stable automation | Home-directory path; platform home when unset or empty           | Relocates the user workspace and AXM application home. Platform caches and project `.axm` keep their platform/project locations.                                                   |
| `AXM_NO_UPDATE_CHECK`          | stable automation | `1` disables; enabled otherwise                                  | Unconditionally disables the informational startup update check in every output and interaction mode.                                                                              |
| `AXM_TELEMETRY`                | stable automation | `0`, `false`, `errors`, `1`, or `true`; all telemetry by default | Controls telemetry for the current process. `DO_NOT_TRACK=1` wins. Unrecognized values use the default.                                                                            |
| `AXM_VERBOSE`                  | stable automation | `1` or `true` enables; disabled otherwise                        | Enables verbose diagnostics unless quiet mode is selected. Debug mode takes precedence.                                                                                            |
| `AXM_DEBUG`                    | stable automation | `1` or `true` enables; disabled otherwise                        | Enables debug diagnostics unless quiet mode is selected; takes precedence over verbose mode.                                                                                       |
| `AXM_CLAUDE_SKILLS_DIR`        | internal          | Directory path; agent default when unset                         | Test/development override for Claude Code's skill directory. An empty override is invalid.                                                                                         |
| `AXM_GEMINI_CLI_SKILLS_DIR`    | internal          | Directory path; agent default when unset                         | Test/development override for Gemini CLI's skill directory. An empty override is invalid.                                                                                          |
| `AXM_INSTALL_GITHUB_REPO`      | internal          | GitHub `owner/repo`; `agentxm/axm`                               | Test/development override for install and upgrade release discovery.                                                                                                               |
| `AXM_UPGRADE_GITHUB_API_URL`   | internal          | URL; `https://api.github.com`                                    | Test/development override for the upgrade GitHub API endpoint.                                                                                                                     |
| `AXM_TELEMETRY_BASE_URL`       | internal          | URL; AXM telemetry service                                       | Test/development override for the telemetry endpoint.                                                                                                                              |
| `AXM_TELEMETRY_ENABLE_IN_TEST` | internal          | `true` enables; disabled under Vitest otherwise                  | Allows telemetry transport during tests. It has no supported external automation contract.                                                                                         |

## Where to go next

- `axm help settings` — durable workspace state and recognized settings keys
- `axm help machine-output` — JSON and NDJSON output contracts
- `axm help upgrade` — explicit upgrade selection and execution
- `axm whoami` — inspect current authentication without printing a token
