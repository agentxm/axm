---
id: 2026-08-25T150735Z-p3k9
subject: axm-cli-interactions
key: fresh-multi-pack-install-blocked
observed_at: "2026-08-25T15:07:35Z"
session: m4q8
kind: blocked
status: open
---

**Expected:** `axm install` would materialize every configured Pack and then render their shared projections in a workspace with no lockfile or acquired tree.
**Observed:** Four direct non-Pack extensions committed, then the first of seven configured Packs failed because the desired-state graph still reported the other six Pack manifests and resolutions unavailable; all later Pack and projection steps were blocked.
**Impact:** The fresh migration stopped partially applied with 4 installed and 8 failed, preventing a valid v6 workspace and the implementation commit.
**Recovery:** Defer shared projection rendering until all configured Pack graph transitions have committed, then rerun the fresh install; completion pending.
**Detected by:** Applied `axm install --yes --non-interactive` result.
**Observed factors:** The old lock and acquired tree had been removed intentionally; seven Registry Packs remained configured; Pack graph steps ran sequentially; the first Pack attempted shared projection while the other configured Packs were not yet materialized.
**Diagnostic evidence:** Command surface `axm install`; exit code 1; summary `Partially installed — 4 installed, 8 failed`; failure code `conflict`; problem types `pack-manifest-unavailable` and `pack-resolution-unavailable`; later steps `operation-aborted`.
**Hypothesis:** Workspace install embeds aggregate projection work inside each Pack transition instead of once after the complete configured Pack set is installed.
**Suggests:** Treat configured multi-Pack installation as one semantic closure with one trailing aggregate projection step.

Evidence: The emitted plan listed all seven Pack graph transitions as ready, but applying the first Pack failed on missing manifests and resolutions belonging to the six later configured Packs.
