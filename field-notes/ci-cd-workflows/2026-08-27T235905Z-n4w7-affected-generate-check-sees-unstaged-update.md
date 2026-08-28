---
id: 2026-08-27T235905Z-n4w7
subject: ci-cd-workflows
key: affected-generate-check-sees-unstaged-update
observed_at: "2026-08-27T23:59:05Z"
session: unknown
kind: workaround
status: open
---

**Expected:** `pnpm run ci:affected` would validate the reviewed AXM-managed
extension update before it was staged. **Observed:** The gate completed its
generation tasks, then `generate:check` printed the intended unstaged managed
extension diff and exited 1. **Impact:** The affected gate failed once and the
same validation must run again after staging. **Recovery:** Stage the reviewed
managed update and rerun the repository's commit validation. **Detected by:**
The repo-backed affected verifier's process result. **Observed factors:** Public
AXM repository on `main`; the managed extension update was intentionally
unstaged; AXM lint, sync convergence, formatting, source hygiene, and the Gen
Stack mechanical check had already passed; run duration was 15.2 seconds.
**Diagnostic evidence:** Top-level exit status 1; failing command
`pnpm run generate:check`; failed target `axm:verify-affected`; no retry was
reported. **Hypothesis:** The generated-artifact check compares all unstaged
changes instead of isolating drift created by generators.

Evidence: The verifier reported successful generation for both projects, then
emitted the pre-existing managed extension diff and returned exit 1.
