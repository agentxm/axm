# Commands

Command packages live in `./.axm/extensions/<@owner>/commands/<command-name>`.

A command is two files: a registry manifest plus a Markdown content file that
holds agent-facing frontmatter and the slash-command prompt body.

## command.json

[`command.json`](https://axm.sh/schemas/command.schema.json)

<!-- axm:embed-schema command.schema.json -->

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

Supported body placeholders: `{{arguments}}`, `{{arguments[N]}}`, `{{arg:name}}`.

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

Do not edit rendered command files directly. Edit the command package source and
re-render.

## Where to go next

- `axm commands --help` — full command subcommand surface.
