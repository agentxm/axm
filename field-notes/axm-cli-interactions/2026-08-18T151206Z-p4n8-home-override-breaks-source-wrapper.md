---
id: 2026-08-18T151206Z-p4n8
subject: axm-cli-interactions
key: home-override-breaks-source-wrapper
observed_at: "2026-08-18T15:12:06Z"
session: s8k2m4
kind: workaround
status: open
---

**Expected:** The repository's `scripts/axm-local` wrapper should run a diagnostic command while `HOME`, `USERPROFILE`, and `AXM_USER_HOME` point at an isolated test home.
**Observed:** mise reported that Bun was not a valid shim and exited before AXM started.
**Impact:** The local MCP lifecycle reproduction was delayed by one failed invocation and required bypassing the wrapper; elapsed time was not measured.
**Recovery:** Resolve Bun with `mise which bun` before overriding home variables, then invoke the already-built CLI with that absolute executable.
**Detected by:** Nonzero source-wrapper invocation before any AXM output.
**Observed factors:** The wrapper succeeds under the session's normal home; the failure occurred after setting all home variables to the isolated directory.
**Hypothesis:** mise locates its installed tool records relative to the effective home while its shim remains on `PATH`.
**Suggests:** Provide or document a wrapper-safe way to isolate AXM user state without changing mise's home lookup.

Evidence: mise emitted `bun is not a valid shim` and recommended reinstalling the tool; AXM did not start.
