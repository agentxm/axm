---
subject: ci-cd-workflows
key: release-prepare-worktree-enospc
date: 2026-08-12
kind: blocked
status: open
---

**Expected:** A clean release worktree could install the locked workspace dependencies before running the documented release preparation dry-run.
**Actual:** `pnpm install --frozen-lockfile` stopped while linking packages with `ERR_PNPM_ENOSPC`; the root filesystem had 10 MB free, while the primary AXM and agentxm-internal Nx caches occupied about 9.9 GB and 8.4 GB respectively.
**Gap:** The release workflow has no capacity preflight or documented cache-reclamation step, so a routine clean-worktree install can fail late after accumulated Nx artifacts fill the VM.
**Suggests:** Add a release preflight that reports insufficient free space with a documented, supported recovery command such as `pnpm exec nx reset` in cache-owning workspaces.

Evidence: `df -h /home/exedev/Code/agentxm` reported `/dev/root` at 100% with 10 MB available; `du` identified the two Nx caches; running `pnpm exec nx reset` in each workspace restored 19 GB and the same frozen install then completed successfully.
