---
id: 2026-08-17T223551Z-v2n9
subject: axm-cli-interactions
key: axm-help-transient-module-resolution-failure
observed_at: "2026-08-17T22:35:51Z"
session: 4ed93fb0-c3fc-40f7-a08f-c2a61c6a0087
kind: workaround
status: open
---

**Expected:** `pnpm axm update --help` prints the command's help, as
`pnpm axm sync` and `pnpm axm --help` had already done successfully earlier in
the same session with no intervening build or dependency change.

**Observed:** The command exited 1 with
`error: Cannot find module '@agentxm/client-core/unstable/app-error' from
'/Users/craig/Code/agentxm/axm/packages/cli/src/app.ts'` and
`Bun v1.3.14 (macOS arm64)`. Re-running the identical command immediately
afterward printed the help normally.

**Impact:** One retry; roughly one minute of investigation deciding whether the
failure was real before re-running. No rework beyond the retry.

**Recovery:** Re-ran the same command unchanged; it succeeded.

**Detected by:** Non-zero exit and the module-resolution error on a read-only
`--help` invocation.

**Observed factors:** `pnpm axm` runs `bun packages/cli/src/main.ts` from
source while `@agentxm/client-core` resolves through package exports to
`packages/core/dist/`. No build, install, or file edit ran between the failing
and succeeding invocations. A `pnpm nx run core:build` was run later in the
session for unrelated reasons.

**Hypothesis:** unknown.
