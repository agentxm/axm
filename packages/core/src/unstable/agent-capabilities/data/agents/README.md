# Agent Capability Catalog

Community-editable source of truth for agent extension capability discovery.

Owner: AgentXM Marketplace maintainers.

Add one `*.yaml` file per agent. File name must match `id`.

Capability claims require:

- `support`
- `sources` with authoritative URLs
- `lastVerified` in `YYYY-MM-DD`

Use `unknown` by omitting a capability. Use `unsupported` only when an
authoritative source verifies lack of support.

Instructions invariant:

- `support: standard` means `files` includes `AGENTS.md`
- `support: bridged` means `files` omits `AGENTS.md`
