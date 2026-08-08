---
subject: ci-cd-workflows
key: merge-ref-format-drift
date: 2026-08-08
kind: gap
status: open
---

**Expected:** A branch that passed the local Prettier check and clean pre-commit/pre-push hooks would pass the pull request Format job.
**Actual:** The Format job failed on `AGENTS.md` because `main` gained a field-note-subjects commit after the feature commit; GitHub checked the synthesized merge ref, whose combined instruction edits were not formatted.
**Gap:** Local hooks validated the branch head, while pull request CI validated a newer merge result without an earlier signal that the base branch had advanced across the same generated/instruction surface.
**Suggests:** Surface base-branch drift before the expensive pre-push suite, or add a fast merge-ref-equivalent formatting check when changed files overlap the updated base.

Evidence: local `pnpm run format:check` passed; GitHub Actions run `31276256891`, job `93150198446`, reported only `AGENTS.md`; `git rev-list --left-right --count HEAD...origin/main` returned `1 1`.
