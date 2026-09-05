# @agentxm/registry-protocol

The AgentXM Registry wire contracts and the contract-level publication
validation rules that the AXM client and the Registry implementation must
interpret identically: request and response schemas, publication and
deprecation views, suggested-action error vocabulary, extension content
parsing, and publish lint rules.

Every export lives under an explicit `./unstable/*` subpath: the surface is
unsupported and may change in any release. Ordinary users should use the
[`axm` CLI](https://axm.sh) instead.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
