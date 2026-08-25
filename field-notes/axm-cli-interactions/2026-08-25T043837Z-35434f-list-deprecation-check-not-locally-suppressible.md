---
id: 2026-08-25T043837Z-35434f
subject: axm-cli-interactions
key: list-deprecation-check-not-locally-suppressible
observed_at: "2026-08-25T04:38:37Z"
session: unknown
kind: gap
status: open
---

**Expected:** A local-only `axm list --json` inspection could suppress the default Registry deprecation check with a discoverable flag.
**Observed:** `axm list --json --no-deprecated-check` exited 2 with usage code `usage` and detail `Unrecognized flag: --no-deprecated-check in command axm list`.
**Impact:** The intended local read did not run and required a different inspection path; one invocation was repeated.
**Recovery:** Used the rebuilt CLI's `lint --json` result and direct workspace evidence instead; the implementation task continued.
**Detected by:** Structured CLI error output and process exit status.
**Observed factors:** AXM CLI 0.27.17; `list` performs a Registry deprecation check by default; the attempted flag was unavailable.
**Diagnostic evidence:** Exit status 2; error code `usage`; no request or correlation ID was supplied.
**Hypothesis:** The list surface has no local-only mode even though its base inventory is local workspace state.
**Suggests:** Consider a documented local-only list option or avoid the remote check unless deprecation/outdated assessment is requested.

Evidence: command surface, rejected flag, structured usage error, exit status, and the observed default remote check.
