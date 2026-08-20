---
id: 2026-08-20T160215Z-k3m7
subject: axm-cli-interactions
key: source-help-stale-dist-export
observed_at: "2026-08-20T16:02:15Z"
session: unknown
kind: workaround
status: open
---

**Expected:** `pnpm axm help` should run the repository CLI from source and list authoring help topics.
**Observed:** Bun stopped with `SyntaxError: Export named 'removeInstructionsGitignore' not found` from `packages/core/dist/src/unstable/agents/index.js`.
**Impact:** The required help lookup could not use the repository script; progress required a separate installed-CLI read-only lookup.
**Recovery:** Use the installed `axm` executable for help and continue the extension-authoring task.
**Detected by:** Exit 1 from `pnpm axm help`.
**Observed factors:** Bun 1.3.14 on macOS arm64; the missing export was requested from local `packages/core/dist`.
**Hypothesis:** Source execution resolved inconsistent generated build output.

Evidence: `pnpm axm help` invoked `bun packages/cli/src/main.ts help` and failed before rendering help.
