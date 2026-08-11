---
subject: axm-cli-interactions
key: pack-install-underreports-agent-coverage
date: 2026-08-10
kind: gap
status: open
---

**Expected:** Installing a pack with skill members into a workspace configured for Claude Code would report Claude Code among the materialized coding-agent targets.
**Actual:** Each `axm packs install ... --yes --json` result warned that no coding-agent targets were materialized, while the corresponding `.claude/skills/*` projections existed afterward as symlinks to the canonical skill content.
**Gap:** The applied pack plan's reported installation coverage omitted projections that its nested member operations materialized.
**Suggests:** Include nested pack-member artifacts when computing installation coverage, or avoid reporting zero coverage when the transaction materialized agent projections.

Evidence: AXM `0.26.0` at `61d000b92d13a5ad2922ca6408d62071cd0b9f2a`; isolated local-registry reproduction; all three pack installs exited successfully; `readlink` confirmed the resulting Claude Code skill projections.
