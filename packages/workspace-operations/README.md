# @agentxm/workspace-operations

The AXM workspace-operations kernel: plan vocabulary and execution, operation
resolutions and journals, plan readiness and reconciliation gating, and the
workspace transaction and transition-lock machinery.

The package root is the public API; the composed workspace layer lives behind
`./live`, and deterministic in-memory test layers behind `./testing`. The
surface is unsupported and may change in any release. Ordinary users should
use the [`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
