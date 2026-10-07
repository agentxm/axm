---
observed_at: "2026-10-07T20:40:10Z"
session: "ec304b"
area: "Nx affected verification and worktree cache ownership"
---

# A missing shared cache directory interrupted affected verification

## Context

Running the repository's normal `pnpm run verify:affected` workflow from an
isolated worktree while other worktrees also existed on the workstation.

## Friction

Nx ended the attempt with `ENOENT` for a file under
`~/.nx/.../cache/terminalOutputs`. The cause of the directory's disappearance
was not established. The error prevented the workflow from producing complete
verification evidence.

## Cost / impact

The affected workflow needed another attempt. An isolated cache also required
recomputing tasks that had previously been cached.

## Outcome

Inspection of the installed Nx 23.2.1 implementation confirmed support for
`NX_CACHE_DIRECTORY`. Giving this delivery its own cache directory allowed
verification to advance past the cache failure. Subsequent test failures were
recorded separately; cache isolation does not establish that those tests pass.

## Evidence

- Normal affected-workflow output: missing `cache/terminalOutputs` path,
  `ENOENT`.
- Supported cache selector: `NX_CACHE_DIRECTORY` in
  `node_modules/nx/dist/src/utils/cache-directory.js`.
