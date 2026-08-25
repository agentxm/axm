---
id: 2026-08-25T155332Z-m4q8
subject: axm-cli-interactions
key: acquired-markdown-whitespace-diff
observed_at: "2026-08-25T15:53:32Z"
session: m4q8
kind: friction
status: open
---

**Expected:** A source-faithful fresh install could be staged without repository whitespace gates requiring changes to immutable acquired files.
**Observed:** `git diff --cached --check -- '*.md' '*.mdx'` rejected trailing whitespace and blank lines in newly source-qualified acquired Markdown copied from accepted Registry archives.
**Impact:** The migration could not pass the repository's documentation patch-integrity gate without either exempting acquired files or changing accepted bytes and invalidating their tree integrity.
**Recovery:** Declare the existing immutable-package boundary in `.gitattributes` so Git whitespace diagnostics ignore `agent_extensions/**`; completion pending verification.
**Detected by:** Staged patch integrity check after the clean AXM workspace install.
**Observed factors:** Prettier, ESLint, and lint-staged already exclude `agent_extensions`; the CI Markdown diff check did not; the affected package files are Registry-owned accepted content.
**Diagnostic evidence:** Command `git diff --cached --check -- '*.md' '*.mdx'`; exit code 2; findings named two blank-line-at-EOF cases and four trailing-whitespace lines under `agent_extensions/agentxm/`.
**Hypothesis:** Git's path-scoped `whitespace` attribute can align the remaining repository gate with the established immutable acquired-package boundary.
**Suggests:** Keep repository formatting and patch-integrity tooling consistently scoped away from AXM-acquired package trees.

Evidence: The findings occurred only in source-qualified acquired Markdown; no authored repository Markdown was named.
