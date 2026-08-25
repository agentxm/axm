---
id: 2026-08-25T150735Z-n7r2
subject: axm-cli-interactions
key: local-wrapper-registry-override
observed_at: "2026-08-25T15:07:35Z"
session: m4q8
kind: workaround
status: open
---

**Expected:** Setting `AXM_REGISTRY_URL=https://registry.agentxm.ai` would direct the local AXM wrapper to the production Registry for a fresh workspace install.
**Observed:** The wrapper continued to use `http://localhost:4300` because its default `AXM_REGISTRY_LOCATION` took precedence over the supplied URL.
**Impact:** Two install attempts stopped before workspace materialization; the second attempt repeated the first failure while testing the documented-looking URL override.
**Recovery:** Set both `AXM_REGISTRY_LOCATION` and `AXM_REGISTRY_URL` to the production Registry endpoint; the request then reached the Registry.
**Detected by:** Human-readable AXM error output.
**Observed factors:** The local wrapper defaults `AXM_REGISTRY_LOCATION` to `http://localhost:4300`; only `AXM_REGISTRY_URL` was supplied on the second attempt.
**Diagnostic evidence:** Command surface `axm install`; exit code 10; reported Registry `http://localhost:4300`; no request ID was supplied.
**Hypothesis:** The wrapper resolves its canonical Registry location independently from the compatibility URL environment variable.
**Suggests:** Make the override precedence explicit in local-wrapper help or accept either variable as the authoritative override.

Evidence: Both failed outputs named `http://localhost:4300`; supplying both Registry environment variables allowed resolution to proceed.
