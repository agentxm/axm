---
id: 2026-08-25T024543Z-11d9a6
subject: axm-cli-interactions
key: registry-error-request-id-not-supplied
observed_at: "2026-08-25T02:45:43Z"
session: 194278da3c72
kind: gap
status: open
---

**Expected:** `pnpm axm:local update --json` should supply the request ID named by its registry-error suggestion.
**Observed:** The error and response metadata supplied no request ID.
**Impact:** The suggested support identifier was unavailable; inspecting the command result required one extra step.
**Recovery:** No recovery was attempted; the request-ID inspection completed.
**Detected by:** Inspection of the complete JSON-lines and final JSON error output.
**Observed factors:** Local registry request; retryable HTTP 500; three attempts exhausted at the attempt limit.
**Diagnostic evidence:** Exit 10; code `internal`; `GET http://localhost:4300/v1/extensions/@craigsmitham/packs/qrspi`; response status 500; request ID: not supplied; replay safety: safe.
**Hypothesis:** The suggestion is emitted even when the registry response does not expose a request identifier.
**Suggests:** Include a request ID in the structured error or omit request-ID advice when none is available.

Evidence: The suggestion said to report the failure with the request ID, while the complete retained output contained no request-ID field or value.
