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

Capability claims with `axm.status: "supported"` or `"planned"` require:

- `native.sources` with authoritative URLs
- an honest AXM status; an execution claim also requires attributable `axm.verification`

Every agent declares every capability slot. Each capability has three authored
native axes:

- `native.availability`: whether the surface is native, absent, unknown, or available through a
  descriptive plugin descriptor
- `native.vendorStatus`: whether the named surface is active, maintenance,
  deprecated, or removed
- `axm.status`: whether AXM implements delivery for the capability; evidence is separate

## Research and verification maintenance

This README is the maintenance entry point. Marketplace maintainers triage
vendor release notes and documentation changes weekly, review high-churn
products monthly, and review the full inventory quarterly. Ownership changes,
renames, new delivery surfaces, deprecation notices, changed file formats and
approval behavior trigger an earlier review. Follow each record's official
sources; a homepage check does not recertify its capability claims.

Keep three clocks separate:

- `profile.review` records the scope and limitations of a product/source census.
- `native.review` records only the capability claims actually checked against
  primary sources, with `claimScope`, conditions and limitations.
- `axm.verification` records an exercised boundary (`configuration` or
  `vendor-runtime`), date, evidence references and limitations. Projection tests
  do not prove execution by a vendor. `axm.lastVerified` is a historical date
  whose method was not recorded; do not renew it from document research.

`capabilityVerificationAgeReport` exposes source review age and execution age
independently, plus the historical date. Missing or expired evidence is visible;
a newer profile review never resets a capability clock. All capability slots have a 90-day reporting budget. The existing catalog
test gates overdue recorded Skill reviews at 90 days. Run the owning catalog
test and inspect the report during each refresh; investigate missing evidence
without inventing a verification date or requiring live vendor calls on every
pull request.

Use `availability.via: "unknown"` when evidence is missing or inconclusive.
`none` needs authoritative evidence of absence, reviewed just like a positive
claim. Native presence does not imply an AXM writer. Record a known feature
with an unmodeled grammar explicitly, and keep AXM unsupported until its output,
ownership and lifecycle semantics have evidence.

Preserve product IDs across evidenced renames. `profile.identity` separates
product, surface, edition, company/parent and model providers. Unknown ownership
or an unreviewed provider inventory remains null. `lifecycleQualifications`
scopes an edition or surface retirement without retiring an entire active
product. New products get separate IDs only when they have independent identity
and extension/runtime contracts, not merely a wrapper or a model name.

The versioned release reference is generated from this catalog. It exposes
native evidence, AXM evidence, and supported/manual/conditional/unsupported/
unknown delivery separately. Downstream products consume that release rather
than maintaining another capability inventory. A conditional result is not an
unconditional compatibility promise.

Native readers are declared in `native.locations`, independently of AXM write
support. Each location names its scope, root, relative path, artifact shape,
applicability, and provenance. Config locations also declare their file format
and, where relevant, the container `keyPath`. MCP and Hook entry semantics live
in `native.entryDialect`; `null` records an unverified dialect.

Writer mechanics live under `axm.writer`:

- MCP writers select native location IDs through `axm.writer.config.locationIds`
- Hook writers select `locationIds` and the native `eventMap`
- Permission grants use `axm.writer.grants`, each with an explicit `destination`
- Capabilities without AXM writer mechanics use `axm.writer: null`

A writer selects declared native locations. It does not establish which other
agents read the same physical file or whether that file is safe to change.

`axm.writer: null` means AXM has no parameterized filesystem writer. It does
not make a real hosted capability unavailable. Hosted-only agents declare an
`installTarget` with the accepted artifact shape, manual delivery mechanism,
exact user instructions, and primary documentation URL.

Use an inactive AXM status entry for unsupported or unknown AXM behavior:

```ts
{
  native: {
    availability: { via: "unknown" },
    vendorStatus: { state: "active" },
    notes: null,
    docs: [],
    sources: [],
  },
  axm: {
    status: "unsupported",
    lastVerified: null,
    writer: null,
  },
}
```

Unsupported native surfaces may include `axm.reason` to explain why AXM cannot
write that surface yet.

Availability, lifecycle, scopes and integration state are explicit. An omitted
review or verification means no evidence is recorded; never infer it from a
profile review, a default, or another capability.

## Agent lifecycle

Every agent declares a `lifecycle` describing the support status of the product
itself. This is the agent-level axis and is distinct from a capability's
`native.availability`, `native.vendorStatus`, and `axm.status` axes.

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
- `convention`: `universal`, `vendor`, or `hosted`

Use `hosted` only when a spec-compatible extension has no filesystem location
because the vendor accepts it through an upload or hosted directory. Format
fidelity remains a separate `standardsCompliance` judgment.

## Hosted agents

Use `chat` for conversational hosted applications and `hosted-agent` for
hosted task or workflow runtimes. An entry may declare both when the product
provides both surfaces.

A hosted-only entry must use:

- `rootDir: null`
- empty project and user detection markers
- `installTarget.kind: "hosted"`
- `installTarget.delivery` containing `upload`, `directory`, or both
- an artifact shape and exact post-validation installation instructions

Hosted entries belong in the capability catalog and its `AGENT_IDS`, but not in
`CONFIGURABLE_AGENTS_BY_ID` or `CONFIGURABLE_AGENT_IDS`. This keeps local
workspace scans and projections filesystem-only. `axm agents add` recognizes a
hosted ID and reports its manual delivery path rather than mutating settings.

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
- `native.locations` enumerates config readers by `scope`, `root`, path, and
  `format`, including readers AXM does not write.
- `axm.writer.grants` keys (`shell`, `filesystem`, …) hold either a JSON-ish
  `patch` or a raw `template`. Both may interpolate `${tool}` and
  `${workspaceRoot}`. The grant's `destination` selects a native location ID,
  an invocation flag, or the settings UI.
- `prerequisites` capture modes/gates (folder trust, Auto-Run, sandbox mode)
  that must be set before allow rules take effect.
