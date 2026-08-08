---
subject: axm-cli-interactions
key: adopt-format-invalidates-trust
date: 2026-08-08
kind: gap
status: open
---

**Expected:** Adopting a registry Knowledge bundle into workspace authorship would leave canonical content ready for the repository commit hook.
**Actual:** `axm adopt @agentxm/knowledge/agentxm` established a clean authored trust baseline, then the commit hook's Prettier pass compacted the manifest's `keywords` array and `axm lint --staged --strict` reported the bundle as `locally-modified`.
**Gap:** Adoption preserved the immutable registry bytes while the authored workspace immediately subjected those bytes to a different formatting policy, so the new baseline could not survive the next normal commit.
**Suggests:** Format authored manifests before establishing the adoption baseline, or explicitly report and reconcile repository formatting policy during adoption.

Evidence: `axm adopt @agentxm/knowledge/agentxm --yes --non-interactive --json` succeeded; the subsequent commit hook failed on `workspace/knowledge-state-valid`; publishing the formatted manifest as `0.2.1` restored a stable baseline.
