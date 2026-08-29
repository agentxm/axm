---
id: 2026-08-29T131408Z-r9k2
subject: ci-cd-workflows
key: empty-preview-reported-previewed
observed_at: "2026-08-29T13:14:08Z"
session: r9k2
kind: workaround
status: open
---

**Expected:** After the Windows lifecycle removes its final managed skill, `sync --preview --fail-on-change` should report a converged `no-op` result.
**Observed:** Job `99104540404` in run `33254012790` reached the final assertion with exit 0, an empty unit list, zero counts, and the message `Workspace materialization is up to date`, but labeled the outcome `previewed`.
**Impact:** Pull request 214 remained blocked after the earlier inline MCP regression was corrected, requiring another diagnosis and CI cycle.
**Recovery:** Download the Windows test-results artifact, replay the lifecycle locally with the platform guard relaxed, and make an empty preview derive `no-op` while non-empty previews continue to derive `previewed`.
**Detected by:** GitHub pull-request CI and the downloaded Allure/JUnit diagnostic artifact.
**Observed factors:** The failing command used both `--preview` and `--fail-on-change`; the resolved result contained no units and no divergence; the repository's machine-output contract says a converged assertion returns `no-op`.
**Diagnostic evidence:** Windows lifecycle job exit status 1; assertion at line 301; received outcome `previewed`; counts total 0; local replay reproduced the same result before the correction and passed afterward.
**Hypothesis:** Outcome derivation treated every preview as `previewed`, including empty plans emitted through the no-op helper.

Evidence: GitHub Actions job `99104540404`, artifact `test-results-windows-workspace-10864f1f57a74012af04e1fea8e31a9677af7674`, and the local lifecycle replay.
