# @agentxm/registry-protocol

The AgentXM Registry wire contracts that the AXM client and the Registry
implementation must interpret identically: extension index and version entry
schemas (`./unstable/registry/schema`), discovery responses
(`./unstable/registry/discover-schema`), publication-set preview and
validation (`./unstable/registry/publication-set`), publish visibility
(`./unstable/publish`), publish authorization
(`./unstable/publish-authorization`), and the shared suggested-action and
human-handoff error vocabulary (`./unstable/suggested-action`,
`./unstable/human-handoff`).

Content parsing, Knowledge inspection, the lint catalog, and archive and
manifest validation live in `@agentxm/extension-content`; version selection
and release-age policy live in `@agentxm/extension-resolution`.

Every export lives under an explicit `./unstable/*` subpath: the surface is
unsupported and may change in any release. Ordinary users should use the
[`axm` CLI](https://axm.sh) instead.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
