---
status: active
last-reviewed: 2026-05-20
version: 0.2.0
description: How AXM grades agent support for each extension capability — three
  orthogonal axes (standards compliance, convention, lifecycle) applied
  per-capability. Read before adding a new agent, adding a capability kind, or
  changing a capability claim.
depends-on: []
---

# Agent Capability Model

How AXM describes what a coding agent can do and how strongly its native
behavior commits to industry standards. Use this guide when adding a new agent
to the catalog, adding a capability kind, or deciding the grade of an existing
entry.

## Key Resources

- [Agent Skills](https://agentskills.io) — Skill spec
- [AGENTS.md](https://agents.md) — Instruction file spec
- [Model Context Protocol](https://modelcontextprotocol.io) — MCP spec
- [`schema.ts`](../../packages/core/src/unstable/agent-capabilities/schema.ts) — Source of truth for capability and axis types
- [`standards.ts`](../../packages/core/src/unstable/agent-capabilities/standards.ts) — Named spec registry referenced by spec-tracked capabilities
- [`data/agents/`](../../packages/core/src/unstable/agent-capabilities/data/agents/) — One typed TypeScript module per agent
- [`catalog.ts`](../../packages/core/src/unstable/agent-capabilities/catalog.ts) — Id-keyed catalog assembly and derived catalog exports

---

## Quick Example

Claude Code's capability claims show every axis in use:

```typescript
skills:
  standardsCompliance: "full" // SKILL.md shape per spec
  convention: "vendor" // but at .claude/skills, not .agents/skills
  scopes: ["user", "project"]
  directory: ".claude/skills"

instructions:
  standardsCompliance: "parity" // CLAUDE.md is behaviorally equivalent
  convention: "vendor" // different filename
  scopes: ["user", "project"]
  files: ["CLAUDE.md"]
  kind: "own-file"

mcp:
  standardsCompliance: "full"
  convention: "universal" // standard `mcpServers` key
  scopes: ["user", "project"]
  transports: ["stdio", "http", "sse"]
  # config: {...}

subagents:
  scopes: ["user", "project"]
  directory: ".claude/agents"
  # no standardsCompliance / convention — no industry spec exists

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
- **Lifecycle** — state of AXM's integration with the capability (available,
  planned, unsupported, unknown). All capabilities.

AXM derives extension compatibility from these axes: an agent supports an
extension type when the matching capability has `lifecycle: available` and —
for spec-tracked kinds — `standardsCompliance` better than `none` (see
`capabilityWorks` in `derive.ts`).

### Capability kinds

| Kind           | Backing extension | Industry spec                          | Spec-tracked? |
| -------------- | ----------------- | -------------------------------------- | :-----------: |
| `skills`       | `skill`           | [Agent Skills](https://agentskills.io) |      yes      |
| `instructions` | `file`            | [AGENTS.md](https://agents.md)         |      yes      |
| `mcp`          | `mcp-server`      | [MCP](https://modelcontextprotocol.io) |      yes      |
| `commands`     | `command`         | —                                      |      no       |
| `subagents`    | `subagent`        | —                                      |      no       |
| `rules`        | `rule`            | —                                      |      no       |
| `permissions`  | —                 | — (vendor-defined by nature)           |      no       |

Spec-tracked capabilities carry `standardsCompliance` and `convention`. Non-spec
capabilities omit both — the schema enforces this structurally so the
distinction can't be authored wrong.

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
| `available`   | Implemented and verified                                      |  yes¹  |
| `planned`     | AXM intends to support this but does not yet                  |   no   |
| `unsupported` | Authoritative source confirms the agent lacks this capability |   no   |
| `unknown`     | Not verified                                                  |   no   |

¹ Spec-tracked capabilities additionally require `standardsCompliance` better
than `none`.

Any active claim (`available` or `planned`) must cite at least one `sources[]`
URL and an ISO `lastVerified` date. Inactive claims (`unsupported` or
`unknown`) omit active-only fields.

---

## Decision rules

### Spec-tracked capability (`skills`, `instructions`, `mcp`)

1. **Grade compliance.** Compare the agent's native format to the spec.
   - Exact match → `full`
   - Behaviorally equivalent, trivial rename or frontmatter delta → `parity`
   - Subset or divergent semantics → `partial`
   - Doesn't implement the spec at all → `none`
2. **Grade convention.** Compare the agent's location to the spec or
   community-standard one.
   - Match → `universal`
   - Differs → `vendor`
3. **Set lifecycle.** Use `available`, `planned`, `unsupported`, or `unknown`
   explicitly.

Add a `notes` field for any `parity` or `partial` claim explaining the
divergence.

### Non-spec capability (`commands`, `subagents`, `rules`, `permissions`)

1. **Set lifecycle.** `available` when the agent has a working native shape;
   `unsupported` when an authoritative source confirms absence.
2. Omit `standardsCompliance` and `convention` — the schema rejects them on
   these kinds.

---

## Worked Examples

**Antigravity** — universal across the board ([source](../../packages/core/src/unstable/agent-capabilities/data/agents/antigravity.ts))

| Kind           | compliance | convention  | lifecycle   | Why                                             |
| -------------- | ---------- | ----------- | ----------- | ----------------------------------------------- |
| `skills`       | `full`     | `universal` | `available` | `.agents/skills/` — the community-standard path |
| `instructions` | `full`     | `universal` | `available` | `AGENTS.md`                                     |
| `mcp`          | `full`     | `universal` | `available` | Standard `mcpServers` key                       |
| `commands`     | —          | —           | `available` | No industry spec                                |

**Claude Code** — spec-compliant formats at vendor locations ([source](../../packages/core/src/unstable/agent-capabilities/data/agents/claude-code.ts))

| Kind           | compliance | convention  | lifecycle   | Why                                                                       |
| -------------- | ---------- | ----------- | ----------- | ------------------------------------------------------------------------- |
| `skills`       | `full`     | `vendor`    | `available` | Spec-format `SKILL.md` at `.claude/skills/`                               |
| `instructions` | `parity`   | `vendor`    | `available` | `CLAUDE.md` is behaviorally equivalent to `AGENTS.md`; different filename |
| `mcp`          | `full`     | `universal` | `available` | Standard `mcpServers` key in `.mcp.json`                                  |
| `commands`     | —          | —           | `available` | No industry spec                                                          |
| `subagents`    | —          | —           | `available` | No industry spec                                                          |
| `permissions`  | —          | —           | `available` | Vendor-defined by nature                                                  |

**OpenCode** ([source](../../packages/core/src/unstable/agent-capabilities/data/agents/opencode.ts))

| Kind        | compliance | convention | lifecycle   | Why                                             |
| ----------- | ---------- | ---------- | ----------- | ----------------------------------------------- |
| `skills`    | `full`     | `vendor`   | `available` | Spec-format SKILL.md at `.opencode/skills/`     |
| `mcp`       | `full`     | `vendor`   | `available` | `mcp` key in `opencode.jsonc`; not `mcpServers` |
| `commands`  | —          | —          | `available` | No industry spec                                |
| `subagents` | —          | —          | `available` | No industry spec                                |

---

## Maintenance

When you add or change a capability claim:

- update the agent's TypeScript module in `data/agents/`
- set `sources` and `lastVerified` together for active claims
- for spec-tracked kinds, set both `standardsCompliance` and `convention`
- for non-spec active kinds, omit both — the type system rejects them
- add a `notes` field for any `parity` or `partial` compliance claim explaining the divergence
- keep all eight capability slots explicit

When you propose a new capability kind:

- add the schema in `schema.ts`
- add a `STANDARDS` entry only if a real industry spec exists; otherwise the kind is non-spec and omits both axes
- update this guide's capability-kinds table

---

## See Also

- [Documentation Guidelines](./documentation-guidelines.md) — writing rules for guides
- [Guide Authoring](./guide-authoring.md) — when a topic warrants its own guide
