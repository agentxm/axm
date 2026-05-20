# Agent Capability Catalog

Community-editable source of truth for agent extension capability discovery.

Owner: AgentXM Marketplace maintainers.

Add one `*.yaml` file per agent. File name must match `id`.

Capability claims require:

- `sources` with authoritative URLs
- `lastVerified` in `YYYY-MM-DD`

Use `unknown` by omitting a capability. Use `unsupported` only when an
authoritative source verifies lack of support.

All capabilities have `lifecycle`, defaulting to `available`.

Spec-tracked capabilities (`skills`, `instructions`, `mcp`) also require:

- `standardsCompliance`: `full`, `parity`, `partial`, or `none`
- `convention`: `universal` or `vendor`

Non-spec capabilities (`commands`, `subagents`, `rules`, `permissions`) omit
those spec axes.

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
