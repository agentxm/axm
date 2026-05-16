# Commands

Command packages live in `./.axm/extensions/<@owner>/commands/<command-name>`.

A command is two files: a registry manifest plus a Markdown content file that
holds agent-facing frontmatter and the slash-command prompt body.

## command.json

[`command.json`](https://axm.sh/schemas/command.schema.json)

Run `axm help command-schema` to print the raw JSON Schema.

## Content File

The command content file is `<command-name>.md`. Its YAML frontmatter is passed
through verbatim. AXM does not rename or translate fields such as
`argumentHint` to `argument-hint`; write the target agent's native key, or put
per-agent shape changes in `command.json` `agentOverrides`.

```markdown
---
description: Review code
argument-hint: "[scope]"
allowed-tools:
  - Read
  - Grep
---

Review {{arguments}}.
```

Supported body placeholders:

- `{{arguments}}` — all arguments the user passed to the command.
- `{{arguments[N]}}` — the Nth positional argument, zero-indexed.
- `{{arg:name}}` — a named argument slot, rendered with each target agent's named-argument syntax (e.g. `${input:name}` on Copilot, `$name` on Junie). Families without native named arguments — Claude Code, Cursor, Gemini — render the placeholder as a context appendix instead of inlining a value.

Use `\{{` to render a literal `{{` without substitution.

Use `agentOverrides` in the content file frontmatter for per-agent differences.
Each `agentOverrides.<agent-id>` entry is applied as an RFC 7396 JSON Merge
Patch on top of the content file's frontmatter for that agent: objects merge
recursively, `null` deletes a key, arrays replace wholesale, and primitive
values replace.

## Rendering

`axm install` and `axm sync` render commands into each configured agent's
native command directory:

- **Markdown + YAML** (Claude Code, Codex, OpenCode, Augment, Junie, Kilo,
  Roo) — frontmatter keys become YAML; body follows the `---` block.
- **Markdown body only** (Cursor) — body only; frontmatter is dropped.
- **Prompt Markdown** (GitHub Copilot IDE) — frontmatter keys become YAML;
  file names end in `.prompt.md`.
- **TOML** (Gemini CLI) — frontmatter keys become TOML; body becomes `prompt`.
  Nested filenames map to Gemini `:` command namespaces.
- **Plain text** (Kiro CLI) — body only; frontmatter is not rendered.

Targets that drop frontmatter (such as Cursor's body-only Markdown) ignore keys like `argument-hint` and `allowed-tools` entirely. Keep the body self-explanatory so the command still works on those agents, and use `agentOverrides` for anything that must vary by target.

Do not edit rendered command files directly. Edit the command package source and re-render.

## Where to go next

- `axm help packs` — bundling command extensions with extension packs
- `axm commands --help` — full command subcommand surface
