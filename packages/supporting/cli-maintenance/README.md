# @agentxm/cli-maintenance

Owns policies that keep the running AXM CLI and its official skill compatible.
This is a supporting capability: the policy serves CLI operation and must not
become a rule for unrelated skills or shared extension version selection.

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
roles within this package. Byte acquisition and workspace inspection supply the
facts; they do not own compatibility decisions.

Unstable and unsupported — use the [axm.sh](https://axm.sh) CLI.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
