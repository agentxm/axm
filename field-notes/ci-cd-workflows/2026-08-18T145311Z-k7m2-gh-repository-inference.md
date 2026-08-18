---
id: 2026-08-18T145311Z-k7m2
subject: ci-cd-workflows
key: gh-repository-inference
observed_at: "2026-08-18T14:53:11Z"
session: s8k2m4
kind: workaround
status: open
---

**Expected:** `gh run list` in the AXM checkout should identify the repository and list the CI run for the pushed commit.
**Observed:** GitHub CLI reported that no configured remote points to a known GitHub host and asked for repository or authentication context.
**Impact:** CI observation was delayed by one failed query and required an explicit repository argument; elapsed time was not measured.
**Recovery:** Retry GitHub CLI commands with `--repo agentxm/axm`; the original task continued.
**Detected by:** Nonzero `gh run list --commit 85aaae37 --workflow CI` result.
**Observed factors:** The push to `https://github.com/agentxm/axm.git` succeeded immediately before the query; GitHub CLI repository inference failed in this checkout.
**Hypothesis:** The checkout's configured remotes use a transport or host form that GitHub CLI does not recognize.
**Suggests:** Document or wrap explicit `--repo agentxm/axm` usage for CI inspection in this checkout.

Evidence: GitHub CLI emitted `failed to determine base repo: none of the git remotes configured for this repository point to a known GitHub host`.
