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

Support levels:

- `standard` — the agent natively conforms to an industry spec standard for the
  capability. Only `skills` has such a standard today (the Agent Skills
  `SKILL.md` format), so only `skills` can be `standard`.
- `bridged` — the capability works through an AXM adapter that maps it to the
  agent's native format. This is the ceiling for capabilities with no industry
  spec standard yet, such as `subagents` and `commands`: even when an agent
  supports them natively, the catalog records `bridged` rather than `standard`.
- `planned` — AXM support is intended but not yet available.

Instructions invariant:

- `support: standard` means `files` includes `AGENTS.md`
- `support: bridged` means `files` omits `AGENTS.md`

Permissions capability:

- Describes how an agent grants tool execution and filesystem access without
  per-call prompts. Used by `axm agents add` to suggest concrete config edits.
- `mechanism` lists every surface that can be used (any of `config-file`,
  `cli-flag`, `ui-only`).
- `configFiles` enumerates writable config files by `scope` and `format`.
- `grants` keys (`shell`, `filesystem`, …) hold either a JSON-ish `patch` or a
  raw `template`. Both may interpolate `${tool}` and `${workspaceRoot}`.
- `prerequisites` capture modes/gates (folder trust, Auto-Run, sandbox mode)
  that must be set before allow rules take effect.
