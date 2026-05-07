# Subagents

Subagent packages live in `./.axm/extensions/<@owner>/subagents/<subagent-name>`.

A subagent is two coordinated files: a portable manifest plus a content file that holds the system prompt and agent-specific configuration.

## subagent.json

[`subagent.json`](https://axm.sh/schemas/subagent.schema.json) is the subagent package manifest for the agentxm.ai registry.

## `src/`

The `src/` directory holds `<subagent-name>.md` — Markdown with YAML frontmatter and a body containing the system prompt.

The frontmatter mirrors the manifest's portable fields and adds an `overrides` map for agent-native escapes:

```markdown
---
name: code-reviewer
description: Reviews diffs for correctness, security, and style.
model: powerful
toolAccess: readonly
background: true
overrides:
  claude-code:
    disallowedTools: Edit,Write,Bash,WebFetch
  codex:
    model: gpt-5-codex
---

You are a senior code reviewer...
```

`name` must match both the manifest's `name` and the filename stem.

## Overrides

`overrides.<agent-id>` is a last-resort merge — its keys overwrite anything the portable mapping computed for that agent. Use it for agent-native frontmatter the portable schema doesn't model. Overrides for agents not in `agents` are ignored.

## Rendering

`axm install` and `axm sync` render the canonical definition into each target agent's native format (Markdown+YAML, TOML, JSON, or Roo modes), mapping `model` and `toolAccess` to per-agent native fields and emitting warnings when a feature can't be expressed (e.g. `background: true` on Codex).

## Updating subagents

Edit the content file under `src/`; `axm sync` projects portable frontmatter changes back into `subagent.json` and re-renders agent files. Run `axm subagents publish` to push to the registry.

## Where to go next

- `axm subagents --help` — full subagent subcommand surface.
