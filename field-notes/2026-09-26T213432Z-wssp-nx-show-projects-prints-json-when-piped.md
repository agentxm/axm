---
observed_at: "2026-09-26T21:34:32Z"
session: "wssp"
area: "step verification commands"
---

# The planned project-count check reads `nx show projects` as one line per project

## Context

The agent session scaffolded `workspace-kernel`, `extension-kinds`, and `workspace-features` and ran the step's verification chain, which ends with `pnpm exec nx show projects | grep -E '^(workspace-kernel|extension-kinds|workspace-features)$' | wc -l | grep -qx 3`.

## Friction

With the output exports the repository requires (`NX_TUI=false`, `NX_DEFAULT_OUTPUT_STYLE=static`, `NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false`) and stdout piped, `nx show projects` printed a single JSON array instead of one project name per line, so the anchored `grep` matched nothing and the chain exited 1 although all three projects existed.

## Cost / impact

The verification chain failed on its last link after install, sync, and sync check had passed. The agent re-ran the listing to find out why.

## Outcome

`pnpm exec nx show projects --json=false` prints one name per line; with it the same `grep | wc -l | grep -qx 3` check exits 0. The JSON array also lists all three projects.

## Evidence

`pnpm exec nx show projects | cat -A` printed `["cli-maintenance","registry-access",...,"workspace-kernel","extension-kinds",...]$` on one line. `nx show projects --help` lists `--json  Output JSON.  [boolean]`.
