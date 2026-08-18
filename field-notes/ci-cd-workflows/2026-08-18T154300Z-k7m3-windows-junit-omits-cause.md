---
id: 2026-08-18T154300Z-k7m3
subject: ci-cd-workflows
key: windows-junit-omits-cause
observed_at: "2026-08-18T15:43:00Z"
session: s8k2m4
kind: friction
status: open
---

**Expected:** A failed native Windows lifecycle job should preserve the platform error that caused a mutation step to fail in its uploaded JUnit diagnostics.
**Observed:** The default machine-output result and JUnit failure included only the wrapped canonical-copy message; the underlying platform cause was absent from both the artifact and failed job log.
**Impact:** The same Windows job was rerun once to distinguish a transient failure from a deterministic one, but the repeated failure still could not identify the filesystem error class.
**Recovery:** Run the Windows contract's machine-output commands with `--verbose`, which includes redacted failed-step cause chains in the JUnit-captured output.
**Detected by:** Inspection of the uploaded Windows JUnit artifact and the completed job's failed-step log.
**Observed factors:** Both attempts failed at the same full-sync materialization step; the earlier instruction and MCP lifecycle phases passed.
**Suggests:** Make diagnostic verbosity an explicit invariant of maintained platform-contract jobs.

Evidence: Both CI attempts reported `Failed to copy skill files` without a nested cause despite successful diagnostic artifact publication.
