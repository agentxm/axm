---
subject: ci-cd-workflows
key: windows-cmd-installer-file-lock
date: 2026-08-08
kind: friction
status: open
---

**Expected:** Release installer verification would run the Windows CMD install, PATH-guidance, and checksum-preservation cases sequentially without one case retaining the installed executable.
**Actual:** The CMD install case passed, but the following PATH-guidance case failed before its assertion because Windows reported that the AXM executable was still in use by another process. The PowerShell installer job and every non-Windows installer job passed.
**Gap:** The hosted CMD verification does not consistently wait for every installer or version-probe process to release the executable before the next test replaces it.
**Suggests:** Isolate each Windows installer case in a distinct install directory or add a bounded release/retry boundary around executable replacement after spawned probes have exited.

Evidence: Release workflow run `31280963360`, job `93162287430`, passed `installs axm with cmd` and failed `prints actionable PATH guidance for cmd` with `The process cannot access the file because it is being used by another process.`
