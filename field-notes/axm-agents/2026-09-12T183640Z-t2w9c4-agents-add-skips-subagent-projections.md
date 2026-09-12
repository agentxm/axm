---
id: 2026-09-12T183640Z-t2w9c4
subject: axm-agents
key: agents-add-skips-subagent-projections
observed_at: "2026-09-12T18:36:40Z"
session: 01a096e4-2386-7cb1-9fb1-3b5574dcc583
kind: workaround
status: open
---

**Expected:** `axm help getting-started` / `basic-usage`: `axm agents add` creates the owned per-agent artifacts for installed extensions atomically. `@craigsmitham/subagents/researcher` 0.1.1 was installed (implicit, enabled) via the research pack.
**Observed:** CLI 0.29.4. `axm agents add codex grok-cli opencode` exit 0 reported only skill projections plus `axm.json`. After add: `.claude/agents/researcher.md` present; no `.codex/agents`, `.opencode/agents`, or `.grok/agents` researcher file. `axm subagents list`: `claude-code:current, codex:failed, grok-cli:failed, opencode:failed`. `axm subagents show researcher`: failed rows `projection-missing: The expected <id> projection is missing.` `axm sync --preview` planned 1 unit (`subagent:researcher`, reason `stale-projection`).
**Impact:** researcher unavailable on the newly added agents until a second command. Extra step: `axm sync` (preview 7.2s, apply 7.1s).
**Recovery:** ran `axm sync`; Codex and OpenCode projections became current (`.codex/agents/researcher.toml`, `.opencode/agents/researcher.md`). Codex file included `sandbox_mode = "read-only"`. Task completed for those two agents.
**Detected by:** `axm subagents list` / `show` after add; filesystem inspection
**Observed factors:** add materialized 15 skills to the new agents; subagent was the only installed type left `projection-missing`; add did not fail
**Diagnostic evidence:** CLI 0.29.4; add exit 0; researcher 0.1.1 implicit enabled; show statuses `current`/`failed` with `projection-missing`; sync preview `counts.ready` 1, unit id `subagent:researcher`
**Hypothesis:** agents add realizes skill projections in the same run and leaves subagent projections to a later workspace sync
**Suggests:** include installed subagents in the agents-add closure, or report remaining `projection-missing` agents instead of a clean success
