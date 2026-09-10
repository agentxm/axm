# @agentxm/workspace-projection

The AXM workspace projection capability: the ownership-unit registry, projection
planning and its participant registry, managed-file ownership grammar and
provenance banners, managed-region reconciliation, instruction targets, workspace
invariant facts, and the read-side reconciliation facts (MCP drift, hook agent
outcomes, Knowledge discovery and instruction entries, agent-output observation)
that lint, sync, and inspection consume without re-deriving them.

The package root is the public API; the coding-agent repository layer, the
participant-free invariant-facts layer, and the native-write authority that lets
`@agentxm/agent-integration` write under the enclosing workspace transaction live
behind `./live`. Deterministic ports for feature tests live behind `./testing`.
The surface is unsupported and may change in any release. Ordinary users should
use the [`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
