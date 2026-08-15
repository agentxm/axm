---
subject: axm-cli-interactions
key: user-scope-lockfile-version-mismatch
date: 2026-08-15
kind: blocked
status: open
---

**Expected:** `pnpm axm list --scope user --deprecated --json` would list deprecated user extensions.
**Actual:** The command exited 9 because `/Users/craig/.axm/axm-lock.yaml` has `lockfileVersion: 3`, while the repository CLI expects version 4.
**Gap:** The CLI cannot inspect user state created with the prior lockfile schema, and its error provides no migration path.
**Suggests:** Detect the prior schema and report the exact supported upgrade or migration command.

Evidence: `pnpm axm list --scope user --deprecated --json`; exit 9; `LockfileDecodeError: lockfileVersion: Expected 4`.
