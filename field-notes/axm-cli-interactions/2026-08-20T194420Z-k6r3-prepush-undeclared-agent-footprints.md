---
id: 2026-08-20T194420Z-k6r3
subject: axm-cli-interactions
key: prepush-undeclared-agent-footprints
observed_at: "2026-08-20T19:44:20Z"
session: release-20260820-h2k9
kind: blocked
status: open
---

**Expected:** The repository pre-push check should accept a clean release-plan
commit after the pre-commit affected verification passed.
**Observed:** `./scripts/axm-local lint --strict` exited 1 because tracked Codex,
Cursor, and Gemini CLI projection footprints remained while
`.axm/settings.json` declares only Claude Code.
**Impact:** One push attempt was blocked and required an additional cleanup
commit; recovery time was not measured.
**Recovery:** Use AXM's agent lifecycle to remove current managed projections,
remove the superseded tracked projection symlinks it no longer owns, and retry
the push after strict lint passes.
**Detected by:** The Husky pre-push hook during `git push origin main`.
**Observed factors:** The three undeclared footprints were tracked symlink
trees; strict lint reproduced outside the hook; the same symptom has recurred
in earlier field notes.
**Hypothesis:** Older agent projection paths survived after the desired agent
set narrowed and are no longer covered by current lifecycle cleanup.

Evidence: Pre-push reported `workspace/agents-detected-declared` for `codex`,
`cursor`, and `gemini-cli`; after projection cleanup, `agents list` detected
only configured `claude-code` and strict lint reported no findings.
