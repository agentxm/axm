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

| Field                | Meaning                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resultStatus`       | `upgraded`, `reinstalled`, `already-up-to-date`, `local-newer`, `downgrade-refused`, `upgrade-incomplete`, `upgrade-unverified`, `manual-action-required`, or `rolled-back` |
| `localVersion`       | Observed version before the command, or `null`                                                                                                                              |
| `targetVersion`      | Selected stable release; fatal selection failures use the `ok: false` error envelope                                                                                        |
| `reportedVersion`    | Version actually observed afterward, or `null`                                                                                                                              |
| `installMethod`      | `script`, `homebrew`, `npm`, `pnpm`, `yarn`, or `unknown`                                                                                                                   |
| `verification`       | `verified`, `unchanged`, `mismatch`, `unavailable`, or `not-attempted`                                                                                                      |
| `mutationState`      | `not-attempted`, `unchanged`, `updated`, `rolled-back`, or `unknown`                                                                                                        |
| `executedCommands`   | Structured detection, preparation, delegation, verification, and rollback commands AXM actually ran                                                                         |
| `recommendedCommand` | A safe next command AXM did not execute, or `null`                                                                                                                          |

Operational attention outcomes carry a failed or blocked plan step, report
`ok: false`, and exit 1. Release lookup, network, validation, and unexpected
transaction failures use the normal `ok: false` error envelope and canonical
exit codes documented by `axm help exit-codes`.
