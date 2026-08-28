---
id: 2026-08-28T013600Z-gs75
subject: axm-cli-interactions
key: gen-stack-check-null
observed_at: "2026-08-28T01:36:00Z"
session: claude-875a3f0a
kind: gap
status: open
---

**Expected:** `./scripts/gen-stack-check` should report the separate OKF,
structural profile, and relationship projection results, or a diagnostic
failure message when the check cannot run.

**Observed:** In a fresh Git worktree of this repository, the command exited 2
and emitted only `null` on standard output with empty standard error.

**Impact:** The baseline mechanical gate for a corpus-population run was
unusable until diagnosed; the same command in the primary checkout passed.

**Recovery:** Running the packaged validator directly
(`python3 agent_extensions/.../gen-stack.py -C . check`) passed, isolating the
failure to the wrapper's pinned `axm` PATH shim; after `pnpm install` and
`pnpm build` in the worktree the wrapper also passed.

**Detected by:** Baseline `gen-stack:check` comparison between the fresh
worktree and the primary checkout.

**Observed factors:** The wrapper prepends `scripts/gen-stack-bin` (an `axm` →
`scripts/axm-local` shim) to PATH; with `axm` on PATH the packaged checker runs
`axm knowledge lint --json`; the worktree CLI failed with
`Cannot find module '@agentxm/client-core/unstable/app-error'` (unbuilt dist);
`gen_stack_profile/checks.py` then raises `InspectionFailure`
(`okf-validator-contract`), and `gen-stack.py` `_human_lines` has no branch for
a failure envelope, falling through to `json.dumps(data)` where `data` is
`null`.

**Diagnostic evidence:** Process exit status 2; result output `null`;
diagnostic output empty; direct validator invocation exit 0 in the same
worktree; renderer fall-through at the final `return json.dumps(...)` of
`_human_lines` in the packaged `gen-stack.py`.

**Hypothesis:** The human renderer drops standalone failure envelopes, hiding
the underlying `okf-validator-contract` failure whenever the pinned `axm` CLI
cannot run.

**Suggests:** Render failure envelopes in `_human_lines` (operation, failure
code, message) instead of the raw `data` fall-through.
