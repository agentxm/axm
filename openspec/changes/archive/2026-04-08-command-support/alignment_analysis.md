# Cross-Extension-Type Consistency Analysis

Comparison of command-support, subagent-support, and existing skills
implementation to identify inconsistencies in approach, accounting for inherent
differences between extension types.

## 1. Content file format — three different source-of-truth models

Each extension type takes a different approach to where behavioral configuration
lives:

| Aspect                     | Skills                                  | Commands                                        | Subagents                                       |
| -------------------------- | --------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Content file               | `SKILL.md`                              | `COMMAND.md`                                    | `SUBAGENT.md`                                   |
| Frontmatter                | Yes (name, description, user-invocable) | **None** (pure markdown)                        | Yes (model, toolAccess, overrides)              |
| Source of truth            | Manifest (`skill.json`)                 | Manifest (`command.json`)                       | **SUBAGENT.md frontmatter** (syncs TO manifest) |
| Behavioral fields location | N/A (skills are read as-is)             | Manifest (model, allowedTools, isolatedContext) | Content file frontmatter                        |

Commands put `model`, `allowedTools`, `isolatedContext` in the manifest.
Subagents put `model`, `toolAccess`, overrides in SUBAGENT.md frontmatter and
sync that TO the manifest. Both extension types have equivalent behavioral
config but locate it in opposite places.

a) **Align subagents to commands** — manifest is source of truth, SUBAGENT.md
is pure body (no frontmatter), consistent with commands approach
b) **Align commands to subagents** — COMMAND.md gets frontmatter for
behavioral fields, frontmatter is source of truth, manifest is derived
c) **Accept the divergence** — document the rationale (commands are
simpler/rarely edited after publish; subagents are authored iteratively and
benefit from editing behavioral fields alongside the system prompt)
d) **Hybrid: manifest is always source of truth** but content files MAY have
frontmatter as convenience that syncs FROM manifest (opposite of current
subagent direction)

**Decision: (b) — Content file is SOT for authoring; manifest is SOT for
packaging/distribution.** This aligns both commands and subagents to a single
model and matches the dominant industry practice (7 of 11 agents use
frontmatter in the command file for behavioral config).

The dividing line: "Is this about what the extension does, or about how it's
packaged and distributed?"

Content file frontmatter (SOT — authoring):

- `description`
- `model`
- `allowedTools` / `toolAccess`
- `isolatedContext`
- `arguments`

Manifest (SOT — packaging/distribution):

- `name`
- `version`
- `agents` (which agents to render for)
- `agentOverrides` (per-agent rendering tweaks)

The manifest may contain copies of frontmatter fields for registry/tooling use,
but they are derived from the content file during build/publish — never edited
directly in the manifest. This applies uniformly to commands and subagents.

---

## 2. Settings entry schema asymmetry

Currently in the settings schema (`packages/core/src/unstable/settings/schema.ts`):

| Extension   | Schema                | Entry format                     | Supports `enabled`? |
| ----------- | --------------------- | -------------------------------- | ------------------- |
| Skills      | `SkillsMapSchema`     | `string \| { source, enabled? }` | Yes                 |
| Commands    | `CommandsMapSchema`   | `string` (version specifier)     | **No**              |
| MCP Servers | `McpServersMapSchema` | `string` (version specifier)     | **No**              |
| Packs       | `PacksMapSchema`      | `string \| { source }`           | **No**              |

The command-support proposal specifies `axm commands enable/disable` and the
subagent-support proposal specifies `axm subagents enable/disable` — both need
an `enabled` field in settings. `CommandsMapSchema` and `McpServersMapSchema`
are both `Record(String, String)` and cannot represent this.

a) **Promote all extension types to the skills-style entry schema** — reuse
`SkillSettingsEntrySchema` (`string | { source, enabled? }`) for commands, subagents,
MCP servers
b) **Per-type entry schemas following a shared pattern** — each type defines
its own schema with `string | { source, enabled? }` as the common baseline,
free to add type-specific fields (e.g. MCP servers add `env`)
c) **Unified `ExtensionEntrySchema`** — one shared entry schema used by all
extension types

**Decision: (b) — Each extension type defines its own entry schema, aligned on
the `string | { source, enabled? }` baseline.** The common fields (`source`,
`enabled`) follow the same pattern across all types, but each type owns its
schema and can extend it with type-specific fields. MCP servers already need
`env` for environment variable persistence; other types may grow their own
fields over time. A single shared schema would either be too generic or
accumulate fields irrelevant to most types.

---

## 3. Lockfile `agents` array inconsistency

| Extension   | Lock entry base    | Has `agents` array?                             |
| ----------- | ------------------ | ----------------------------------------------- |
| Skills      | `CommonFields`     | Yes                                             |
| Commands    | `BaseCommonFields` | **No** (current code, `lockfile/schema.ts:179`) |
| MCP Servers | `BaseCommonFields` | **No**                                          |

The command-support design (decision 5) explicitly says: "Switch
`CommandLockEntry` from `BaseCommonFields` to `CommonFields` (adds `agents`
array)." The subagent-support proposal also needs `agents` in the lockfile.

Both commands and subagents render files per-agent and need to track which
agents received artifacts. Yet currently only skills track this.

a) **Add `agents` to all rendered extension types** (commands + subagents)
during implementation, as both designs already specify
b) **Add `agents` to ALL extension types** universally (including MCP
servers), for consistency even if not immediately needed
c) **Keep current state** — add `agents` only where the design says to

**Decision: (a) — Add `agents` to commands and subagents during
implementation.** Both designs already call for it. MCP servers stay on
`BaseCommonFields` until they need per-agent tracking.

---

## 4. Rendered file tracking divergence

Both commands and subagents render agent-native files from a portable source,
but only one proposes tracking them:

| Concern                           | Commands                    | Subagents                                                      |
| --------------------------------- | --------------------------- | -------------------------------------------------------------- |
| Renders per-agent files           | Yes                         | Yes                                                            |
| Lockfile tracks rendered files    | **No**                      | Yes (`renderedFiles` map with `path` + `contentHash`)          |
| Drift detection                   | **Not specified**           | Yes (content hash comparison)                                  |
| Conflict detection (manual files) | Name collision only         | Yes (manual file blocks render, `--force` overrides)           |
| Reconciliation spec depth         | Brief mention of `axm sync` | Full spec (drift, orphan cleanup, managed marker verification) |

Commands and subagents share the same fundamental integration pattern
(render-on-install), but the subagent proposal is significantly more mature in
tracking and reconciliation. If commands ship without rendered-file tracking,
drift and conflicts will be invisible.

a) **Align commands to match subagent rendered-file tracking** — add
`renderedFiles` + content hashes + drift detection to commands
b) **Defer for commands** — ship commands without tracking, add it later based
on real-world pain
c) **Shared rendered-extension infrastructure** — extract the
renderedFiles/drift/conflict pattern into shared types used by both

**Decision: (c) with a revised tracking model.** Shared infrastructure for both
commands and subagents, but with a simpler approach than the original subagent
proposal:

- **Managed-by marker** in rendered files (format-appropriate, e.g.
  `<!-- Managed by axm — see "axm <type> --help" -->` for markdown,
  `# Managed by axm — see "axm <type> --help"` for TOML/text,
  `"_axm_managed": "axm <type> --help"` for JSON).
  Static — no timestamp or hash in the file itself. The marker identifies AXM
  ownership and points to the relevant CLI help for discoverability.
- **Source hash** in the lockfile — hash of the portable inputs (content file +
  relevant manifest fields), not the rendered output. Used to decide when
  re-rendering is needed. Avoids false drift from Prettier/editor reformatting.
- **Rendered file paths** tracked in the lockfile per agent for clean
  uninstall/sync.

Lifecycle rules:

- **Install**: file exists without marker → conflict, block unless `--force`.
  File exists with marker → re-render. File doesn't exist → render with marker.
- **Sync**: marker present → re-render when source hash changes, overwrite.
  File missing but extension installed → re-render (recreate).
- **Uninstall/disable**: delete all rendered files axm created.

No "user took ownership by removing the marker" state. The extension is either
installed or it isn't — `settings.json` is the single source of truth for that.
To stop managing a file, uninstall or disable the extension via the CLI.

---

## 5. CLI command parity gaps

| Subcommand    | Skills | Commands          | Subagents |
| ------------- | ------ | ----------------- | --------- |
| install       | Yes    | Yes               | Yes       |
| uninstall     | Yes    | Yes               | Yes       |
| list          | Yes    | Yes               | Yes       |
| enable        | Yes    | Yes               | Yes       |
| disable       | Yes    | Yes               | Yes       |
| new           | Yes    | Yes               | Yes       |
| publish       | Yes    | Yes               | Yes       |
| **update**    | Yes    | **No** (non-goal) | Yes       |
| **rename**    | Yes    | **No** (non-goal) | Yes       |
| **fork/copy** | Yes    | **No**            | **No**    |

Commands explicitly lists update/rename as non-goals in the design. This is
likely intentional — commands are simpler artifacts less likely to need local
customization. But it's worth asking: if a user installs a command from a
registry and the author publishes v2, how do they get the update?

a) **Accept the gap** — commands are simpler; users reinstall to update;
rename is rarely needed
b) **Add update to commands** — even simple extensions need a path to receive
upstream fixes
c) **Add update to commands, keep rename as non-goal** — update is essential;
rename is genuinely optional for commands

**Decision: (c) — Add `update` to commands in the initial implementation.**
It's a standard lifecycle primitive, enables batch updates, and matches user
expectations from skills/subagents. `rename` and `fork` remain non-goals —
commands are short prompt files where writing from scratch is easier than
forking.

---

## 6. Manifest `agents` filter field

| Extension | Has `agents` field in manifest?                      | Purpose                                               |
| --------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Skills    | Yes (`Schema.optional(Schema.Array(Schema.String))`) | Filter which agents the skill is installed for        |
| Commands  | **No**                                               | —                                                     |
| Subagents | Yes                                                  | Filter which configured agents receive rendered files |

The command manifest has `agentOverrides` (per-agent config map) but no
top-level `agents` filter. A command author who publishes a command that only
works on Claude Code and Cursor cannot express "don't render this for Gemini
CLI" in the manifest.

a) **Add `agents` filter to command manifest** — consistent with skills and
subagents
b) **Derive agent support from `agentOverrides` keys** — if overrides exist
for an agent, it's supported
c) **Accept the gap** — commands render to all configured agents;
lossy-rendering warnings serve as the signal

**Decision: (a) — Add `agents` filter to command manifest.** Consistent with
skills and subagents. Without it, command authors cannot express agent
compatibility constraints.

---

## 7. `--preview` flag inconsistency

| Flag        | Skills (existing) | Commands (proposed) | Subagents (proposed)          |
| ----------- | ----------------- | ------------------- | ----------------------------- |
| `--preview` | No                | **No**              | **Yes** (on most subcommands) |
| `--yes`     | Some operations   | Uninstall only      | Most operations               |
| `--force`   | Some operations   | Install collision   | Most operations               |

The subagent proposal adds `--preview` to install, uninstall, enable, disable,
new, publish, rename, and update. Commands have none. If both changes ship, the
CLI experience will be inconsistent — `axm subagents install --preview` works
but `axm commands install --preview` doesn't.

a) **Add `--preview` to commands** — match the subagent convention
b) **Remove `--preview` from subagents** — if it's not needed for commands,
maybe it's not needed for subagents either
c) **Add `--preview` to both, retroactively to skills** — establish it as a
universal flag for state-changing operations

**Decision: (c) — Standardize `--preview` across all extension types
(skills, commands, subagents) on workspace state-changing operations.**

Applies to: `install`, `uninstall`, `update`, `enable`, `disable`, `sync`.
Does not apply to: `new`, `publish`, `rename`, `fork` (authoring/registry
operations, not workspace state changes).

Skills benefit too — they render (rather than symlink) on systems without
symlink support, so `--preview` is useful there as well.

---

## 8. FQN pattern and ExtensionType don't include subagents yet

The `FQN_PATTERN` in `extensions/common.ts` currently matches
`skills|packs|commands|mcp-servers`. The `ExtensionTypeSchema` currently matches
`skill|command|pack|mcp-server`. Neither includes `subagent`/`subagents`.

This is expected for an unimplemented extension type, but worth flagging because
the subagent FQN uses `@owner/subagents/name` — the plural `subagents` must be
added to the FQN pattern, and `subagent` (singular) to the `ExtensionTypeSchema`.

a) **Add during subagent implementation** — natural part of the work
b) **Add now as preparation** — unblock parallel development

**Decision: (a) — No action needed.** `subagent` is already in the
`extensionTypes` array. The FQN pattern will be updated naturally during
subagent implementation.

---

## Summary of recommendations

| #   | Finding                                                            | Action                                                                                   |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | Content file source-of-truth divergence                            | **Decided:** Content file is SOT for authoring; manifest is SOT for packaging            |
| 2   | Settings entry schema can't represent `enabled` for cmds/subagents | **Decided:** Per-type entry schemas aligned on `string \| { source, enabled? }` baseline |
| 3   | Lockfile `agents` array missing from commands                      | **Decided:** Add during implementation (already in both designs)                         |
| 4   | Rendered file tracking only in subagents                           | **Decided:** Shared infra, marker + source hash, no output hash                          |
| 5   | Commands missing `update` subcommand                               | **Decided:** Add `update`; keep `rename`/`fork` as non-goals                             |
| 6   | Commands missing manifest `agents` filter                          | **Decided:** Add `agents` field to command manifest                                      |
| 7   | `--preview` flag only on subagents                                 | **Decided:** Standardize `--preview` on state-changing ops, all extension types          |
| 8   | FQN/ExtensionType don't include subagent                           | **Decided:** Already present; no action needed                                           |

All findings have been reviewed and decided. The most impactful decisions are
**#1** (content file as SOT for authoring, manifest for packaging) and **#4**
(shared rendered-file infrastructure with marker + source hash). These two
establish the consistent model that commands and subagents both follow.
