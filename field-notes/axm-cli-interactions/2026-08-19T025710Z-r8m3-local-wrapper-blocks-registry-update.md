---
id: 2026-08-19T025710Z-r8m3
subject: axm-cli-interactions
key: local-wrapper-blocks-registry-update
observed_at: "2026-08-19T02:57:10Z"
session: s8k2m4
kind: workaround
status: open
---

**Expected:** Previewing a configured Registry extension update through the repository's local AXM wrapper would resolve the available version or identify the supported Registry prerequisite.
**Observed:** `./scripts/axm-local update @agentxm/knowledge/agentxm --preview --non-interactive --json` retried `http://localhost:4300` three times and exited 8 because no local Registry was running.
**Impact:** The required managed-workspace update was delayed while a supported Registry route was identified; one command attempt was unusable.
**Recovery:** Pending; continue with an explicitly configured supported Registry location or the documented local Registry workflow.
**Detected by:** The typed `network` error envelope and request metadata from the update preview.
**Observed factors:** The repository wrapper defaulted `AXM_REGISTRY_LOCATION` and `AXM_REGISTRY_URL` to `http://localhost:4300`; the checkout's configured extension source is Registry-backed; no service accepted the request at that address.
**Hypothesis:** The local wrapper is optimized for Registry development and does not surface how a repository-maintenance update should select the published Registry.
**Suggests:** Document the supported environment override for dogfooding updates that intentionally target the published Registry.

Evidence: exit 8; `code: network`; request `GET http://localhost:4300/v1/extensions/@agentxm/knowledge/agentxm`; request policy exhausted 3 of 3 attempts.
