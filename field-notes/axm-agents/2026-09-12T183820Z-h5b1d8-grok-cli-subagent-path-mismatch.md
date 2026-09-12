---
id: 2026-09-12T183820Z-h5b1d8
subject: axm-agents
key: grok-cli-subagent-path-mismatch
observed_at: "2026-09-12T18:38:20Z"
session: 01a096e4-2386-7cb1-9fb1-3b5574dcc583
kind: gap
status: open
---

**Expected:** grok-cli subagent catalog directory is `.grok/agents`. After `axm sync`, `axm subagents show researcher` would report grok-cli `current` at that path, matching skill projections already at `.grok/skills`.
**Observed:** CLI 0.29.4. Sync exit 0: "Synced 1 workspace item" (`researcher`). File written to `.grok-cli/agents/researcher.md`. `.grok/agents` exists and is empty. `.grok/skills` has the 15 skill symlinks. `axm subagents show researcher`: grok-cli `failed`, `projection-missing: The expected grok-cli projection is missing.`; claude-code/codex/opencode `current`. `axm sync --preview --fail-on-change --json` outcome `no-op`, message "Workspace materialization is up to date", `counts.total` 0.
**Impact:** Grok does not see the researcher at `.grok/agents`. Show and sync disagree, so a second sync does not repair it. Leftover `.grok-cli/` directory. Grok-cli researcher still missing at end of the add-agents task.
**Recovery:** none for grok-cli. Did not hand-move the AXM-managed file. Codex/OpenCode/Claude Code projections are current.
**Detected by:** `find`/directory listing after sync; `axm subagents show` vs `axm sync --preview --fail-on-change --json`
**Observed factors:** markdown-yaml renderer fallback is `.${agentId}/agents`; grok-cli is not in that adapter's `AGENT_DIRS` map; catalog `directory` is `.grok/agents`; skills used `.grok/skills`
**Diagnostic evidence:** CLI 0.29.4; researcher 0.1.1; show grok-cli `failed` `projection-missing`; sync preview `ok` true, `outcome` `no-op`; on-disk `.grok-cli/agents/researcher.md` present; `.grok/agents` empty
**Hypothesis:** writer uses agent-id path fallback `.grok-cli/agents`; observer uses catalog `.grok/agents`; sync treats the writer output as done
**Suggests:** resolve grok-cli subagent paths from the catalog directory `.grok/agents`, and make show/sync use the same path
