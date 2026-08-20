---
id: 2026-08-20T190437Z-n6v2
subject: axm-cli-interactions
key: prepush-undeclared-agent-footprints
observed_at: "2026-08-20T19:04:37Z"
session: unknown
kind: blocked
status: open
---

**Expected:** The repository pre-push check should accept a clean commit after the full affected verification passed.
**Observed:** `./scripts/axm-local lint --strict` exited 1 because tracked Codex, Cursor, and Gemini CLI footprints are present while `.axm/settings.json` declares only Claude Code.
**Impact:** One push attempt was blocked; recovery time is not yet measured.
**Recovery:** Pending disposition of the unrelated workspace configuration finding; the requested change remains committed locally and unpushed.
**Detected by:** The Husky pre-push hook during `git push origin main`.
**Observed factors:** The local branch is one commit ahead of `origin/main`; the three undeclared footprints are tracked symlink trees; the same finding is recorded in an earlier field note already on `origin/main`.
**Hypothesis:** The repository intentionally retained older tracked agent projections after narrowing desired agent membership, leaving strict full-workspace lint unable to distinguish them from active undeclared intent.

Evidence: Pre-push reported `workspace/agents-detected-declared` for `codex`, `cursor`, and `gemini-cli`; `axm agents list --json` reported all three as detected but not configured.
