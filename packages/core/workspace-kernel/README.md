# @agentxm/workspace-kernel

The private AXM workspace kernel. It owns the mechanics every extension kind
and workspace feature builds on: transaction settlement, the operations
contract, native coding-agent adapters, workspace state, projection, source
acquisition, sources, resolution, planning, the materialization ports and
manager registry, and reconciliation.

Each slice is published as its own entry point, from lowest to highest:
`./settlement`, `./operations`, `./agent-adapters`, `./workspace-state`,
`./projection`, `./acquisition`, `./sources`, `./resolution`, `./planning`,
`./materialization`, and `./reconciliation`. A slice imports only the slices
below it, and the kernel never imports an extension kind or a workspace
feature. Environment-backed layers and deterministic test ports sit behind a
slice's `/live` and `/testing` entry points where it has them.

This package is unsupported and may change in any release. Ordinary users
should use the [`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
