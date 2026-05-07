# Commands

Command packages live in `./.axm/extensions/<@owner>/commands/<command-name>`.

A command is two files: a registry manifest plus a Markdown content file that
holds agent-facing frontmatter and the slash-command prompt body.

## command.json

[`command.json`](https://axm.sh/schemas/command.schema.json) is the command
package manifest. It carries identity and registry metadata.

Use `agentOverrides` in the manifest for per-agent frontmatter differences.
Each `agentOverrides.<agent-id>` entry is applied as an RFC 7396 JSON Merge
Patch on top of the content file's frontmatter for that agent: objects merge
recursively, `null` deletes a key, arrays replace wholesale, and primitive
values replace.

```json
{
  "type": "command",
  "name": "review",
  "version": "0.1.0",
  "agentOverrides": {
    "claude-code": {
      "allowed-tools": ["Read", "Grep"]
    },
    "github-copilot": {
      "tools": ["codebase"]
    }
  }
}
```

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

Body variables still use AXM's portable placeholders and are translated per
agent where supported.

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
