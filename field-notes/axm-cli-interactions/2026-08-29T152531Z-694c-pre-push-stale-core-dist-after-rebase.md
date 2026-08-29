---
id: 2026-08-29T152531Z-694c
subject: axm-cli-interactions
key: pre-push-stale-core-dist-after-rebase
observed_at: "2026-08-29T15:25:31Z"
session: codex-694c
kind: workaround
status: open
---

# Pre-push AXM lint loaded stale core output after rebase

## Expected

The pre-push AXM lint should run against code coherent with the rebased source
revision.

## Observed

After rebasing onto `origin/main`, the pre-push hook failed because the AXM
entrypoint imported `desiredStateProblemsText` from the core distribution, but
that named export was absent from the existing distribution output even though
the rebased source exported it.

## Impact

The push was blocked and required an undocumented core rebuild before the hook
could proceed.

## Recovery

Ran the repository-backed `core:build` Nx target, then reran
`pnpm axm:local lint --strict`; lint completed with no findings.

## Detected by

The repository pre-push hook.

## Observed factors

- The local commit had just been rebased onto a newer `origin/main` revision.
- The source and existing package distribution exposed different named exports.
- Bun reported the missing named export while loading AXM.

## Diagnostic evidence

```text
SyntaxError: Export named 'desiredStateProblemsText' not found in module
'packages/core/dist/src/unstable/workspace/index.js'.

Bun v1.3.5
husky - pre-push script failed (code 1)
```

## Hypothesis

The pre-push AXM lint can consume stale built package output after an upstream
source change because the hook does not first establish the required build
dependency.

## Suggests

Make the pre-push AXM lint path establish coherent package output, or run it
through a repository target whose declared dependencies do so.

## Evidence

- Initial `git push origin main`: exit 1 in the pre-push hook.
- `pnpm nx run core:build --outputStyle=static`: rebuilt core output.
- `pnpm axm:local lint --strict`: exit 0 with no findings.
