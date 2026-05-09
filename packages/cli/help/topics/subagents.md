# Subagents

Subagent packages live in `./.axm/extensions/<@owner>/subagents/<subagent-name>`.

A subagent is two coordinated files: a portable manifest plus a content file that holds the system prompt and any agent-facing frontmatter.

## subagent.json

[`subagent.json`](https://axm.sh/schemas/subagent.schema.json)

Targeting is workspace-owned through `.axm/settings.json` `agents`; publish rejects manifest `agents`. The manifest does not carry per-agent behavior — that lives in the content file.

<!-- axm:embed-schema subagent.schema.json -->

## `src/`

The `src/` directory holds `<subagent-name>.md` — Markdown with YAML frontmatter and a body containing the system prompt.

Only one frontmatter field is required: `name`. Everything else you write in the frontmatter passes through verbatim into the rendered agent-native file. AXM does not interpret or reshape it. Omit top-level frontmatter unless it will work on all agents. Otherwise, specify the desired subagent
configuration per each agent's official subagent documentation.

```markdown
---
name: code-reviewer
description: "call me uncle bob"
agentOverrides:
  claude-code:
    model: claude-opus-4-6
  codex:
    model: gpt-5-codex
    sandbox_mode: read-only
    description: null
---

You are a senior code reviewer...
```

`name` must match both the manifest's `name` and the filename stem.

## Pass-through rendering

`axm install` and `axm sync` translate the content file's frontmatter into each target agent's native format and place the body in the format's natural slot:

- **Markdown + YAML** (Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment, Junie, Kilo Code, Kiro IDE) — frontmatter keys → YAML; body follows the `---` block.
- **TOML** (Codex) — frontmatter keys → TOML key-value lines; body becomes `developer_instructions`.
- **JSON** (Kiro CLI) — frontmatter keys → JSON object; body becomes `prompt`.
- **Roo modes** (Roo Code) — `slug` and `name` are set to the subagent name; the body splits at the first blank line into `roleDefinition` and `customInstructions`; `groups` defaults to `[read, edit, command, mcp]` if not in frontmatter; other frontmatter keys flow through.

Whatever you write in your frontmatter is what shows up in the rendered file. If you want different values for different agents, use `agentOverrides`. Do not edit the rendered subagents directly.

## Agent overrides

`agentOverrides.<agent-id>` is the one recognized convention key in frontmatter. It is consumed by the renderer and never appears in the rendered output. Each entry is applied as an RFC 7396 JSON Merge Patch on top of the rendered fields for that agent: objects merge recursively, `null` deletes a key, arrays replace wholesale, and primitive values replace.

```yaml
agentOverrides:
  claude-code:
    permissions:
      write: false
      legacyMode: null
    allowedTools:
      - Read
      - Grep
  codex:
    sandbox_mode: workspace-write
```

Overrides for agents not in your configured `agents` set are ignored, with a warning.

## Updating subagents

Edit the content file under `src/`. `axm sync` re-renders the agent-native files from the content file's frontmatter and body; it does not write to `subagent.json`.

Run `axm subagents publish` to release a new version. Publish validates the manifest, checks that `src/<subagent-name>.md` exists and that its frontmatter `name` matches the manifest, then zips the extension directory, computes its SRI integrity hash, and uploads the version to the target registry. Publish never edits `subagent.json` — whatever is on disk is what gets shipped.

## Where to go next

- `axm subagents --help` — full subagent subcommand surface.
