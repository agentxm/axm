---
id: 2026-09-12T183512Z-k3m8q2
subject: axm-agents
key: agents-list-omits-supported-ids
observed_at: "2026-09-12T18:35:12Z"
session: 01a096e4-2386-7cb1-9fb1-3b5574dcc583
kind: gap
status: open
---

**Expected:** `axm agents list` would show supported coding-agent IDs needed to add Codex, Grok, and OpenCode. `axm help basic-usage` says use `axm agents list` to inspect configured and detected agents; `axm agents list --help` documents `--available` as "Show all supported agent IDs".
**Observed:** `axm --version` 0.29.4. Bare `axm agents list` printed "1 coding agent" with only `claude-code` (configured yes, detected yes). No supported IDs. `axm agents list --json` included `available` with `codex`, `grok-cli`, and `opencode`. The user-facing name "grok" is not an ID; the available list names it `grok-cli` (Grok Build). Extra commands: `axm agents list --help`, `axm agents list --json`, `axm agents list --available`.
**Impact:** ID discovery took three extra list invocations before `axm agents add`. Delayed adding the three agents until `grok-cli` was identified.
**Recovery:** used `--available` / `--json` `result.available`; add proceeded with `codex grok-cli opencode`. Task completed.
**Detected by:** command output vs the IDs required to add agents
**Observed factors:** project `axm.json` had `"agents": ["claude-code"]`; Codex/Grok/OpenCode were not configured; Grok was detected after add (`detected: yes`), Codex was not (`detected: no`)
**Diagnostic evidence:** CLI 0.29.4; command `axm agents list`; exit 0; default `count` 1; `--json` `configured`/`detected` `["claude-code"]`; `available` length 62 including `codex`, `grok-cli`, `opencode`
**Hypothesis:** default list is membership/detection status, not the catalog; help that says "inspect configured and detected" matches the default, but picking an ID to add still requires `--available` or `--json`
**Suggests:** default `axm agents list` could include supported IDs, or the add path could accept aliases such as `grok` → `grok-cli`
