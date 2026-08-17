---
id: 2026-08-17T201717Z-h6r4
subject: axm-cli-interactions
key: uninstall-unmanaged-knowledge-leaves-orphan
observed_at: "2026-08-17T20:17:17Z"
session: 8aa02eac-2dff-427c-b534-8fa4f1b091a3
kind: workaround
status: open
---

**Expected:** `axm uninstall @agentxm/knowledge/<name> --yes` removes the
deprecated knowledge bundle from the lockfile and from
`.axm/extensions/@agentxm/knowledge/<name>/`, matching its own preview output
("Would remove 1 knowledge bundle").

**Observed:** All three uninstalls printed the plan, then `Plan execution
failed` with `<name>: Uninstalled knowledge "<name>" has an invalid observed
postcondition (internal)`. The lockfile entries were removed and persisted; the
on-disk bundle directories were left in place. `axm knowledge uninstall
eval-engineering` reproduced the same failure, and `--debug` added no detail
beyond the same line.

**Impact:** Uninstall left partially-applied state — three bundles removed from
the lock but still on disk as untracked-by-AXM directories. `axm lint` reported
no finding about them, so the leftover state was invisible to the workspace
check. 3 failed uninstall invocations plus 1 repro plus manual `git rm -r` of 4
directories; the task did complete.

**Recovery:** Removed
`.axm/extensions/@agentxm/knowledge/{context,eval,harness,prompt}-engineering`
with `git rm -r`. `axm lint` clean afterward and `axm list --json` reports no
remaining deprecated extensions. No `axm prune` subcommand exists in the
installed CLI (0.27.x) despite the axm skill quick reference listing it.

**Detected by:** Non-zero exit and the `Plan execution failed` line, then `ls`
of the knowledge extensions directory showing the directories still present.

**Observed factors:** All four bundles were reported by `axm list --json` with
`management: "unmanaged"` and `assessment.state: "deprecated"` (each merged into
`@agentxm/knowledge/agent-engineering`, which is installed at 0.3.0).
`context-engineering` was already absent from the lockfile before this session
and `axm list` assessed it `unknown` ("Installed extension has no accepted
external resolution"). Global `axm` binary, project scope, macOS.

**Hypothesis:** `KnowledgeManager.materializeUninstall`
(`packages/core/src/unstable/knowledge/manager.ts:712`) only removes the package
root when `acceptedCanonicalObservation` is `Some`; for an unmanaged/unaccepted
observation it silently no-ops, while `isInstalled` stays observation-based, so
`runUninstallOperation`'s postcondition check
(`packages/core/src/unstable/extensions/operations.ts:623`) fails after the
settings and lock mutations have already been applied.

**Suggests:** Consider whether an unaccepted canonical observation should still
be removable, and whether a failed postcondition should leave lockfile removal
committed.

Evidence:

- `axm uninstall @agentxm/knowledge/eval-engineering --preview` → `● Would
remove 1 knowledge bundle` / `✔ + eval-engineering` / `1 to apply`
- `axm uninstall @agentxm/knowledge/eval-engineering --yes` → `✖ Plan execution
failed` / `● eval-engineering: Uninstalled knowledge "eval-engineering" has an
invalid observed postcondition (internal)`
- Same for `harness-engineering` and `prompt-engineering`.
- After the three runs: `grep -E 'eval-engineering|harness-engineering|prompt-engineering'
.axm/axm-lock.yaml` → no matches; `ls -d .axm/extensions/@agentxm/knowledge/*/`
  → all six directories still present.
- `axm prune --help` → `Unknown subcommand` (falls back to root usage).
