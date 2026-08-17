---
id: 2026-08-17T223550Z-v2n8
subject: axm-cli-interactions
key: update-reverts-workspace-formatted-knowledge
observed_at: "2026-08-17T22:35:50Z"
session: 4ed93fb0-c3fc-40f7-a08f-c2a61c6a0087
kind: gap
status: open
---

**Expected:** `axm update` leaves an installed knowledge bundle's files alone
when its resolved version does not change. `canonical-reuse.ts` states that
after install "canonical content is workspace-owned" and "a no-op install must
not revert them by re-extracting the archive".

**Observed:** `axm update --yes` rewrote all 87 Prettier-formatted files under
`.axm/extensions/@agentxm/knowledge/agent-engineering/` back to published
bytes, with the lockfile byte-identical before and after the run
(`resolvedVersion: 0.3.0` unchanged). Reproduced twice in an isolated copy of
the workspace.

**Impact:** An 87-file spurious diff appeared in the working tree alongside a
15-file effect-v4 update, and `pnpm format:check` failed on all 87. Required
one Prettier run over the bundle to clear before committing. Any hand edit to
an installed knowledge bundle would be discarded the same way.

**Recovery:** Ran Prettier over the bundle; the diff went to zero and
`pnpm format:check` passed. The effect-v4 commit landed without the 87 files.

**Detected by:** `git status` showing 87 modified files under a bundle whose
lockfile entry was unchanged; then checksum snapshots of
`.axm/extensions/**` taken before and after `axm update` in a copied workspace.

**Observed factors:** `axm sync` on the same copied workspace rewrote zero
extension files and preserved the formatted bytes. Debug instrumentation of
`shouldReuseCanonicalInstall` during `axm update` showed `refVersion ===
lockedVersion` for every call; every knowledge call was probed at
`/var/folders/.../axm-knowledge-package-*/staged` with `exists=false`, while
rule extensions were probed at their real workspace path with `exists=true`.
`knowledge/manager.ts:295-318` materializes into a temp `staged` directory,
then renames the existing tree to `previous` and renames `staged` into place.
Instrumented source required `pnpm nx run core:build` to take effect, because
`pnpm axm` resolves `@agentxm/client-core` to `dist`.

**Hypothesis:** For knowledge extensions the reuse guard is evaluated against
the staging path rather than the installed tree, so `canonicalExists` is always
false and the guard can never fire; the subsequent rename replaces the
workspace tree wholesale.

**Suggests:** Evaluate the reuse decision against the canonical workspace path
before staging, or skip staging when the resolved version already matches the
lockfile entry.
