# Skills

Skill packages live in `./.axm/extensions/<@owner>/skills/<skill-name>`.

## skill.json

[`skill.json`](https://axm.sh/schemas/skill.schema.json) is the skill package manifest for the agentxm.ai registry.

## `src/`

The `src/` within the skill package contains `SKILL.md` and any other files as specified by the agentskills.io specification.

## Updating skills

The contents of the `src` symlinked by AXM to the respective agent skill directories, so no need to `axm sync` after an edit. Only run `axm sync` if symlinks or copies are broken.

## Where to go next

- `axm skills --help` — full skill subcommand surface.
