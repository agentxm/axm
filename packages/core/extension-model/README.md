# @agentxm/extension-model

The shared AgentXM extension model: extension identities, handles, fully
qualified names, extension types, manifests, version constraints, package
identities, and the coding-agent capability catalog.

This package is the cross-repository shared kernel between the public AXM
client and the AgentXM platform. Every export lives under an explicit
`./unstable/*` subpath: the surface is unsupported and may change in any
release. Ordinary users should use the [`axm` CLI](https://axm.sh) instead.

## VERS Parser Reference

`VersRangeSchema` currently targets `package-url/vers-spec` commit
`ee7d8b44f22f1517c75f7229b57b79374c8d34e5`.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
