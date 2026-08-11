---
subject: ci-cd-workflows
key: bundled-skill-staged-lint-blocks-help-change
date: 2026-08-11
kind: blocked
status: open
---

**Expected:** A verified feature commit that changes generated AXM Knowledge help and includes a valid CLI version plan should pass the documented pre-commit workflow.
**Actual:** `axm lint --staged --strict` rejected the commit because the generated bundled AXM skill differed from its last publication baseline, before release preparation could advance the fixed release group and bundled skill together.
**Gap:** The staged lint gate still treats release-planned bundled-help changes as unplanned unpublished authored content, reproducing the release-gate cycle already observed on 2026-08-08.
**Suggests:** Make the staged commit gate recognize bundled-skill changes covered by a valid fixed-group version plan, while retaining strict blocking for unrelated unpublished content.

Evidence: `git commit -m "fix: support relative Knowledge resources"` exited 1 in the pre-commit hook after `workspace/authored-content-unpublished` named `.axm/extensions/@agentxm/skills/axm`; the branch had already passed repository-wide format, typecheck, lint, build, unit, generated-output, and distribution E2E gates.
