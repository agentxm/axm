---
subject: axm-cli-interactions
key: no-explicit-workspace-root
date: 2026-08-08
kind: workaround
status: open
---

**Expected:** Running the source CLI from a temporary directory while resolving dependencies from the repository would initialize and mutate the temporary workspace.
**Actual:** `pnpm --dir /home/exedev/Code/agentxm/axm exec bun ...` changed the effective working directory to the repository, so `axm setup` and `axm knowledge install` mutated the repository workspace instead of the temporary directory.
**Gap:** The source-development invocation needed dependency resolution from the repository and workspace resolution from another directory, but AXM exposed no explicit workspace-root option and the package-manager wrapper coupled both concerns.
**Suggests:** Document a source-development invocation that preserves the caller workspace, or provide an explicit workspace-root option for controlled automation and smoke tests.

Evidence: setup output named `/home/exedev/Code/agentxm/axm/.axm/settings.json`; the Knowledge entry changed from workspace authority to registry authority and required `axm adopt` to restore it.
