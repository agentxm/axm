# @agentxm/extension-resolution

Extension resolution policy for the AXM client: what a configured or requested
extension resolves to, and whether that resolution may be accepted.

- **Minimum release age** — `parseMinimumReleaseAge`,
  `isVersionEntryEligibleAt`, `releaseAgeEvidence`, exemption and holdback
  records, and the operator's per-invocation `ReleaseAgePosture`.
- **Version selection under that policy** — `resolveVersionEntryWithReleaseAge`,
  `resolveVersionEntryForReleaseAge`, and the named Registry target decisions
  `decideNamedRegistryVersion` and `namedRegistryCandidates`.
- **Configured-entry resolution** — `resolveConfiguredSkill` and its six
  siblings, `resolveConfiguredRegistryEntry`, and the
  `ResolvedConfiguredEntry` vocabulary the lockfile and plans carry.
- **Pack dependency resolution** — `resolvePackDependencies`,
  `resolvePackDependenciesWithReleaseAge`, the resolved-dependency map schema,
  and `acceptedPackDependencyResolver` for deterministic recovery.
- **Source authority** — `evaluateSourceAuthority`: whether a requested source
  may replace the configured one for the same target.
- **Publisher-binding trust** — `classifyPublisherBindingTransition` and the
  proposal vocabulary. Shaping the resulting plan risk condition belongs to
  the feature that owns the plan, not here.
- **Official AXM skill inspection** — `evaluateAxmSkillCandidate` and
  `readAxmSkillWorkspaceCompatibility` currently obtain candidate facts and
  invoke the compatibility policy owned by `@agentxm/cli-maintenance`.

Exports `.` and `./live`.

Dependency budget: `@agentxm/extension-model`, `@agentxm/registry-protocol`,
`@agentxm/extension-content`, `@agentxm/extension-sources`, and
`@agentxm/workspace-state`, and the published official-skill APIs of
`@agentxm/cli-maintenance`. Deciding what a configured entry resolves to needs
workspace facts and source acquisition, so this package sits **above**
`@agentxm/workspace-state`: state must never depend on it.

## Provider contract

`@agentxm/extension-sources` (an integration) fetches the Registry index, maps
entries to refs, and probes archives, but it may not import this core package.
It therefore declares ports whose vocabulary lives in
`@agentxm/extension-model/unstable/sources/source-host-provider`:

- `RegistryResolutionPolicy` — implemented structurally by this package's
  decision functions and bound by the application composition root
  (`apps/cli/src/cli-runtime/registry-resolution-policy-live.ts`).
- `AxmSkillCandidateGate` — implemented by `AxmSkillCandidateGateLive` in this
  package's `./live`.
- `WorkspaceCatalog` — implemented by `@agentxm/workspace-projection`, which
  owns the agent-selection facts the catalog reports.

Shared release selection (`selectVersion`, `resolveVersionEntry`: exact
requests, yank handling, and range maxima) belongs to
`@agentxm/extension-model/unstable/version-constraints/version-selection`.
It consumes domain release facts and preserves the selected candidate. Registry
clients and this package use it without making wire schemas own the algorithm;
release-age and other client admission policies remain here.

Official-skill compatibility and recovery are owned by
[`@agentxm/cli-maintenance`](../../supporting/cli-maintenance/README.md), with
separate domain, application, and composition entry points. They are absent
from this package's public exports. Registry candidate probing and workspace
inspection still require a further acquisition/application separation; the
policy extraction does not make the current provider port design the target
architecture.

Unstable and unsupported — use the [axm.sh](https://axm.sh) CLI.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
