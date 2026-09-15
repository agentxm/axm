# @agentxm/workspace

The private AXM workspace compiler. Its child entry points own desired and
observed state, resolution, projection, kind-specific acquisition and
materialization, reconciliation, transition planning, and transaction
settlement.

Consumers import the narrow child capability they use: `./desired-state`,
`./resolution`, `./projection`, `./materialization`, `./reconciliation`,
`./transitions/planning`, or `./transitions/settlement`. Environment-backed
layers and deterministic test ports remain behind each capability's `./live`
and `./testing` entry points. This package is unsupported and may change in any
release. Ordinary users should use the [`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
