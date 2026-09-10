# @agentxm/extension-materialization

The AXM extension materialization capability: the per-extension-type manager
contract and its seven implementations, canonical package staging with
interrupted-swap recovery, registry-backed package materialization, and the
install, uninstall, materialize, and authored-package closure recipes that
compose them into plan steps.

Managers keep their requirements explicit in `R`; a manager's materialization
facts travel forward as return values rather than through captured state.
`./live` composes the environment-backed manager layers and registers them as
`workspace-projection` participants; `./testing` carries in-memory managers for
feature tests. The surface is unsupported and may change in any release.
Ordinary users should use the [`axm` CLI](https://axm.sh) instead.

Part of the [AgentXM](https://agentxm.ai) toolchain.
