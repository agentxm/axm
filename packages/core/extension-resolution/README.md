# @agentxm/extension-resolution

Extension resolution policy for the AXM client: the minimum-release-age policy
(`parseMinimumReleaseAge`, `isVersionEntryEligibleAt`, `releaseAgeEvidence`,
exemption and holdback records), version selection under that policy
(`resolveVersionEntryWithReleaseAge`, `resolveVersionEntryForReleaseAge`), and
named Registry target decisions (`decideNamedRegistryVersion`,
`namedRegistryCandidates`). Root export only.

Dependency budget: `@agentxm/extension-model` and `@agentxm/registry-protocol`.
It never depends on workspace state or any integration.

## Provider contract

`@agentxm/extension-sources` (an integration) fetches the Registry index, maps
entries to refs, and probes archives, but it may not import this core package.
It therefore declares a `RegistryResolutionPolicy` port whose decision
vocabulary (`NamedRegistryVersionDecision`, `NamedRegistryCandidate`) lives in
`@agentxm/extension-model/unstable/sources/source-host-provider`. This
package's functions implement that port structurally, and the application
composition root (`apps/cli/src/cli-runtime/registry-resolution-policy-live.ts`)
binds them. Selection semantics that the Registry itself defines
(`selectVersion`, `resolveVersionEntry`: yanked handling and range maxima)
stay in `@agentxm/registry-protocol/unstable/registry/version-selection`, which
both the client integration and this package consume.

Unstable and unsupported — use the [axm.sh](https://axm.sh) CLI.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
