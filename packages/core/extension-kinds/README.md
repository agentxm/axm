# @agentxm/extension-kinds

The private AXM extension kinds. Each kind owns its manager, install and
uninstall plans, and typed failures over the
[`@agentxm/workspace-kernel`](../workspace-kernel/README.md) ports: skills,
subagents, MCP connections, hooks, instructions, Knowledge, and packs.

Consumers import one kind through `./skills`, `./subagents`,
`./mcp-connections`, `./hooks`, `./instructions`, `./knowledge`, or `./packs`.
`./live` composes the seven manager Layers and the keychain-backed MCP secret
store. No kind imports another kind, and no kind imports a workspace feature.

This package is unsupported and may change in any release. Ordinary users
should use the [`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
