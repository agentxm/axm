# @agentxm/registry-protocol

The AXM client's typed representation of the public AgentXM Registry HTTP
contract: extension index and version entry schemas
(`./unstable/registry/schema`), discovery responses
(`./unstable/registry/discover-schema`), publication-set preview and
validation (`./unstable/registry/publication-set`), publish visibility
(`./unstable/publish`), and the shared suggested-action and
human-handoff error vocabulary (`./unstable/suggested-action`,
`./unstable/human-handoff`).

## Batch resolution metadata

`./unstable/registry/resolution-metadata` defines the versioned contract for a
repeat-safe `POST /v1/resolutions/metadata` query. The Registry owns the HTTP
route and authorization; AXM keeps version selection, release-age policy, and
dependency graph decisions. A request groups up to 100 items in one trusted
Registry and credential context. Each item has a unique caller key, extension
identity, and a `select` or `restore-exact` purpose. Exact restoration supplies
the accepted version and integrity. The caller may also supply an expected
publisher binding, a known representation revision, or a continuation bound to
the previous revision.

The response has exactly one outcome per submitted key in request order:

| Outcome            | Meaning                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metadata`         | An authorized page of version descriptors, dependency and package compatibility data, lifecycle information, and an opaque revision. A `null` continuation means the candidate list is complete. |
| `unchanged`        | Current authorization and lifecycle still admit a matching complete representation already held by the client. A client without that representation repeats the item without `knownRevision`.    |
| `unavailable`      | The identity is absent or inaccessible; the response deliberately does not distinguish those cases.                                                                                              |
| `binding-conflict` | An authorized identity no longer has the expected publisher binding.                                                                                                                             |
| `exact-conflict`   | An authorized exact version or integrity no longer matches the accepted identity.                                                                                                                |
| `restart-required` | A continued page crossed a representation revision; discard the earlier pages and restart.                                                                                                       |

A metadata page contains at most 100 versions. Clients must follow every
continuation and check the revision and result keys before selecting a version;
truncated pages are never complete selection input. Continuation tokens are
opaque and must be bound by the Registry to the request identity, credential
context, and revision. A changed binding, hold, visibility, yank, archival or
deprecation fact must invalidate an `unchanged` result. Backend failures are
envelope errors, never invented per-item absence. The query is private and
non-cacheable across commands; its POST method does not make publish mutations
retryable.

The schema exports the item, version-page, request-body, and response-body
limits. A server checks encoded body size before decoding and returns the
declared `request-too-large` error when exceeded. Request keys correlate results
only; they confer no identity or access.

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
manifest validation live in `@agentxm/extension-content`; version selection
and release-age policy live in `@agentxm/workspace/resolution`.

This package is bundled into `axm.sh`; it is not an independently published
API. Its `./unstable/*` subpaths are workspace-internal boundaries. Ordinary
users should use the [`axm` CLI](https://axm.sh) instead.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
