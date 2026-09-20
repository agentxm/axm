# @agentxm/cli-maintenance

Owns policies for maintaining the running AXM CLI. CLI maintenance is
strategically supporting even when its outcomes are directly requested by a
user. Its policies must not become rules for unrelated extensions.

The `self-update` frontstage capability owns installation facts, supported
platforms, version comparison, equal-version reinstall, downgrade refusal, and
eligibility for an automatic upgrade. These decisions are published through
`./self-update/domain` and depend only on explicit facts.

`./self-update/application` prepares the immutable upgrade candidate: it checks
platform eligibility, requires installation ownership before release selection,
and decides the action shared by preview and application. It owns the
`InstallationInspection` and `CliReleaseCatalog` contracts, the invocation
directory, command evidence, and typed upgrade failures. The
`./self-update/adapters/releases` implementation validates GitHub's latest-release
redirect and derives immutable GitHub coordinates; `./self-update/composition` connects
it to the caller's HTTP client. Substitute catalogs exercise selection policy
without HTTP, installation state, or a CLI. Native host implementations live
beside the application in `self-update/adapters/native`; their Layers are
selected through `./self-update/composition/native`. The CLI owns concrete
progress observation and cache-path selection in its composition.
The same application owns package and script upgrade execution: availability
checks, checksum and exact-version acceptance, backup and replacement order,
rollback verification, and recording only accepted installations. Native
adapters implement `PackageInstaller`, `ScriptReleaseAssets`,
`ScriptExecutableInstaller`, and `InstallationRecorder`.

`assessUpgrade` is a separate read-only query. It needs inspection, release
selection, the invocation directory, and `InstallerInstructions`; no mutation
or cache-write service is required. It returns a typed prospective command or
executable replacement. `./self-update/adapters/cli` supplies preview wording
and the assessment document. `applyUpgrade` accepts the prepared candidate
and uses the mutation contracts. Installer command and recovery grammar remain
behind `InstallerInstructions`, shared with the concrete native protocols.
`./self-update/adapters/native` exposes native service contracts and
`./self-update/testing/native` supplies controlled installation fixtures.
Native trials run without delivery observation; the CLI owns the experience
specifications and their operation-lifecycle fixture. Capability boundaries
remain enforced inside this package without a separate native-adapter package.

The same capability owns informational startup checks: suppression, cache
freshness, version eligibility, conditional refresh, and the decision that an
unavailable check cannot fail an explicit command. `UpdateCheckCache` and
`LatestReleaseCheck` are application contracts. The cache reports a validated
snapshot; the application evaluates it once and returns version facts. Its
optional refresh belongs to the invocation scope, with a three-second bound.
The HTTP adapter validates the release authority's response; filesystem storage
is supplied by the native cache adapter. The CLI reads environment and invocation
signals and formats human or agent notifications. These decisions can be
exercised without either adapter or a delivery interface.

The `official-skill` backstage capability has four published entry points:

- `./official-skill/domain` evaluates release metadata, bounded version ranges,
  compatibility, and the recovery outcome from explicit facts.
- `./official-skill/application` owns the injectable compatibility contract and
  its unavailable-policy failure.
- `./official-skill/composition` binds the running CLI version to that contract.
- `./official-skill/adapters/cli` renders the selected recovery action into CLI
  commands and the CLI's compatibility document. Domain results contain the
  action and version targets, independent of command grammar.

Domain and application code cannot import filesystem, provider, or delivery
mechanisms. Source descriptors in `tools/architecture/config.mjs` enforce these
roles within this package. The backstage compatibility capability cannot
import the frontstage self-update capability. Byte acquisition and workspace
inspection supply the facts; they do not own compatibility decisions.

Unstable and unsupported — use the [axm.sh](https://axm.sh) CLI.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
