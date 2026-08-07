# Skills

Skill packages live in `./.axm/extensions/<@owner>/skills/<skill-name>`.

## skill.json

[`skill.json`](https://axm.sh/schemas/skill.schema.json)

Run `axm help skill-schema` to print the raw JSON Schema.

## `src/`

The `src/` directory holds `SKILL.md` and any other files described by the [agentskills.io](https://agentskills.io) specification.

`SKILL.md` is Markdown with YAML frontmatter. `name` and `description` are
required, and `name` must match both the manifest's `name` and the agent-facing
skill directory name. AXM validates the pinned Agent Skills fields: `name`,
`description`, `license`, `compatibility`, `metadata`, and the experimental
`allowed-tools`. The Markdown body and every other file under `src/` remain
opaque and are materialized faithfully.

## Writing the `description` for model invocation

The `SKILL.md` frontmatter `description` is the single biggest lever on whether
a skill actually fires. When a skill is model-invocable, the agent matches this
text against the current task to decide whether to load it. Write it for the
model, not for a human catalog — this is a different job from the registry-facing
manifest `description` (see `axm help authoring`).

- **Write in the third person and lead with what it does**, then add a `Use
when…` clause naming concrete triggers: the task verbs, file types, tools, or
  keywords a matching request will contain.
- **Include the literal terms** a user would actually type. The model matches on
  overlap, so name the technology and the action.
- **State when _not_ to use it** if the skill could over-fire on adjacent tasks.

```yaml
---
name: review-typescript
description: Reviews TypeScript diffs for Effect idioms and common bugs. Use when the user asks to review, audit, or check `.ts`/`.tsx` changes. Not for runtime debugging or test authoring.
---
```

Weaker: `description: Helps with code.` — no triggers, so the model rarely
knows when to load it.

Invocation behavior outside the standard frontmatter is agent-specific. Keep
such configuration outside `SKILL.md`; AXM does not accept vendor-only
frontmatter fields in a portable skill.

## Authoring and editing skills

The contents of `src/` are symlinked by AXM into each configured agent's skill directory, so you do not need to run `axm sync` after an edit. Run `axm sync` only if symlinks or copies are broken.

If AXM had to copy a skill because symlinks are unavailable, edit `src/SKILL.md` in `.axm/extensions/...` and run `axm sync`; do not edit the copied agent-side file.

## Unmanaged skills

When `axm lint` reports `workspace/skills-managed`, choose one resolution per skill or related group:

- **Adopt** when the skill has an AXM-resolvable source and you want AXM to track updates: `axm skills install <source>`.
- **Copy** when there is no clean source, or you want to own, customize, or publish it: `axm skills copy`, then `axm skills publish`.
- **Leave it unowned** when another tool owns its lifecycle. AXM reports it but does not delete it.
- **Prune** when it is orphaned and AXM ownership is proven: review `axm prune <name>`, then apply with `--yes`.

Copy only when you deliberately take ownership away from another tool. `axm prune` shows the exact marker, symlink target, lock entry, or trust record that proves AXM ownership; unknown artifacts are retained.

## Lockfile and integrity

AXM records two different identities for registry-installed skills:

- **`integrity`** — the SRI sha512 of the published archive. AXM verifies it against the downloaded bytes before extracting, every time it fetches. This is the supply-chain guarantee: a tampered or corrupted download fails the install.
- **Content identity** — a SHA-256 marker used with source identity in `.axm/trust.json` to decide whether canonical content is safe to reuse. Receipt history may also record it as `sourceHash`.

After install, remote-source canonical files under `.axm/extensions/` are
AXM-managed. If their content identity changes, `axm sync` resolves the declared
source instead of projecting untrusted local edits. Workspace-authored packages
remain local authority and are re-materialized from their current source.

## Recommended packs

Name the pack(s) your skill is designed to ship with in `skill.json` `recommendedPacks`. Use the bare pack reference — do not include a version range:

```json
{
  "recommendedPacks": ["@acme/packs/bricks"]
}
```

When a pack lists this skill as a dependency and the skill lists that pack as recommended, the registry marks both sides of the relationship as **official**. Either side may declare alone; the badge appears only when both agree.

Always declare `recommendedPacks` for packs you publish under the same owner that bundle this skill — it costs nothing and earns the Official badge in the registry.

See `axm help packs` for pack authoring and `standalone` semantics.

## Where to go next

- `axm skills --help` — full skill subcommand surface
- `axm help authoring` — writing the registry `description`, keywords, and README
- `axm help packs` — bundling skill extensions with extension packs
- `axm help workspace-state` — desired, observed, trust, and receipt semantics
