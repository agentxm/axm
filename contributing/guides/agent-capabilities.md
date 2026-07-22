---
status: active
last-reviewed: 2026-07-22
version: 0.2.1
description: How AXM grades agent support for each extension capability using
  standards compliance, convention, availability, vendor status, and AXM support
  axes. Read before adding a new agent, adding a leaf extension capability key, or
  changing a capability claim.
depends-on: []
---

# Agent Capability Model

How AXM describes what a coding agent can do and how strongly its native
behavior commits to industry standards. Use this guide when adding a new agent
to the catalog, adding a leaf extension capability key, or deciding the grade of an existing
entry.

## Key Resources

- [Agent Skills](https://agentskills.io) — Skill spec
- [AGENTS.md](https://agents.md) — Instruction file spec
- [Model Context Protocol](https://modelcontextprotocol.io) — MCP spec
- [`schema.ts`](../../packages/core/src/unstable/agent-capabilities/schema.ts) — Source of truth for per-agent capability and axis types
- [`extension-types/`](../../packages/core/src/unstable/extension-types/) — Agent-agnostic extension type catalog and standards registry
- [`data/agents/`](../../packages/core/src/unstable/agent-capabilities/data/agents/) — One typed TypeScript module per agent
- [`catalog.ts`](../../packages/core/src/unstable/agent-capabilities/catalog.ts) — Id-keyed catalog assembly and derived catalog exports

---

## Quick Example

Claude Code's capability claims show every axis in use:

```typescript
capabilities: {
  skill: {
    native: {
      availability: { via: "native" }
      vendorStatus: { state: "active" }
      standardsCompliance: "full" // SKILL.md shape per spec
      convention: "vendor" // but at .claude/skills, not .agents/skills
      scopes: ["user", "project"]
      directory: ".claude/skills"
      sources: ["https://docs.claude.com/..."]
    }
    axm: {
      status: "supported"
      lastVerified: "2026-05-16"
      writer: null
    }
  }

  rule: {
    native: {
      standardsCompliance: "parity" // CLAUDE.md is behaviorally equivalent
      convention: "vendor" // different filename
      availability: { via: "native" }
      vendorStatus: { state: "active" }
      scopes: ["user", "project"]
      files: ["CLAUDE.md"]
      kind: "own-file"
    }
    axm: { status: "supported", lastVerified: "2026-05-16", writer: null }
  }

  files: {
    native: {
      availability: { via: "none" }
      vendorStatus: { state: "active" }
    }
    axm: { status: "unsupported", lastVerified: null, writer: null }
  }

  "mcp-server": {
    native: {
      availability: { via: "native" }
      vendorStatus: { state: "active" }
      standardsCompliance: "full"
      convention: "universal" // standard `mcpServers` key
      scopes: ["user", "project"]
      transports: ["stdio", "http", "sse"]
      sources: ["https://docs.claude.com/..."]
    }
    axm: {
      status: "supported"
      lastVerified: "2026-05-16"
      writer: { config: {...} } // verified AXM writer dialect
    }
  }

  subagent: {
    native: {
      availability: { via: "native" }
      vendorStatus: { state: "active" }
      scopes: ["user", "project"]
      directory: ".claude/agents"
      sources: ["https://docs.claude.com/..."]
      // no standardsCompliance / convention — no industry spec exists
    }
    axm: { status: "supported", lastVerified: "2026-05-16", writer: null }
  }
}

permissions:
  native: {
    availability: { via: "native" }
    vendorStatus: { state: "active" }
    scopes: ["user", "project"]
    mechanism: ["config-file"]
    sources: ["https://docs.claude.com/..."]
    // no standardsCompliance / convention — permissions are vendor-defined
  }
  axm: { status: "supported", lastVerified: "2026-05-16", writer: { grants: {...} } }
```

---

## Model

An **agent** declares zero or more **capabilities**. Each capability is graded
along orthogonal axes:

- **Native block** — vendor-sourced facts under `native`, including the
  axes below plus capability-specific fields and provenance.
- **Canonical vocabulary** — hook capabilities store canonical IDs beside
  native event and tool names. AXM derives the vendor-neutral projection from
  those native mappings rather than storing a separate per-agent block.
- **Standards compliance** — how well the agent's native format matches an
  industry spec. Spec-tracked capabilities only.
- **Convention** — whether the agent's location/filename/path matches the
  spec-defined or community-standard one. Spec-tracked capabilities only.
- **Availability** — whether the surface exists natively, is absent, or is
  available through an agent-vendor plugin. All capabilities.
- **Vendor status** — whether that native or plugin surface is active,
  maintenance, deprecated, or removed. All capabilities.
- **AXM block** — AXM's own integration state under `axm`, including `status`,
  last verification date, optional writer mechanics, and optional AXM-owned
  rationale.
- **AXM status/writer** — whether AXM installs or has verified support for the
  capability (`supported`, `planned`, `unsupported`, `unknown`) and whether
  `axm.writer` carries verified write mechanics. All capabilities.

AXM derives extension compatibility from AXM status/writer state and
availability: an agent
supports a leaf extension type when
`isCapabilitySupported` sees either `axm.status === "supported"` or an
`axm.writer`, and native availability is not `none`. `agentCapabilityStatus`
derives the agent-facing status (`native`, `native-deprecated`, `plugin`,
`plugin-deprecated`, `none`) from native availability and vendor status.
`axmIntegrationStatus` returns `writer` when writer metadata exists, otherwise
the AXM status (`supported`, `planned`, `unsupported`, `unknown`).
`standardsCompliance` remains format-fidelity metadata. `axm.writer.config`
means AXM has a verified file-backed writer dialect for that agent, not that the
agent is fully compliant with the MCP spec.

### Leaf extension capability keys

| Capability key | Backing extension | Industry spec                          | Spec-tracked? |
| -------------- | ----------------- | -------------------------------------- | :-----------: |
| `skill`        | `skill`           | [Agent Skills](https://agentskills.io) |      yes      |
| `mcp-server`   | `mcp-server`      | [MCP](https://modelcontextprotocol.io) |      yes      |
| `rule`         | `rule`            | [AGENTS.md](https://agents.md)         |      yes      |
| `files`        | `files`           | —                                      |      no       |
| `command`      | `command`         | —                                      |      no       |
| `subagent`     | `subagent`        | —                                      |      no       |
| `hook`         | `hook`            | —                                      |      no       |
| `permissions`  | —                 | — (vendor-defined by nature)           |      no       |

Spec-tracked status is derived from
`extension-types/EXTENSION_TYPES_BY_ID[type].standard !== null`. Spec-tracked
capabilities carry `standardsCompliance` and `convention`. Non-spec capabilities
omit both — the schema enforces this structurally so the distinction can't be
authored wrong.

`rule` and `files` both deal in Markdown. The distinction is who reads the file
and why: `rule` is behavior-governing instruction content read every turn, while
`files` is context material an agent may reference without treating it as
governing instructions.

---

## Axes

### Standards compliance _(spec-tracked capabilities only)_

| Value     | Meaning                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| `full`    | Native format conforms to the spec; no AXM translation                                                              |
| `parity`  | Behaviorally equivalent to the spec and trivially adapter-convertible (rename, minor frontmatter); no semantic loss |
| `partial` | Subset of the spec, or semantic divergence the adapter must reconcile                                               |
| `none`    | Agent does not implement the spec format at all                                                                     |

`parity` is the narrow case: a spec-compliant tool reading the file after a
mechanical rename would behave identically. `CLAUDE.md` ↔ `AGENTS.md` qualifies.
A different rule grammar or different lifecycle semantics drops to `partial`.
Use `partial` whenever conversion must infer, discard, or synthesize semantic
content; use `parity` only when a deterministic, lossless mechanical adapter is
enough. A vendor-specific directory alone never makes an otherwise identical
format `parity` or `partial` because location is graded separately.

### Convention _(spec-tracked capabilities only)_

Scope of "convention" is **location, filename, and path** — not file format.
Format is graded by `standardsCompliance`.

| Value       | Meaning                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `universal` | Agent uses the spec-defined or community-standard location (e.g. `.agents/skills/`, `AGENTS.md`, `mcpServers` key) |
| `vendor`    | Agent uses a vendor-specific location (e.g. `.claude/skills/`, `CLAUDE.md`, `opencode.jsonc`)                      |

An unchanged `SKILL.md` stored under a vendor directory such as
`.claude/skills/` is `standardsCompliance: "full"` with
`convention: "vendor"`. The identical file under the standard
`.agents/skills/` location is `full` with `convention: "universal"`.

### Availability _(all capabilities)_

| Value    | Meaning                                                                 |
| -------- | ----------------------------------------------------------------------- |
| `native` | The agent provides the surface itself                                   |
| `none`   | No path to this capability is known                                     |
| `plugin` | A specific agent-vendor plugin provides the surface outside AXM control |

Plugin descriptors are descriptive only. AXM may show their homepage,
installation hint, package reference, or future detection markers, but it does
not install, resolve, upgrade, or treat those plugins as registry artifacts.

### Vendor Status _(all capabilities)_

| Value         | Meaning                                            |
| ------------- | -------------------------------------------------- |
| `active`      | The named native or plugin surface is current      |
| `maintenance` | The surface is usable but not strategically active |
| `deprecated`  | The surface still works but is discouraged         |
| `removed`     | The surface is no longer available                 |

Inactive vendor statuses carry `since`, `note`, and `supersededByType`.
`supersededByType` points to a leaf extension type such as `skill`; it is
distinct from agent-level `supersededBy`, which points to another agent.

For plugin-backed availability, `vendorStatus` describes the plugin's surface,
not the agent core's lack of native support.

### AXM Status _(all capabilities)_

| Value         | Meaning                                          | Works? |
| ------------- | ------------------------------------------------ | :----: |
| `supported`   | Implemented and verified                         |  yes   |
| `planned`     | AXM intends to support this but does not yet     |   no   |
| `unsupported` | AXM does not manage or serialize this capability |   no   |
| `unknown`     | Not verified                                     |   no   |

Any active AXM claim (`supported` or `planned`) must cite at least one
`native.sources[]` URL and an ISO `axm.lastVerified` date. Inactive AXM claims
(`unsupported` or `unknown`) set `axm.lastVerified: null`. `unsupported` can
still combine with `native.availability.via: "plugin"` when AXM does not manage
the surface but a plugin path is known.
Inactive AXM claims may carry `axm.reason`, especially when a native hook system
exists but AXM has no writer for its invocation family.

### Hook canonical model

Hook capabilities use all three namespaces:

- `native`: vendor facts, including native event names, invocation mechanism
  families, config files, matcher syntax, decision contract, sources, and
  per-event `lastVerified`.
- `canonical`: AXM's normalized vocabulary, using event IDs such as `tool.pre`,
  `tool.post`, `prompt.submit`, and `session.start`, plus mechanism families,
  matcher kinds, and decision capabilities. Coverage is derived from native
  mappings.
- `axm`: status, `lastVerified`, and the optional parameterized writer.

Each native hook event maps to one canonical event:

```typescript
{
  nativeName: "PreToolUse",
  canonical: "tool.pre",
  matcher: { kind: "regex", example: "Write|Edit", notes: null },
  decision: [
    { kind: "observe" },
    { kind: "block", outcomes: ["allow", "deny", "ask"] },
  ],
  sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
  lastVerified: "2026-06-02",
}
```

Do not collapse “native hooks exist but AXM cannot serialize them” to
`native.availability.via: "none"`. Use native availability with the mechanism
family and event mappings, then set `axm.status: "unsupported"`,
`axm.lastVerified: null`, and a reason.

### Derived Statuses _(never authored)_

`agentCapabilityStatus(capability)` returns one of:

- `native` — native + active
- `native-deprecated` — native + maintenance/deprecated/removed
- `plugin` — plugin + active
- `plugin-deprecated` — plugin + maintenance/deprecated/removed
- `none` — no known native availability

`axmIntegrationStatus(capability)` independently returns `writer`, `supported`,
`planned`, `unsupported`, or `unknown`.

---

## Decision rules

### Spec-tracked capability (`skill`, `mcp-server`, `rule`)

1. **Grade compliance.** Compare the agent's native format to the spec.
   - Exact match → `full`
   - Behaviorally equivalent, trivial rename or frontmatter delta → `parity`
   - Subset or divergent semantics → `partial`
   - Doesn't implement the spec at all → `none`
2. **Grade convention.** Compare the agent's location to the spec or
   community-standard one.
   - Match → `universal`
   - Differs → `vendor`
3. **Set availability.** Use `native`, `none`, or a descriptive plugin
   descriptor.
4. **Set vendor status.** Use `active` unless the native or plugin surface is
   maintenance-only, deprecated, or removed.
5. **Set AXM status.** Use `supported`, `planned`, `unsupported`, or `unknown`
   explicitly.

Add a `notes` field for any `parity` or `partial` claim explaining the
divergence.

### Non-spec capability (`command`, `subagent`, `files`, `hook`, `permissions`)

1. **Set availability.** Use `native` for a built-in surface, `plugin` for a
   specific agent-vendor plugin, or `none` when no path is known.
2. **Set vendor status.** Mark deprecated or removed vendor surfaces with
   `supersededByType` when a replacement extension type exists.
3. **Set AXM status.** `supported` when AXM installs or has verified the
   native surface; `unsupported` when AXM does not manage it.
4. Omit `standardsCompliance` and `convention` — the schema rejects them on
   these kinds.
5. For `hook`, map native events and tools to canonical IDs and ensure each
   native event's `canonical` pointer resolves to the shared hook event
   registry.

---

## Worked Examples

**Antigravity** — universal across the board ([source](../../packages/core/src/unstable/agent-capabilities/data/agents/antigravity.ts))

| Kind         | compliance | convention  | availability | axm.status    | Why                                             |
| ------------ | ---------- | ----------- | ------------ | ------------- | ----------------------------------------------- |
| `skill`      | `full`     | `universal` | `native`     | `supported`   | `.agents/skills/` — the community-standard path |
| `rule`       | `full`     | `universal` | `native`     | `supported`   | `AGENTS.md` plus `.agents/rules`                |
| `files`      | —          | —           | `none`       | `unsupported` | No verified standalone context-file convention  |
| `mcp-server` | `full`     | `universal` | `native`     | `supported`   | Standard `mcpServers` key                       |
| `command`    | —          | —           | `native`     | `supported`   | No industry spec                                |

**Claude Code** — spec-compliant formats at vendor locations ([source](../../packages/core/src/unstable/agent-capabilities/data/agents/claude-code.ts))

| Kind          | compliance | convention  | availability | axm.status    | Why                                                                       |
| ------------- | ---------- | ----------- | ------------ | ------------- | ------------------------------------------------------------------------- |
| `skill`       | `full`     | `vendor`    | `native`     | `supported`   | Spec-format `SKILL.md` at `.claude/skills/`                               |
| `rule`        | `parity`   | `vendor`    | `native`     | `supported`   | `CLAUDE.md` is behaviorally equivalent to `AGENTS.md`; different filename |
| `files`       | —          | —           | `none`       | `unsupported` | No verified standalone context-file convention                            |
| `mcp-server`  | `full`     | `universal` | `native`     | `supported`   | Standard `mcpServers` key in `.mcp.json`                                  |
| `command`     | —          | —           | `native`     | `supported`   | No industry spec                                                          |
| `subagent`    | —          | —           | `native`     | `supported`   | No industry spec                                                          |
| `permissions` | —          | —           | `native`     | `supported`   | Vendor-defined by nature                                                  |

**OpenCode** ([source](../../packages/core/src/unstable/agent-capabilities/data/agents/opencode.ts))

| Kind         | compliance | convention | availability | axm.status  | Why                                             |
| ------------ | ---------- | ---------- | ------------ | ----------- | ----------------------------------------------- |
| `skill`      | `full`     | `vendor`   | `native`     | `supported` | Spec-format SKILL.md at `.opencode/skills/`     |
| `mcp-server` | `full`     | `vendor`   | `native`     | `supported` | `mcp` key in `opencode.jsonc`; not `mcpServers` |
| `command`    | —          | —          | `native`     | `supported` | No industry spec                                |
| `subagent`   | —          | —          | `native`     | `supported` | No industry spec                                |

---

## Maintenance

When you add or change a capability claim:

- update the agent's TypeScript module in `data/agents/`
- set `native.sources` and `axm.lastVerified` together for
  `axm.status: "supported"` or `"planned"` claims
- set `native.availability`, `native.vendorStatus`, and `axm.status`
  explicitly
- for plugin-backed availability, include a descriptive plugin descriptor and
  remember AXM does not manage that plugin
- for spec-tracked kinds, set both `standardsCompliance` and `convention`
- for non-spec active kinds, omit both — the type system rejects them
- add a `notes` field for any `parity` or `partial` compliance claim explaining the divergence
- keep all eight capability slots explicit

When you propose a new leaf extension capability key:

- add the schema in `schema.ts`
- add an `extension-types/` catalog entry and `STANDARDS` entry only if a real industry spec exists; otherwise the kind is non-spec and omits both axes
- update this guide's leaf-extension-capability-keys table

---

## See Also

- [Documentation Guidelines](./documentation-guidelines.md) — writing rules for guides
- [Guide Authoring](./guide-authoring.md) — when a topic warrants its own guide
