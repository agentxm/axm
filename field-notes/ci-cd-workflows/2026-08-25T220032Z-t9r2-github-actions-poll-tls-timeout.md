---
id: 2026-08-25T220032Z-t9r2
subject: ci-cd-workflows
key: github-actions-poll-tls-timeout
observed_at: "2026-08-25T22:00:32Z"
session: unknown
kind: workaround
status: open
---

**Expected:** `gh run view` should return the current state of GitHub Actions run
`32903624209` while monitoring the exact merge-commit release gate.
**Observed:** One read-only poll exited 1 with a `net/http: TLS handshake timeout`
while requesting the run from `api.github.com`.
**Impact:** One status poll was delayed and one additional read-only poll was
required; the workflow run itself was unaffected.
**Recovery:** Repeating the same read-only query once succeeded and confirmed the
run remained pending. Release work continued.
**Detected by:** The preserved `gh run view` process result.
**Observed factors:** The failed command was a read-only GitHub Actions status
query; the immediately following query succeeded against the same run ID.
**Diagnostic evidence:** Process exit status `1`; error class
`net/http: TLS handshake timeout`; request method `GET`; host `api.github.com`;
workflow run `32903624209`; response status and request ID were not supplied.
**Hypothesis:** A transient network or GitHub API transport failure; unknown.

Evidence: The first poll returned no workflow result and the quoted transport
error. The next poll exited 0 and returned `status: pending` with no jobs yet.
