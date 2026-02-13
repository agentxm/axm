## Why

`axm init` currently auto-detects agents from global home directory paths (`~/.claude`, `~/.cursor`, etc.) and presents a binary choice: "Setup with auto-detected agents" or "Let me choose." This causes false positives (e.g., `~/agents` matching Amp) and removes user agency — detected agents are accepted or rejected as a group, not individually selected.

## What Changes

- Fix `defaultDetect` heuristic to eliminate false positives (the `skills.dir` path-segment trick that matches unrelated home directories like `~/agents`)
- Add **project-level detection** — check for agent config directories in the current project (e.g., `.claude/`, `.cursor/`, `.agents/`) alongside global detection
- Remove the two-step init prompt ("Setup with auto-detected agents" vs "Let me choose") — go directly to agent multiselect with detected agents pre-selected
- Group agents that share the same `skills.dir` in the multiselect (e.g., Amp, Codex, Gemini CLI, GitHub Copilot, Kimi Code CLI, OpenCode all use `.agents/skills/`)

## Capabilities

### New Capabilities

_None — this modifies existing capabilities._

### Modified Capabilities

- `cli-init`: Init flow changes from two-step prompt to single grouped multiselect with detected agents (global + project-level) pre-selected

## Impact

- `packages/cli/src/agents/detection.ts` — fix `defaultDetect` heuristic, add project-level detection
- `packages/cli/src/workspace/service.ts` — simplify `initializeProjectWorkspace()` to remove two-step prompt, pass project directory to detection
- `packages/cli/src/tui/multiselect/` — may need grouped multiselect support
- `openspec/specs/cli-init/spec.md` — update scenarios for new detection behavior
