# Skills

Skill packages live in `./.axm/extensions/<@owner>/skills/<skill-name>`.

## skill.json

[`skill.json`](https://axm.sh/schemas/skill.schema.json)

Run `axm help skill-schema` to print the raw JSON Schema.

## `src/`

The `src/` directory holds `SKILL.md` and any other files described by the [agentskills.io](https://agentskills.io) specification.

`SKILL.md` is Markdown with YAML frontmatter. Only `name` is required, and it must match both the manifest's `name` and the skill directory name. Everything else in the frontmatter passes through verbatim to the rendered agent file.

## Authoring and editing skills

The contents of `src/` are symlinked by AXM into each configured agent's skill directory, so you do not need to run `axm sync` after an edit. Run `axm sync` only if symlinks or copies are broken.

If AXM had to copy a skill because symlinks are unavailable, edit `src/SKILL.md` in `.axm/extensions/...` and run `axm sync`; do not edit the copied agent-side file.

## Unmanaged skills

When `axm lint` reports `workspace/skills-managed`, choose one resolution per skill or related group:

- **Adopt** when the skill has an AXM-resolvable source and you want AXM to track updates: `axm skills install <source>`.
- **Fork** when there is no clean source, or you want to own, customize, or publish it: `axm skills fork`, then `axm skills publish`.
- **Ignore** when another tool owns its lifecycle, such as a managed marker, same-prefix family, or cross-tool config reference: add names or globs to `skillsConfig.ignore`.
- **Prune** when it is orphaned and unused: `axm skills prune <name>` or `axm prune`.

Prefer ignore for tool-managed skills. Fork only when you deliberately take ownership away from that tool. See `axm help settings` for `skillsConfig.ignore`.

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
- `axm help packs` — bundling skill extensions with extension packs
