# @agentxm/workspace-state

The AXM workspace-state kernel: workspace settings and lockfile authority,
the workspace read model, desired-state and canonical-observation vocabulary,
extension paths and layout, and the `WorkspaceMutations` service contract.

The package root is the public API; deterministic in-memory test layers live
behind `./testing`. The surface is unsupported and may change in any release.
Ordinary users should use the [`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
