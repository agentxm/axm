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
| Source of truth            | Manifest (`axm-skill.json`)             | Manifest (`axm-command.json`)                   | **SUBAGENT.md frontmatter** (syncs TO manifest) |
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

**Recommendation:** (c) or (d) — The subagent rationale is sound (authors
iterate on system prompt + behavioral config together), but having frontmatter
sync in opposite directions between types will confuse contributors. If keeping
both, document the "why" explicitly in each design. Option (d) is the cleanest
mental model if frontmatter is desired for authoring convenience.

---

## 2. Settings entry schema asymmetry

Currently in the settings schema (`packages/core/src/unstable/settings/schema.ts`):

| Extension   | Schema                        | Entry format                     | Supports `enabled`? |
| ----------- | ----------------------------- | -------------------------------- | ------------------- |
| Skills      | `SkillsMapSchema`             | `string \| { source, enabled? }` | Yes                 |
| Commands    | `NonSkillExtensionsMapSchema` | `string` (version specifier)     | **No**              |
| MCP Servers | `NonSkillExtensionsMapSchema` | `string` (version specifier)     | **No**              |
| Packs       | `PacksMapSchema`              | `string \| { source }`           | **No**              |

The command-support proposal specifies `axm commands enable/disable` and the
subagent-support proposal specifies `axm subagents enable/disable` — both need
an `enabled` field in settings. The current `NonSkillExtensionsMapSchema =
Record(String, String)` cannot represent this.

a) **Promote all extension types to the skills-style entry schema** —
`string | { source, enabled? }` for commands, subagents, MCP servers
b) **Create per-type entry schemas** — each type gets its own entry shape
(risks further divergence)
c) **Unified `ExtensionEntrySchema`** — one shared entry schema used by all
extension types

**Recommendation:** (a) — The skills entry schema is already proven. Commands
and subagents need `enabled` for their proposed enable/disable commands. Using
the same `string | { source, enabled? }` pattern avoids inventing something new.
The naming `NonSkillExtensionsMapSchema` already signals this was a stopgap.

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

**Recommendation:** (a) — Both designs already call for it. Implement it for
commands and subagents. MCP servers can stay on `BaseCommonFields` until they
need per-agent tracking.

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

**Recommendation:** (c) — The pattern is identical. Designing it once as a
shared concern (perhaps in the lockfile schema or a `RenderedExtensionFields`
type) prevents commands from shipping with a known gap and avoids duplicating
the design later.

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

**Recommendation:** (c) — `update` is a fundamental lifecycle operation. Without
it, users must `uninstall` + `reinstall` to get fixes, losing any agent
configuration. `rename` and `fork` are less critical for commands.

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

**Recommendation:** (a) — The `agents` field is a simple, proven pattern already
in skills and subagents. Without it, command authors have no way to express
agent compatibility in the manifest.

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

**Recommendation:** (c) — `--preview` is useful for any operation that modifies
agent files. Making it a standard flag across all extension types gives users a
consistent way to inspect before committing. This is especially important for
rendered extensions (commands/subagents) where the output varies by agent.

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

**Recommendation:** (a) — No need to add stubs prematurely. The implementation
will naturally add these.

---

## Summary of recommendations

| #   | Finding                                                            | Action                                                                          |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1   | Content file source-of-truth divergence                            | Document rationale explicitly or standardize on manifest-as-source-of-truth     |
| 2   | Settings entry schema can't represent `enabled` for cmds/subagents | Promote commands and subagents to `string \| { source, enabled? }` entry schema |
| 3   | Lockfile `agents` array missing from commands                      | Add during command-support implementation (already in design)                   |
| 4   | Rendered file tracking only in subagents                           | Extract shared `RenderedExtensionFields` for both commands and subagents        |
| 5   | Commands missing `update` subcommand                               | Add `update`; keep `rename`/`fork` as non-goals                                 |
| 6   | Commands missing manifest `agents` filter                          | Add `agents` field to command manifest                                          |
| 7   | `--preview` flag only on subagents                                 | Standardize `--preview` across all extension types                              |
| 8   | FQN/ExtensionType don't include subagent                           | Add during implementation                                                       |

The biggest structural risk is **#4** — commands and subagents share the
render-on-install pattern but only subagents specify the tracking/drift
infrastructure. Designing this as shared infrastructure avoids duplicating the
work and ensures consistency.
