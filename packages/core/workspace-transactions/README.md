# @agentxm/workspace-transactions

The AXM workspace transaction capability: the cross-process workspace
transition lock, the per-closure snapshot ledger with restoration and
verification, atomic single-file publication, and footprint observation. Every
workspace writer registers its target here before the first mutation, and
`workspace-operations` settles or rolls back each semantic closure through the
closure API this package exports for it alone.

The package root is the public API; deterministic in-memory admission and the
fault-injection hooks live behind `./testing`. The surface is unsupported and
may change in any release. Ordinary users should use the
[`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
