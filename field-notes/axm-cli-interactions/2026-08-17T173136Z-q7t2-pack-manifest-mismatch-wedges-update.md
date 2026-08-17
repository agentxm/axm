---
id: 2026-08-17T173136Z-q7t2
subject: axm-cli-interactions
key: pack-manifest-mismatch-wedges-update
observed_at: "2026-08-17T17:31:36Z"
session: 3c515293-d28f-4b7e-a541-b8f8be721f20
kind: workaround
status: open
---

**Expected:** `axm update` in this workspace applies the 10-extension plan it
previewed, or reports an actionable finding the CLI can resolve.
**Observed:** apply failed with `@agentxm/packs/agent-engineering: Pack
transition left its desired member graph incomplete (internal)` and rolled
back. `axm sync` and `axm install @agentxm/packs/agent-engineering` failed
identically. `axm lint` reported `workspace/desired-state-reconcilable` —
"Pack '@agentxm/packs/agent-engineering' does not currently form a
reconcilable desired-state route. Canonical state: changed." plus four
`workspace/skills-lockfile-aligned` errors.
**Impact:** `axm update` was unrunnable through supported commands; five failed
CLI invocations (`update` ×2 including `--debug`, `sync`, `install`, `cache
verify`) plus manual cache-archive inspection and a hand-applied file
extraction before the update could complete. Elapsed time not measured.
**Recovery:** unzipped the cached 0.5.0 pack archive over
`.axm/extensions/@agentxm/packs/agent-engineering`, then `axm sync` and
`axm update --yes` both succeeded. Task completed; `axm lint` now reports only
the pre-existing `workspace/release-age-exclude-owner-trusted` warning.
**Detected by:** `axm update --yes --non-interactive` exit failure, then
`axm lint` / `axm lint --json`.
**Observed factors:**

- `axm` 0.27.8 (`/Users/craig/.local/bin/axm`); `pnpm axm` from source at
  `c4bc0242` reproduced the same lint findings.
- On-disk `.axm/extensions/@agentxm/packs/agent-engineering/pack.json` was
  version `0.3.0` (5 knowledge deps, no skills) while `.axm/axm-lock.yaml`
  recorded `resolvedVersion: 0.5.0` and a `manifestContentIdentity` for 0.5.0.
- The cached 0.5.0 archive matching the lockfile integrity contained the
  correct `pack.json` (version 0.5.0, 1 knowledge + 4 skill deps).
- `axm cache verify` found 0 corrupt entries across 236 archives.
- `--debug` and `--verbose` added no detail beyond the `internal` message.
- Lockfile and settings changes were uncommitted at the start of the session.
- `axm outdated` and `axm prune`, listed in the `axm` skill quick reference,
  are not subcommands of 0.27.8.

**Hypothesis:** the pack write and the postcondition check in
`packages/cli/src/root/packs/graph-transition.ts`
(`validatePackGraphPostcondition`) disagree about the on-disk manifest, so a
stale `pack-manifest-content-mismatch` fails validation and rolls back the very
write that would clear it.

**Suggests:** surface the specific graph problem type and pack version delta in
the user-facing error instead of `internal`, and give the CLI a supported way to
re-materialize a pack manifest from the lockfile.

Evidence:

- `axm lint --json` finding: `ruleId: workspace/desired-state-reconcilable`,
  message `Pack '@agentxm/packs/agent-engineering' does not currently form a
reconcilable desired-state route. Canonical state: changed.`
- Error text emitted by `packages/cli/src/root/packs/graph-transition.ts:228`.
- Cached archive:
  `~/Library/Caches/axm/archives/krj7aoVGqnqERew7v6rlL0FkG4TMyPYcNVKjrFoZflb5lT8s8JgDec_gMb1feCE39UrMjuGkspvNWmzXj1g_yA.zip`
  (base64url of the lockfile integrity for pack 0.5.0).
