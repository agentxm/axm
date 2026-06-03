# Agent Capability Catalog

Community-editable source of truth for agent extension capability discovery.

Owner: AgentXM Marketplace maintainers.

Add one `*.ts` file per agent. File name must match `id`, and each module
exports `<camelCaseId>Agent` as `as const satisfies Agent`.

Capability claims require:

- `sources` with authoritative URLs
- `lastVerified` in `YYYY-MM-DD`

Every agent declares every capability slot. Use an inactive capability for
unsupported or unknown support:

```ts
{ lifecycle: "unsupported", notes: null, docs: [], sources: [] }
```

All values are explicit. Do not rely on optional fields or schema defaults.

Spec-tracked capabilities (`skills`, `instructions`, `mcp`) also require:

- `standardsCompliance`: `full`, `parity`, `partial`, or `none`
- `convention`: `universal` or `vendor`

Non-spec active capabilities (`commands`, `subagents`, `rules`, `permissions`)
omit those spec axes.

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
