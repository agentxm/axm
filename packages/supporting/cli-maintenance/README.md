# @agentxm/cli-maintenance

Owns policies for maintaining the running AXM CLI. CLI maintenance is
strategically supporting even when its outcomes are directly requested by a
user. Its policies must not become rules for unrelated extensions.

The `self-update` frontstage capability owns installation facts, supported
platforms, version comparison, equal-version reinstall, downgrade refusal, and
eligibility for an automatic upgrade. These decisions are published through
`./self-update/domain` and depend only on explicit facts.

`./self-update/application` selects exact or promoted stable releases, validates
the requested target, and compares release facts with the installed version.
It owns the `CliReleaseCatalog` contract and typed upgrade failures. The
`./self-update/adapters/releases` implementation reads the public stable channel
and derives immutable GitHub coordinates; `./self-update/composition` connects
it to the caller's HTTP client. Substitute catalogs exercise selection policy
without HTTP, installation state, or a CLI. Installation probes, mutation,
progress reporting, and assessment rendering remain in `@agentxm/cli-update`
pending their application/adapter separation.

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
