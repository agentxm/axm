---
subject: axm-cli-interactions
key: lint-misses-generated-markdown-format
date: 2026-08-14
kind: gap
status: open
---

**Expected:** `pnpm axm lint` reporting no findings meant AXM-managed instruction output passed repository formatting.
**Actual:** `pnpm axm lint` exited 0, then `pnpm format:check:affected` exited 1 for `AGENTS.md`.
**Gap:** AXM lint did not detect Markdown formatting drift in its generated instruction region.
**Suggests:** Generate or validate instruction-region spacing consistently with the repository formatter.

Evidence: `pnpm axm lint` exited 0 with `No findings.`; `pnpm format:check:affected` exited 1 and reported `AGENTS.md`.
