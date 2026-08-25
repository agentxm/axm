---
id: 2026-08-25T022055Z-c8x4p2
subject: axm-cli-interactions
key: source-cli-stale-dist-export
observed_at: "2026-08-25T02:20:55Z"
session: c8x4p2
kind: blocked
status: open
---

**Expected:** Committing the clean merge of current `origin/main` into the CLI
campaign branch should let the repository pre-commit hook run its documented
strict AXM lint gate.
**Observed:** The hook's `./scripts/axm-local lint --view git-index --strict`
invocation failed before lint ran because source CLI code imported
`surfaceRestorationIncomplete`, which was absent from
`packages/core/dist/src/unstable/workspace/index.js`.
**Impact:** The first merge-commit attempt failed and verification could not
continue without an additional build step; elapsed time was not measured.
**Recovery:** Build `core` through its repository target, then retry the merge
commit; recovery had not yet run when captured.
**Detected by:** The Husky pre-commit hook's non-zero exit and Bun named-export
error.
**Observed factors:** The branch had just merged current `origin/main`; the
working tree's source and staged index contained the lifecycle changes; the
documented local launcher runs CLI source while package exports resolve core
through `dist`.
**Diagnostic evidence:** Failing process: `git commit --no-edit`; process exit:
1; failing command: `./scripts/axm-local lint --view git-index --strict`;
runtime: Bun 1.3.14 on macOS arm64; affected export:
`surfaceRestorationIncomplete`; request or correlation ID: not supplied;
attempt count: 1; retryability: safe after a repository-backed core build;
retry stop reason: source CLI and built core exports differed.
**Hypothesis:** Built core output is stale relative to CLI source.
**Suggests:** Make the documented source launcher establish or diagnose the
required built-package state before command dispatch.

Evidence: the hook exited 1 with `SyntaxError: Export named
'surfaceRestorationIncomplete' not found` from
`packages/core/dist/src/unstable/workspace/index.js`; lint produced no findings
because command dispatch never began.
