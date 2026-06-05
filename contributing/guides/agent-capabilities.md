---
status: active
last-reviewed: 2026-06-03
version: 0.2.0
description: How AXM grades agent support for each extension capability — three
  orthogonal axes (standards compliance, convention, lifecycle) applied
  per-capability. Read before adding a new agent, adding a leaf extension capability key, or
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
    standardsCompliance: "full" // SKILL.md shape per spec
    convention: "vendor" // but at .claude/skills, not .agents/skills
    scopes: ["user", "project"]
    directory: ".claude/skills"
  }

  rule: {
    standardsCompliance: "parity" // CLAUDE.md is behaviorally equivalent
    convention: "vendor" // different filename
    scopes: ["user", "project"]
    files: ["CLAUDE.md"]
    kind: "own-file"
  }

  files: {
    lifecycle: "unsupported" // Context files have no agent-specific standard
  }

  "mcp-server": {
    standardsCompliance: "full"
    convention: "universal" // standard `mcpServers` key
    scopes: ["user", "project"]
    transports: ["stdio", "http", "sse"]
    config: {...} // optional; present only when AXM has a verified writer dialect
  }

  subagent: {
    scopes: ["user", "project"]
    directory: ".claude/agents"
    # no standardsCompliance / convention — no industry spec exists
  }
}

permissions:
  scopes: ["user", "project"]
  mechanism: ["config-file"]
  # no axes — permissions are vendor-defined by nature
```

---

## Model

An **agent** declares zero or more **capabilities**. Each capability is graded
along up to three orthogonal axes:

- **Standards compliance** — how well the agent's native format matches an
  industry spec. Spec-tracked capabilities only.
- **Convention** — whether the agent's location/filename/path matches the
  spec-defined or community-standard one. Spec-tracked capabilities only.
- **Lifecycle** — state of AXM's integration with the capability (supported,
  planned, unsupported, unknown). All capabilities.

AXM derives extension compatibility from lifecycle only: an agent supports a
leaf extension type when `agent.capabilities[type].lifecycle === "supported"`
(see `isCapabilitySupported` in `derive.ts`). `standardsCompliance` remains
format-fidelity metadata. MCP `config` is also orthogonal to
`standardsCompliance`: it means AXM has a verified file-backed writer dialect
for that agent, not that the agent is fully compliant with the MCP spec.

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

### Convention _(spec-tracked capabilities only)_

Scope of "convention" is **location, filename, and path** — not file format.
Format is graded by `standardsCompliance`.

| Value       | Meaning                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `universal` | Agent uses the spec-defined or community-standard location (e.g. `.agents/skills/`, `AGENTS.md`, `mcpServers` key) |
| `vendor`    | Agent uses a vendor-specific location (e.g. `.claude/skills/`, `CLAUDE.md`, `opencode.jsonc`)                      |

### Lifecycle _(all capabilities)_

| Value         | Meaning                                                       | Works? |
| ------------- | ------------------------------------------------------------- | :----: |
| `supported`   | Implemented and verified                                      |  yes   |
| `planned`     | AXM intends to support this but does not yet                  |   no   |
| `unsupported` | Authoritative source confirms the agent lacks this capability |   no   |
| `unknown`     | Not verified                                                  |   no   |

Any active claim (`supported` or `planned`) must cite at least one `sources[]`
URL and an ISO `lastVerified` date. Inactive claims (`unsupported` or
`unknown`) omit active-only fields.

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
3. **Set lifecycle.** Use `supported`, `planned`, `unsupported`, or `unknown`
   explicitly.

Add a `notes` field for any `parity` or `partial` claim explaining the
divergence.

### Non-spec capability (`command`, `subagent`, `files`, `hook`, `permissions`)

1. **Set lifecycle.** `supported` when the agent has a working native shape;
   `unsupported` when an authoritative source confirms absence.
2. Omit `standardsCompliance` and `convention` — the schema rejects them on
   these kinds.

---

## Worked Examples

**Antigravity** — universal across the board ([source](../../packages/core/src/unstable/agent-capabilities/data/agents/antigravity.ts))

| Kind         | compliance | convention  | lifecycle     | Why                                             |
| ------------ | ---------- | ----------- | ------------- | ----------------------------------------------- |
| `skill`      | `full`     | `universal` | `supported`   | `.agents/skills/` — the community-standard path |
| `rule`       | `full`     | `universal` | `supported`   | `AGENTS.md` plus `.agents/rules`                |
| `files`      | —          | —           | `unsupported` | No verified standalone context-file convention  |
| `mcp-server` | `full`     | `universal` | `supported`   | Standard `mcpServers` key                       |
| `command`    | —          | —           | `supported`   | No industry spec                                |

**Claude Code** — spec-compliant formats at vendor locations ([source](../../packages/core/src/unstable/agent-capabilities/data/agents/claude-code.ts))

| Kind          | compliance | convention  | lifecycle     | Why                                                                       |
| ------------- | ---------- | ----------- | ------------- | ------------------------------------------------------------------------- |
| `skill`       | `full`     | `vendor`    | `supported`   | Spec-format `SKILL.md` at `.claude/skills/`                               |
| `rule`        | `parity`   | `vendor`    | `supported`   | `CLAUDE.md` is behaviorally equivalent to `AGENTS.md`; different filename |
| `files`       | —          | —           | `unsupported` | No verified standalone context-file convention                            |
| `mcp-server`  | `full`     | `universal` | `supported`   | Standard `mcpServers` key in `.mcp.json`                                  |
| `command`     | —          | —           | `supported`   | No industry spec                                                          |
| `subagent`    | —          | —           | `supported`   | No industry spec                                                          |
| `permissions` | —          | —           | `supported`   | Vendor-defined by nature                                                  |

**OpenCode** ([source](../../packages/core/src/unstable/agent-capabilities/data/agents/opencode.ts))

| Kind         | compliance | convention | lifecycle   | Why                                             |
| ------------ | ---------- | ---------- | ----------- | ----------------------------------------------- |
| `skill`      | `full`     | `vendor`   | `supported` | Spec-format SKILL.md at `.opencode/skills/`     |
| `mcp-server` | `full`     | `vendor`   | `supported` | `mcp` key in `opencode.jsonc`; not `mcpServers` |
| `command`    | —          | —          | `supported` | No industry spec                                |
| `subagent`   | —          | —          | `supported` | No industry spec                                |

---

## Maintenance

When you add or change a capability claim:

- update the agent's TypeScript module in `data/agents/`
- set `sources` and `lastVerified` together for active claims
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
