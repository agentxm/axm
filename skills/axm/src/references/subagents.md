# Subagent implementations

Resolve the authored package before changing a subagent and read `axm help
subagents` for its current contract. Keep portable instructions in `core` and
runtime-specific behavior in `implementations.<catalog-id>`. A `customized`
implementation uses its core with native configuration and optional appended or
replacement instructions. A `native` implementation is a complete definition;
its native identity and bytes remain independent of the package identity.
Never use `agentOverrides` or create a role Skill as a subagent fallback.

Preview a selected runtime with `axm subagents show <name> --render <agent-id>`;
this is read-only even for an unconfigured runtime. Inspect unsupported outcomes
as well as rendered content. Mixed support may apply compatible native targets;
zero compatible configured targets refuses enabled installation or activation.
Do not invent shared model, tool, permission, or sandbox defaults across hosts.

For native import, specify `--source-agent` when location does not unambiguously
identify the runtime. Use `--preview` to inspect the proposed package and native
destinations. Import defaults to disabled and may fill an empty slot in an
existing authored package while preserving its core, version, other slots,
activation, and source bytes. Occupied slots and ownership conflicts are
refusals. Fork an acquired package before customizing it.
