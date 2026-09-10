# Upgrade AXM

`axm upgrade` selects the release named by the public stable channel, then
compares it with the running AXM version before deciding whether its owning
installer may mutate the installation. `axm upgrade <version>` selects an exact
stable version without changing the channel.

## Version behavior

- An older or unknown local version upgrades only through a supported detected
  installer.
- An equal version is unchanged unless `--reinstall` requests a reinstall.
- A newer local version is never downgraded. With `--reinstall`, AXM refuses the
  downgrade and exits 1.
- Unknown or conflicting install ownership requires manual action; AXM does not
  substitute npm or run a recovery installer automatically.

Supported owners are the AXM installer, Homebrew, npm, pnpm, and Yarn Classic
1.x. Modern Yarn releases do not provide the required global-install command
and therefore require manual action.

## Installer availability

The selected target stays fixed for the invocation. npm, pnpm, and Yarn check
that exact published package version, even when their latest tag is newer.
Yarn Classic checks the published version inventory because its single-version
field can echo an unpublished requested version.

For Homebrew, AXM prepares the tap when needed, refreshes metadata once, and
queries `agentxm/tap/axm` once. An exact formula match permits mutation. An
older formula stops immediately with both versions and guidance to retry after
publication. A newer formula stops with guidance to reconcile the mismatch;
AXM cannot use the formula to select an arbitrary historical version.

Preparation failures, timeouts, and malformed queries are indeterminate.
Affirmative absence is unavailable. Both leave the installation untouched and
preserve command evidence. Each command has its own timeout; there is no
publication polling or shared publication deadline.

Before and after mutation, AXM records the version reported by Homebrew's stable
`bin/axm` entrypoint and by a fresh PATH resolution. Both must report the exact
target for success. If an exit-0 `brew upgrade` leaves Homebrew's entrypoint on
its known older version, AXM attempts one `brew reinstall` recovery and verifies
both identities again. It never loops or recommends an upgrade or reinstall
that already proved ineffective.

## Transaction safety

Direct AXM-installer upgrades acquire a per-executable lock, download the
platform binary and `SHA256SUMS`, validate SHA-256, execute the temporary
binary, retain a restorable backup, atomically replace the installed path,
verify the exact target version, persist install metadata, and only then remove
the backup. A failed post-replacement check restores and verifies the original.

Public installers accept an exact version:

```sh
curl -fsSL https://axm.sh/install.sh | AXM_INSTALL_VERSION=0.23.0 sh
```

```powershell
$env:AXM_INSTALL_VERSION='0.23.0'; irm https://axm.sh/install.ps1 | iex
```

## Preview

`axm upgrade --preview` resolves the installation owner and the target release
and reports what it would do, then stops. It runs no installer command, writes
no install metadata, and does not refresh the update-check cache. Its
disposition is `previewed`, and `details.messages` names the exact command the
installer would be handed — or, for a script installation, the executable that
would be replaced and the binary that would replace it.

Publication readiness is not established by a preview: a package manager or tap
that has not yet published the selected version is discovered by the run that
would use it, not by the preview.

## Progress

`axm upgrade` publishes what it is doing while it runs. The step performing the
upgrade names the target version and the detected installer; each command handed
to that installer appears beneath it as it runs. An unavailable Homebrew formula
ends the request after the single check. The script installation path reports
downloaded bytes.

At default verbosity the settled output names the detected install method, each
delegated command, and the executable that was verified with the version it
reported. `--verbose` adds the full command-by-command audit trail. When a
delegated command fails, the tail of its output is shown at default verbosity,
because the failure message directs the reader to it.

## JSON result

`axm upgrade --json` emits one `axm.upgrade-assessment/v1` document under
`result`. Important fields are:

| Field                   | Meaning                                                                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outcome`               | `previewed`, `applied`, `no-op`, `failed`, or `indeterminate`                                                                                                                                                                                                                |
| `disposition`           | `previewed`, `upgraded`, `reinstalled`, `already-current`, `local-newer`, `downgrade-refused`, `installer-lagging`, `installer-leading`, `installer-unavailable`, `installer-indeterminate`, `mutation-failed`, `verification-failed`, `rolled-back`, or `recovery-required` |
| `intent`                | Requested mode, exact version when one was requested, and whether a reinstall was asked for                                                                                                                                                                                  |
| `local`                 | Observed version before the command and its relation to the target                                                                                                                                                                                                           |
| `ownership`             | Detected `method` (`script`, `homebrew`, `npm`, `pnpm`, `yarn`, `unknown`), detection source, evidence, confidence, and executable path                                                                                                                                      |
| `canonical`             | Selected release source, version, channel revision, and validation time                                                                                                                                                                                                      |
| `installerAvailability` | `ready`, `lagging`, `leading`, `unavailable`, `indeterminate`, or `not-required`, with the version the installer advertises                                                                                                                                                  |
| `target`                | Selected version, release tag, and artifact URLs                                                                                                                                                                                                                             |
| `mutation`              | `not-attempted`, `unchanged`, `updated`, `rolled-back`, or `unknown`                                                                                                                                                                                                         |
| `verification`          | State, the version observed afterward, and the requested and resolved executable identities with their phases and query outcomes                                                                                                                                             |
| `recovery`              | Recoverable backup path and a safe next command AXM did not execute, or `null`                                                                                                                                                                                               |
| `commands`              | Structured detection, preparation, delegation, verification, and rollback commands, including whether each did not start, exited, or timed out                                                                                                                               |
| `details`               | Supporting messages, the stable Homebrew terminal reason when one applies, and the refreshed formula version when observed                                                                                                                                                   |

## CLI and official-skill convergence

An executable upgrade and a workspace skill update are separate mutation
boundaries; AXM does not describe them as one atomic transaction. After an
upgrade reports success, run `axm lint`. This local check is read-only and
network-free, including in agent, CI, JSON, non-interactive, and non-TTY use.
`AXM_NO_UPDATE_CHECK` disables remote update checks only; it never hides the
local compatibility result.

In JSON output, `axm lint --json` reports the shared fact under
`result.axmSkillCompatibility`. It includes the running CLI version, installed
official-skill version, declared range, source, status, reason code, and a
`recovery` object. Follow `recovery.steps` in order and re-run `axm lint` after
each executable or workspace boundary:

- `upgrade-cli`: run `axm upgrade`, then `axm lint`.
- `update-registry-skill`: preview with
  `axm skills update --name axm --preview`, apply with
  `axm skills update --name axm`, then run `axm lint`. If Registry resolution
  reports that no compatible release is eligible, follow its bundled recovery
  command instead.
- `install-bundled-skill`: preview with
  `axm skills install @agentxm/skills/axm --bundled --preview`, apply without
  `--preview`, then run `axm lint`. This path uses bytes embedded in the running
  executable and does not require Registry access.
- `preserve-authored-skill`: do not run bundled recovery. Keep the authored
  workspace source, align its manifest and compatibility metadata to the
  reported target pair through the normal authoring workflow, then run
  `axm lint`.

Declining, previewing, interrupting, or failing a workspace recovery leaves the
committed workspace unchanged. Bundled recovery also refuses to overwrite a
workspace-authored official skill, even with `--force`.

Operational attention outcomes carry a failed or blocked plan step, report
`ok: false`, and exit 1. Release lookup, network, validation, and unexpected
transaction failures use the normal `ok: false` error envelope and canonical
exit codes documented by `axm help exit-codes`.

## Where to go next

- `axm upgrade --help` — command arguments, flags, and examples
- `axm help exit-codes` — canonical failure classes and process exit codes
