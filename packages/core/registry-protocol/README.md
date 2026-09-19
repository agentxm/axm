# @agentxm/registry-protocol

The AXM client's typed representation of the public AgentXM Registry HTTP
contract: extension index and version entry schemas
(`./unstable/registry/schema`), discovery responses
(`./unstable/registry/discover-schema`), publication-set preview and
validation (`./unstable/registry/publication-set`), publish visibility
(`./unstable/publish`), and the shared suggested-action and
human-handoff error vocabulary (`./unstable/suggested-action`,
`./unstable/human-handoff`).

The byte-vendorable
`./unstable/registry/publication-set.vectors.json` export pins digest
conformance examples for independent implementations of the public protocol.
Its metadata describes the canonicalization and optional-field rules; changing
the digest algorithm requires a new contract identifier and vector format
rather than editing the meaning of existing vectors.

Content parsing, Knowledge inspection, the lint catalog, and archive and
manifest validation live in `@agentxm/extension-content`; version selection
and release-age policy live in `@agentxm/workspace/resolution`.

This package is bundled into `axm.sh`; it is not an independently published
API. Its `./unstable/*` subpaths are workspace-internal boundaries. Ordinary
users should use the [`axm` CLI](https://axm.sh) instead.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
