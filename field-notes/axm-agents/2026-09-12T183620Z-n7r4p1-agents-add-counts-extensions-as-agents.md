---
id: 2026-09-12T183620Z-n7r4p1
subject: axm-agents
key: agents-add-counts-extensions-as-agents
observed_at: "2026-09-12T18:36:20Z"
session: 01a096e4-2386-7cb1-9fb1-3b5574dcc583
kind: gap
status: open
---

**Expected:** `axm agents add codex grok-cli opencode` would report three coding-agent memberships. Help examples describe adding named agent IDs.
**Observed:** CLI 0.29.4. Preview: "Would configure 18 agents" then "Configure codex, grok-cli, opencode and materialize installed extensions" with 3 `Add <id>` rows plus 15 skill projection rows. Apply (exit 0): "Configured 18 agents" with the same 3+15 split. `axm.json` `agents` became `["claude-code", "codex", "grok-cli", "opencode"]`. `axm agents list` then showed 4 configured agents.
**Impact:** had to re-read the plan to confirm only three memberships were added. Direct cost: one extra parse of the 18-row summary. not measured beyond that.
**Recovery:** inspected `axm.json` and `axm agents list`; membership was correct. Task continued.
**Detected by:** summary line vs unit list in the same command output
**Observed factors:** 15 installed skills were also materialized into `.grok/skills` and `.opencode/skills`; Codex shared `.agents/skills`
**Diagnostic evidence:** CLI 0.29.4; commands `axm agents add codex grok-cli opencode --preview` and apply; both exit 0; apply elapsed 2.2s; summary "Configured 18 agents"; `Agents: codex, grok-cli, opencode`
**Hypothesis:** the operation counter labels plan units (membership + skill projections) as "agents"
**Suggests:** count configured agent IDs separately from materialized extension units
