# Upgrade AXM

`axm upgrade` selects the highest published stable `cli-v<semver>` release,
then compares it with the running AXM version before deciding whether any
installer may mutate the installation.

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

## Homebrew convergence

For a Homebrew-managed installation, the GitHub-selected target stays fixed for
the invocation. AXM explicitly refreshes Homebrew metadata and requires
`agentxm/tap/axm` to advertise that exact version before mutation. A temporarily
older formula is retried for up to 90 seconds; a newer formula stops the command
without silently installing a different release.

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

## JSON result

`axm upgrade --json` emits one document. Important result fields are:

| Field                         | Meaning                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resultStatus`                | `upgraded`, `reinstalled`, `already-up-to-date`, `local-newer`, `downgrade-refused`, `upgrade-incomplete`, `upgrade-unverified`, `manual-action-required`, or `rolled-back` |
| `localVersion`                | Observed version before the command, or `null`                                                                                                                              |
| `targetVersion`               | Selected stable release; fatal selection failures use the `ok: false` error envelope                                                                                        |
| `reportedVersion`             | Version actually observed afterward, or `null`                                                                                                                              |
| `installMethod`               | `script`, `homebrew`, `npm`, `pnpm`, `yarn`, or `unknown`                                                                                                                   |
| `verification`                | `verified`, `unchanged`, `mismatch`, `unavailable`, or `not-attempted`                                                                                                      |
| `mutationState`               | `not-attempted`, `unchanged`, `updated`, `rolled-back`, or `unknown`                                                                                                        |
| `executedCommands`            | Structured detection, preparation, delegation, verification, and rollback commands, including whether each did not start, exited, or timed out                              |
| `verificationExecutables`     | Requested and resolved executable identities, phases, query outcomes, and reported versions                                                                                 |
| `homebrewFailure`             | Stable Homebrew terminal reason on a Homebrew-specific incomplete result                                                                                                    |
| `observedFormulaVersion`      | Refreshed Homebrew formula version when observed                                                                                                                            |
| `recommendedCommand`          | A safe next command AXM did not execute, or `null`                                                                                                                          |
| `axmSkillCompatibilityTarget` | The selected CLI/official-skill target pair plus the local verification command and bundled recovery preview/apply commands                                                 |

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
