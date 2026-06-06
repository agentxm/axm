# Agent Capability Catalog

Community-editable source of truth for agent extension capability discovery.

Owner: AgentXM Marketplace maintainers.

Add one `*.ts` file per agent. File name must match `id`, and each module
exports `<camelCaseId>Agent` as `as const satisfies Agent`.

Each capability is authored with `native` and `axm` top-level blocks:

- `native`: vendor-sourced facts, edited on the vendor/docs cadence
- `axm`: AXM integration state and writer mechanics, edited on the AXM release
  cadence

Hook capabilities also carry `canonical`, AXM's vendor-neutral projection:
canonical event IDs, invocation mechanism families, matcher kinds, and decision
capabilities derived from the native event map.

Capability claims with `axm.support: "supported"` or `"planned"` require:

- `native.sources` with authoritative URLs
- `axm.lastVerified` in `YYYY-MM-DD`

Every agent declares every capability slot. Each capability has three authored
native axes:

- `native.availability`: whether the surface is native, absent, or available through a
  descriptive plugin descriptor
- `native.vendorStatus`: whether the named surface is active, maintenance,
  deprecated, or removed
- `axm.support`: whether AXM installs or has verified support for the capability

Writer mechanics live under `axm.writer`:

- MCP config dialects use `axm.writer.config`
- Hook writers use `axm.writer.serializer`, `configFiles`, `settingsKey`,
  `eventMap`, and `matcherKind`
- Permission grants use `axm.writer.grants`
- Capabilities without AXM writer mechanics use `axm.writer: null`

Use an inactive AXM support entry for unsupported or unknown AXM behavior:

```ts
{
  native: {
    availability: { via: "none" },
    vendorStatus: { state: "active" },
    notes: null,
    docs: [],
    sources: [],
  },
  axm: {
    support: "unsupported",
    writer: null,
  },
}
```

Unsupported native surfaces may include `axm.reason` to explain why AXM cannot
write that surface yet.

All values are explicit. Do not rely on optional fields or schema defaults.

## Agent lifecycle

Every agent declares a `lifecycle` describing the support status of the product
itself. This is the agent-level axis and is distinct from a capability's
`native.availability`, `native.vendorStatus`, and `axm.support` axes.

A current agent is simply:

```ts
lifecycle: { state: "active" },
```

A `deprecated` (still usable, discouraged) or `retired` (discontinued / EOL)
agent spells out every field. Use `supersededBy` to point at the agent that
replaced it (a catalog `id`), or `null` when there is no successor:

```ts
lifecycle: {
  state: "retired",
  since: "2025-11-01",        // YYYY-MM-DD, or null if unknown
  note: "Merged into Cursor.", // user-facing reason, or null
  supersededBy: "cursor",      // catalog id of the replacement, or null
},
```

`supersededBy` must reference a known, non-self agent and must not form a cycle;
the catalog invariant test enforces this.

Spec-tracked capabilities (`skills`, `instructions`, `mcp`) also require:

- `standardsCompliance`: `full`, `parity`, `partial`, or `none`
- `convention`: `universal` or `vendor`

Non-spec active capabilities (`commands`, `subagents`, `rules`, `permissions`)
omit those spec axes.

## Plugin-backed availability

Use `availability: { via: "plugin", provider, plugin }` only when a specific
agent-vendor plugin provides the surface. The plugin descriptor is descriptive:
AXM may display `homepage`, `installHint`, `packageRef`, or future detection
markers, but it does not install, resolve, upgrade, or treat the plugin as an
AXM registry artifact.

For deprecated or removed surfaces, set `vendorStatus.state` accordingly and
use `supersededByType` to point at the replacing leaf extension type when there
is one, for example `command` superseded by `skill`.

Permissions capability:

- Describes how an agent grants tool execution and filesystem access without
  per-call prompts. Used by `axm agents add` to suggest concrete config edits.
- `native.mechanism` lists every surface that can be used (any of `config-file`,
  `cli-flag`, `ui-only`).
- `native.configFiles` enumerates writable config files by `scope` and
  `format`.
- `axm.writer.grants` keys (`shell`, `filesystem`, …) hold either a JSON-ish
  `patch` or a raw `template`. Both may interpolate `${tool}` and
  `${workspaceRoot}`.
- `prerequisites` capture modes/gates (folder trust, Auto-Run, sandbox mode)
  that must be set before allow rules take effect.
