---
id: 2026-08-29T141252Z-p4r7
subject: axm-cli-interactions
key: pre-push-fresh-worktree-projections-missing
observed_at: "2026-08-29T14:12:52Z"
session: 01a04d68-909f-7761-ad3b-bc2452fd648a
kind: blocked
status: open
---

**Expected:** A clean isolated worktree whose staged-index lint and full pre-commit verification passed should push without requiring additional workspace projections.
**Observed:** `git push origin HEAD:main` exited 1 because the pre-push `./scripts/axm-local lint --strict` reported missing gitignored `CLAUDE.md` and `docs/CLAUDE.md` instruction projections.
**Impact:** The requested push was blocked and required one projection-regeneration step plus a push retry.
**Recovery:** Run the reported `./scripts/axm-local lint --fix`, verify the worktree remains clean apart from this note, and retry the push.
**Detected by:** The repository pre-push hook.
**Observed factors:** The work used a fresh linked worktree; staged AXM lint, Gen Stack checks, generation checks, format, lint, typecheck, build, unit tests, and E2E had passed before the push.
**Diagnostic evidence:** Exit status 1; rule `workspace/instructions-target-current`; affected targets `./CLAUDE.md` and `./docs/CLAUDE.md`; both findings were reported auto-fixable.
**Hypothesis:** The pre-push hook depends on gitignored workspace projections that are not materialized by checkout or the pre-commit verification path.
**Suggests:** Materialize required projections during workspace setup or make the pre-push check derive them without mutating a fresh worktree.
