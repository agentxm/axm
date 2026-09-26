---
observed_at: "2026-09-26T02:18:27Z"
session: "c72a"
area: "filesystem permissions and dependency setup"
---

# A permission change forced the active AXM worktree to move

## Context

The AXM implementation had 35 verified commits on an isolated public worktree, with the next change in progress.

## Friction

The session's writable roots changed so that the active public worktree became read-only. A new worktree under `/tmp` accepted the in-progress patch, but `pnpm install --offline --frozen-lockfile` lacked an `eslint-import-resolver-typescript@4.4.5` tarball. An online install encountered npm registry DNS failures. Copying the existing dependency tree allowed pnpm commands to run after its workspace state was updated, but the fresh `registry-client:generate:registry-client` target produced no OpenAPI output and failed its `IsoDateTimeString` anchor check.

## Cost / impact

The worktree and dependency setup had to be repeated. Normal workspace test verification remains unavailable in the new worktree at this point.

## Outcome

The 35 commits and progress record remained intact. The in-progress patch was moved to a separate writable worktree; focused verification is still blocked by the generator failure.

## Evidence

`ERR_PNPM_NO_OFFLINE_TARBALL`, npm registry DNS lookup failures, and `generate-registry-client: IsoDateTimeString anchors not found in generated output` were observed. The generator's child process exited with status 0 and zero stdout bytes.
