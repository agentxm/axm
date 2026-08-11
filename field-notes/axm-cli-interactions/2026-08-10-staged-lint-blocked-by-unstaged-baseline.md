---
subject: axm-cli-interactions
key: staged-lint-blocked-by-unstaged-baseline
date: 2026-08-10
kind: blocked
status: open
---

**Expected:** The pre-commit hook's `axm lint --staged --strict` check would evaluate the files staged for the commit.
**Actual:** The commit exited 1 because an unstaged AXM skill differed from its authoring/publish baseline, while the staged files were limited to `AGENTS.md` and one field note.
**Gap:** Staged lint enforced an unrelated workspace-level publish-baseline warning.
**Suggests:** Keep `--staged` findings scoped to staged content, or document the workspace-level checks and remediation required by the pre-commit hook.

Evidence: `git commit -m "chore(field-notes): broaden CLI observations"` exited 1; the hook reported `workspace/authored-content-unpublished` for `.axm/extensions/@agentxm/skills/axm`; `git status --short` showed only the two intended staged Markdown files.
