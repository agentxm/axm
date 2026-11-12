# @agentxm/workspace-features

The private AXM workspace features: the use cases the `axm` CLI exposes over
the [`@agentxm/extension-kinds`](../extension-kinds/README.md) and
[`@agentxm/workspace-kernel`](../workspace-kernel/README.md) packages.

Each feature is published as its own entry point: `./lifecycle`,
`./authoring`, `./publishing`, `./configuration`, `./inspection`, `./linting`,
`./discovery`, `./sync`, `./knowledge-query`, and `./sharing`. No feature
imports another feature. Deterministic fixtures sit behind a feature's
`/testing` entry point where it has one, and `./knowledge-query/live` supplies
the Knowledge query Layer. Shared test support under `src/testing/` is not
exported.

Publishing carries the owned validated archive from preparation through
normalization and upload. Apply still rebuilds current source and rechecks its
selection policy before the first upload; unchanged source permits uploading
the original prepared bytes. Inspection uses the same normalized typed manifest
for published Hook details.

This package is unsupported and may change in any release. Ordinary users
should use the [`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
