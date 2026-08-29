---
id: 2026-08-29T124901Z-r9k2
subject: axm-cli-interactions
key: home-override-breaks-mise-node-shim
observed_at: "2026-08-29T12:49:01Z"
session: r9k2
kind: workaround
status: open
---

**Expected:** An isolated user-scope CLI smoke test could set `HOME` and `AXM_USER_HOME` to a temporary directory while invoking the already built CLI with `node`.
**Observed:** The exe.dev VM's mise `node` shim resolved its installation through the overridden `HOME`, reported that `node` was not a valid shim, and none of the CLI commands ran.
**Impact:** The first smoke-test result was invalid and required a corrected rerun.
**Recovery:** Resolve the concrete Node executable with `mise which node` before overriding the simulated user home, enable strict shell failure handling, and invoke that absolute executable.
**Detected by:** Direct CLI smoke-test output.
**Observed factors:** The repository build succeeded; only the command-specific user-home override changed; all three attempted CLI invocations emitted the same mise shim error.
**Diagnostic evidence:** Mise version `2026.7.17` reported `node is not a valid shim`; the corrected invocation completed setup, add, and uninstall successfully.
**Hypothesis:** The shim derives its tool installation root from `HOME`, so replacing `HOME` also changes the shim's lookup context.

Evidence: The failed isolated invocation and the successful rerun using the concrete executable returned by `mise which node`.
