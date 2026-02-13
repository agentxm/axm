## Context

`axm init` detects agents by checking home directory paths (`~/.claude`, `~/.cursor`, etc.) via per-agent custom `detect` functions and a `defaultDetect` heuristic. The `defaultDetect` also checks a derived path from `skills.dir` (e.g., `~/agents` for Amp), causing false positives. When agents are detected, a two-step prompt asks "Setup with auto-detected agents" or "Let me choose" — the user can't individually deselect false positives without choosing the second option.

Key files:

- `packages/cli/src/agents/detection.ts` — `defaultDetect`, `detectAgent`, `detectAgents`
- `packages/cli/src/agents/types.ts` — `AgentDetectFn`, `AgentDescriptor`
- `packages/cli/src/agents/*/detection.ts` — 6 custom detect functions (claude-code, codex, cursor, windsurf, opencode, continue)
- `packages/cli/src/workspace/service.ts` — `initializeProjectWorkspace` (lines 119-254)

## Goals / Non-Goals

**Goals:**

- Detect agents from both project-level directories (`.claude/`, `.cursor/` in cwd) and global home directories (`~/.claude`, `~/.cursor`)
- Fix `defaultDetect` false positives (the `skills.dir` first-segment trick)
- Replace the two-step prompt with a single multiselect where detected agents are pre-selected
- Keep `--yes` behavior: auto-accept all detected agents without prompting

**Non-Goals:**

- Grouped multiselect UI (deferred — flat list for now)
- Changing `--agent` or `--non-interactive` behavior
- Changing global workspace init (`axm init --global`)

## Decisions

### 1. Unified detection: project-level + global, single function per agent

Replace the current approach (per-agent custom `detect` + `defaultDetect` fallback) with a single unified detection function that checks two locations for every agent:

1. **Project-level**: Check if the first segment of `skills.dir` exists in cwd (e.g., `.claude/` for Claude Code, `.agents/` for Amp)
2. **Global**: Check `~/.{agent-id}` exists in home directory

This eliminates:

- The 6 custom `detect` functions (claude-code, codex, cursor, windsurf, opencode, continue)
- The buggy `defaultDetect` second pattern (joining stripped `skills.dir` segment with home)
- The `detect` field on `AgentDescriptor`

**Why unified over keeping custom functions**: The custom functions only check home directory paths in slightly different ways (env var overrides, `/etc/codex`). The new heuristic (`~/.{agent-id}`) covers them all. The env var paths (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`) are edge cases that don't justify per-agent detection files.

**Why project-level uses `skills.dir` parent**: This is the directory the agent actually creates in a project. If `.claude/` exists, someone is using Claude Code here. More reliable than checking for `~/.claude` which just means it's installed somewhere on the machine.

### 2. Pass project directory to `detectAgents`

Currently `detectAgents()` takes no arguments and uses the `home` constant. Change the signature to accept a `projectDir` parameter:

```
detectAgents(projectDir: string)
```

The workspace service already has `localDir` (from `getAxmDir(false)`) and can derive the project root by going one level up (strip `.axm` suffix). Or simpler: use `process.cwd()` since that's what `getProjectDir` uses.

### 3. Remove two-step prompt, always show multiselect

Replace the current flow:

```
if detected → "auto-detect or choose?" → if choose → multiselect
if none     → multiselect (nothing pre-selected)
```

With:

```
always → multiselect (detected agents pre-selected)
```

This is simpler and gives the user direct control. The multiselect already supports `initialValues` for pre-selection.

### 4. Keep `AgentDetectFn` type but remove usage

Remove `detect` from `AgentDescriptor` interface since all detection is now unified. Remove the 6 per-agent `detection.ts` files. The `AgentDetectFn` type can be removed from `types.ts`.

## Risks / Trade-offs

**Agents sharing `skills.dir` all detected together** — Amp, Codex, Gemini CLI, GitHub Copilot, Kimi Code CLI, and OpenCode all use `.agents/skills/`. If `.agents/` exists in the project, all six are pre-selected. This is acceptable — the user can deselect in the multiselect, and you genuinely can't tell which agent created the directory.

**Loss of env var detection** — Custom detect for Claude Code checks `CLAUDE_CONFIG_DIR`, Codex checks `CODEX_HOME`. These are dropped. Users with non-standard config locations won't get global detection for those agents. Acceptable because project-level detection doesn't depend on these, and the multiselect lets users manually select regardless.

**`--yes` in blank folder selects nothing** — If no agents are detected (blank folder, no global agent installs), `--yes` selects zero agents. This is correct behavior — it's a blank project with no agent presence.
