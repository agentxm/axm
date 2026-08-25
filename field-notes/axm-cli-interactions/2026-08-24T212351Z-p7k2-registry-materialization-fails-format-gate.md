---
id: 2026-08-24T212351Z-p7k2
subject: axm-cli-interactions
key: registry-materialization-fails-format-gate
observed_at: "2026-08-24T21:23:51Z"
session: fna2m9
kind: workaround
status: open
---

**Expected:** `axm update @craigsmitham/packs/field-notes` should materialize registry packages that pass this repository's required pre-commit verification.
**Observed:** AXM updated the pack successfully and `axm lint` and `axm sync --preview --fail-on-change` passed, but the subsequent commit failed because `pnpm exec nx format:check` reported 13 materialized field-notes files as unformatted.
**Impact:** One commit attempt failed; progress required an additional formatting pass and verification retry.
**Recovery:** Run the repository formatter over the reported managed files, restage them, and retry verification; the rollout was not yet complete when captured.
**Detected by:** The repository's Husky pre-commit hook running `pnpm exec nx run axm:verify-affected --outputStyle=static`.
**Observed factors:** AXM CLI 0.27.17; `@craigsmitham/packs/field-notes` update completed with `outcome: applied`; AXM lint returned zero findings; workspace sync preview returned `outcome: no-op`; the format gate listed JSON, Markdown, and evaluation files under the installed field-notes packages.
**Diagnostic evidence:** Failing process: `git commit -m "chore: update field-notes guidance"`; process exit: 1; failing task: `axm:verify-affected`; failing command: `pnpm exec nx format:check`; reported status: non-zero; affected artifact: installed `@craigsmitham` field-notes pack members; request or correlation ID: not supplied; retryability: safe after formatting; attempt count: 1; retry stop reason: repository format gate failed.
**Hypothesis:** The published package bytes and this repository's Prettier policy are not aligned.
**Suggests:** Include consumer-repository formatting compatibility in publication validation or normalize registry materialization consistently.

Evidence: the update and both AXM validations succeeded before the commit hook rejected the listed managed files solely at the formatting check.
