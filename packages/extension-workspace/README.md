# @agentxm/extension-workspace

The AXM extension-workspace kernel: the coding-agent service contracts and
sync helpers, the per-extension-type lifecycle manager contract, managed-file
projection and marker grammar, per-type semantic vocabulary (discovery,
rendering, errors), the extension-type catalog and parity tables, and the
TOML/YAML codec wrappers.

The package root is the public API; the environment-backed coding-agent
repository layer lives behind `./live`. The surface is unsupported and may
change in any release. Ordinary users should use the
[`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
