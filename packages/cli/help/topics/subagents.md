# Subagents

Subagent packages live in `./.axm/extensions/<@owner>/subagents/<subagent-name>`.

A subagent is two coordinated files: a portable manifest plus a content file that holds the system prompt and agent-specific configuration.

## subagent.json

[`subagent.json`](https://axm.sh/schemas/subagent.schema.json) is the subagent package manifest for the agentxm.ai registry.

## `src/`

The `src/` directory holds `<subagent-name>.md` — Markdown with YAML frontmatter and a body containing the system prompt.

`subagent.json` is the source of truth for portable fields. The frontmatter mirrors them so the content file is self-contained for rendering, and adds an `overrides` map for agent-native escapes. Keep the two in sync — `axm` does not reconcile them for you.

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

Edit the content file under `src/` and update `subagent.json` to match if you change a portable field. `axm sync` re-renders the agent-native files from the content file's frontmatter and body; it does not write to `subagent.json`.

Run `axm subagents publish` to release a new version. Publish validates the manifest, checks that `src/<subagent-name>.md` exists and that its frontmatter `name` matches the manifest, then zips the extension directory, computes its SRI integrity hash, and uploads the version to the target registry. Publish never edits `subagent.json` — whatever is on disk is what gets shipped.

## Where to go next

- `axm subagents --help` — full subagent subcommand surface.
