---
__default__: minor
---

Publish from GitHub Actions without a stored secret. In a job granted `permissions: id-token: write`, AXM exchanges the job's GitHub Actions ID token, requested for the default Registry's origin, for a short-lived workload token scoped to the matching trusted publisher, once per invocation, only when a command needs a credential, and after `AXM_TOKEN` and `AXM_TOKEN_FILE`; reads that need no credential stay anonymous, and `AXM_TRUSTED_PUBLISHING=0` turns the exchange off. `axm whoami` names the trusted publisher, `axm token --output token` writes the workload token, and a job the Registry cannot accept fails with `auth_required` naming the missing permission or trusted publisher. A refused scope or resource limit on a workload token now points at the trusted publisher's permissions, and error reports redact AgentXM session, refresh, personal access, and workload tokens wherever they appear.
