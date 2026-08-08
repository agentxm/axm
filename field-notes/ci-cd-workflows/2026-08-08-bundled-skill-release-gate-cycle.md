---
subject: ci-cd-workflows
key: bundled-skill-release-gate-cycle
date: 2026-08-08
kind: gap
status: open
---

**Expected:** A feature branch that updates the bundled AXM skill and carries a valid CLI version plan would pass both the strict pre-commit hook and pull request CI before release preparation.
**Actual:** Advancing only the skill to the planned version made release-tag tests fail because the unreleased CLI packages still had the current version; restoring the skill's current version made `axm lint --staged --strict` reject its intentionally unpublished content before `release:prepare` could advance every package atomically.
**Gap:** The feature gate requires the bundled skill to remain release-version-consistent, while the local strict lint gate requires its changed content to have a publish baseline that the later release commit is responsible for creating.
**Suggests:** Teach the staged lint or commit workflow to recognize changed bundled-skill content covered by a valid CLI version plan, or move the atomic versioning boundary early enough that feature and release validation agree.

Evidence: GitHub Actions run `31276791151`, job `93151655204`, failed `validate-release-tag` and `resolve-release-meta` with skill `0.26.0` versus CLI packages `0.25.8`; after restoring `0.25.8`, both release-tag commands passed while the pre-commit hook stopped on `workspace/authored-content-unpublished`.
