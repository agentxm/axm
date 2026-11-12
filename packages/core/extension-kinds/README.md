# @agentxm/extension-kinds

The private AXM extension kinds. Each kind owns its manager, install and
uninstall plans, and typed failures over the
[`@agentxm/workspace-kernel`](../workspace-kernel/README.md) ports: skills,
subagents, MCP connections, hooks, instructions, Knowledge, and packs.

Consumers import one kind through `./skills`, `./subagents`,
`./mcp-connections`, `./hooks`, `./instructions`, `./knowledge`, or `./packs`.
`./live` composes the seven manager Layers. MCP authentication remains owned
by the native host. No kind imports another kind, and no kind imports a workspace
feature.

Subagent materialization carries the final validated snapshot's compiled outputs
through native apply. Compatible consumers of one physical file share its write
and projection row. The native writer checks every planned alias and current
file under its lock before applying those bytes; unchanged generations preserve
hand edits. External-source preflight and staged-content validation remain
separate safety boundaries.

This package is unsupported and may change in any release. Ordinary users
should use the [`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
