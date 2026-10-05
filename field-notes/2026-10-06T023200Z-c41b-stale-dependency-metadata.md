---
observed_at: "2026-10-06T02:32:00Z"
session: "c41b7d2e"
area: "Local dependency verification"
---

# Nx dependency metadata retained an older installed version

## Friction

After rebasing onto the security dependency candidate and running `pnpm install`, `extension-content:lint` reported smol-toml 1.8.0 against the new catalog range. Both owning package links pointed to installed 1.9.0. The lint failure persisted with the daemon disabled, project graph caching disabled, and task caching skipped.

## Outcome

Running `pnpm exec nx reset --onlyWorkspaceData` followed by the same lint target with task caching skipped passed. No dependency declarations or lint policy changed.

## Evidence

Local logs: `/tmp/skill-install-security-lint-recheck.log`, `/tmp/skill-install-security-graph-reset.log`, and `/tmp/skill-install-security-lint-reset.log`.
