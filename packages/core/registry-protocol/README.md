# @agentxm/registry-protocol

The AXM client's typed representation of the public AgentXM Registry HTTP
contract: extension index and version entry schemas
(`./unstable/registry/schema`), discovery requests
(`./unstable/registry/discover-schema`), publication-set preview and
validation (`./unstable/registry/publication-set`), publish visibility
(`./unstable/publish`), and the shared suggested-action and
human-handoff error vocabulary (`./unstable/suggested-action`,
`./unstable/human-handoff`).

## Batch resolution

`./unstable/registry/resolutions` defines schema version 2 of the repeat-safe
`POST /v1/resolutions` query. Each batch has one purpose, `select` or
`authorize-exact`, and up to 100 uniquely keyed items in one Registry and
credential context. Requests are limited to 256 KiB and responses to 1 MiB.
Results match caller keys independently of response order. Missing, duplicate,
or unsolicited keys invalidate the response; keys confer no identity or access.

Selection contracts live in `./unstable/registry/resolution-metadata`. AXM owns
version selection, release-age policy, and dependency graph decisions. The
Registry supplies authorized metadata, publisher binding, lifecycle facts, and
revision-bound continuation. A page contains at most 100 versions; clients must
collect every page of one revision before selecting. The selection outcomes are
`metadata`, `unchanged`, `unavailable`, `binding-conflict`, and
`restart-required`. An `unchanged` result requires the caller to already hold
the complete matching representation. Selection evidence never grants content
access.

Exact-content requests supply the extension identity, expected publisher
binding, accepted version, and integrity. An `allowed` outcome echoes those
facts and reports whether the version is yanked. Other outcomes are
`unavailable`, `binding-conflict`, `exact-conflict`, `lifecycle-blocked`, and
`temporarily-unavailable`. An allowance has an observation time, but no lease,
continuation, conditional revision, or version history. It is current evidence
for the submitted content only. The Registry applies its content-access policy;
AXM checks every echoed fact before using the allowance.

Both purposes require a complete HTTP 200 response. Responses are private and
non-cacheable across commands. Backend failures must remain failures rather
than invented absence. This query's repeat safety does not make publication
mutations retryable.

The exported `./unstable/registry/resolution-metadata.vectors.json` records
selection examples for ordinary and exact yanks, release age, direct and pack
constraints, package compatibility, and publisher-binding changes. Producer and
consumer tests can use the same cases without moving selection to the server.

The byte-vendorable
`./unstable/registry/publication-set.vectors.json` export pins digest
conformance examples for independent implementations of the public protocol.
Its metadata describes the canonicalization and optional-field rules; changing
the digest algorithm requires a new contract identifier and vector format
rather than editing the meaning of existing vectors.

Content parsing, Knowledge inspection, the lint catalog, and archive and
manifest validation live in `@agentxm/extension-content`; release selection
lives in `@agentxm/extension-model`, and release-age policy lives in
`@agentxm/workspace-kernel/resolution`.

This package is published with each `axm.sh` release, at the same version as
the CLI that bundles it. Every export lives under an explicit `./unstable/*`
subpath: the surface is unsupported and may change in any release. Ordinary
users should use the [`axm` CLI](https://axm.sh) instead.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
