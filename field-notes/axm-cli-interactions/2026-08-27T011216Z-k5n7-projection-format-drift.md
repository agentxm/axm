---
id: 2026-08-27T011216Z-k5n7
subject: axm-cli-interactions
key: projection-format-drift
observed_at: "2026-08-27T01:12:16Z"
session: q8v2
kind: gap
status: open
---

**Expected:** `axm update` should leave generated managed projections conforming to the repository formatting check.
**Observed:** The update completed successfully, but `pnpm run format:check` exited 1 and identified `.claude/agents/researcher.md` and `AGENTS.md` as needing Prettier formatting.
**Impact:** The requested commit was delayed by one additional formatting and verification step.
**Recovery:** Run the repository formatter and repeat the formatting and AXM convergence checks; task completion is pending.
**Detected by:** `pnpm run format:check` after the applied update.
**Observed factors:** AXM CLI 0.28.1; update candidate `27a571ac89d16b10a6905d97ccfcd4f9d558dbd4984610235ef19578715dcf1c`; 10 units committed and 2 unchanged.
**Diagnostic evidence:** Formatter exit status 1; affected artifacts `.claude/agents/researcher.md` and `AGENTS.md`; no AXM update failures, rollbacks, blockers, or warnings in the final result.
**Hypothesis:** AXM's Markdown rendering differs from the repository's Prettier configuration.
**Suggests:** Format or validate generated Markdown against the repository formatter before reporting the update as converged.
