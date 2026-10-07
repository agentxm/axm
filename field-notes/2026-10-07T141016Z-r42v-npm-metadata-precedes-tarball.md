---
observed_at: "2026-10-07T14:10:16Z"
session: "r42v"
area: "CLI release installation verification"
---

# Package metadata became visible before the downloadable tarball

## Context

Canonical same-tag recovery run 37633657426 completed distribution for
`cli-v0.42.0`, including Homebrew and final GitHub Release publication.
The workflow then started its hosted installation matrix.

## Friction

Clean Linux npm, pnpm, and Yarn Classic installations and macOS npm installation
failed with HTTP 404 for the `axm.sh-0.42.0.tgz` download. The exact npm version
and its integrity had already become visible before recovery was dispatched.

## Cost / impact

Four package-manager verification jobs failed despite completed distribution.
Those gates require another execution after public download availability; the
successful release and native installer checks do not replace them.

## Outcome

Independent downloads from `registry.npmjs.org` and `registry.yarnpkg.com`
subsequently returned 200. Both contained 2,606,113 bytes and matched npm's
published SHA-512 integrity. The workflow's remaining active jobs are pending
at capture; the failed package-manager checks have not yet been rerun.

## Evidence

- https://github.com/agentxm/axm/actions/runs/37633657426
- npm/pnpm URL: `https://registry.npmjs.org/axm.sh/-/axm.sh-0.42.0.tgz`.
- Yarn URL: `https://registry.yarnpkg.com/axm.sh/-/axm.sh-0.42.0.tgz`.
- Linux pnpm failure: `ERR_PNPM_TARBALL_HTTP_STATUS`.
- Linux/macOS npm failure: `E404`.
