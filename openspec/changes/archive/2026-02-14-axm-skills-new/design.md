## Context

axm has `axm packs new` for scaffolding packs but no equivalent for skills. The install flow already creates managed skill directories under `.axm/extensions/@<namespace>/skills/<name>/` with `axm-skill.json` manifests and `src/` subdirectories, and wires agent symlinks. The `skills new` command needs to produce the same structure but from scratch rather than from a downloaded archive.

## Goals / Non-Goals

**Goals:**

- Scaffold a new managed skill that is immediately usable by all configured agents
- Follow the same directory layout and registration patterns as the install flow
- Mirror the `packs new` command structure for consistency

**Non-Goals:**

- Interactive skill authoring wizard (prompting for description, keywords, etc.) — keep it minimal
- Template selection or skill type variants — one starter template is enough
- Generating agent-specific skill formats — axm always uses the agentskills.io SKILL.md format

## Decisions

### Follow the `packs new` pattern exactly

The command structure, handler args, scope resolution, and error handling mirror `packs new`. This keeps the codebase consistent and reduces decisions.

**Alternative considered:** A more opinionated scaffolder with prompts for metadata. Rejected because it adds complexity without clear value — authors can edit the manifest and SKILL.md after creation.

### Reuse existing symlink and path infrastructure

Agent symlinks use the existing `createSymlink` utility. Skill directory paths use the managed extensions layout from `managed-extensions` spec (`.axm/extensions/@<namespace>/skills/<name>/`). No new path computation is needed beyond what install already does.

**Alternative considered:** A dedicated path helper like `computeSkillPaths` (analogous to `computePackPaths`). This is warranted — extract or reuse a helper that computes the canonical path for a managed skill given scope and name.

### Register as a managed entry with no source

The skill is registered in settings as a managed entry. Since it was authored locally (not installed from a source), the settings entry uses `{ managed: true }` with no source string. The lock entry records the skill with no source coordinates, just the scope, name, version, agents, and timestamps.

**Alternative considered:** Using a synthetic source like `local:` or `self:`. Rejected — the entry schema already supports managed entries without a source, and inventing a source type adds complexity.

### Minimal SKILL.md template

The starter `src/SKILL.md` contains YAML frontmatter (`name`, `description`) and a placeholder body. This is the minimum needed to be a valid skill that agents can load.

### Wire all configured agents by default

When `--agent` is not specified, symlinks are created for all agents listed in `settings.json`. This matches the install flow behavior. The `--agent` flag narrows the set.

## Risks / Trade-offs

**Scope resolution requires init** — If the user hasn't run `axm init` or configured a scope, `skills new` fails with a `SCOPE_REQUIRED` error. This is the same behavior as `packs new` and is acceptable since the error message guides the user.

**No duplicate detection across scopes** — A user could create `@acme/my-skill` and `@other/my-skill`. Both would try to symlink as `my-skill` in agent directories. The existing `createSymlink` handles this by replacing the existing symlink, but the user may be surprised. Mitigated by the skill-already-exists check against settings (which is name-based, not scope-qualified). → Accept for now; revisit if it causes real confusion.
