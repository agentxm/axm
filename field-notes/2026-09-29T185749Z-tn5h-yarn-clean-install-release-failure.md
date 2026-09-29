---
observed_at: "2026-09-29T18:45:29Z"
session: "tn5h"
area: "AXM stable release verification"
---

# Yarn clean install failed after CLI 0.37.0 publication

## Context

The canonical `cli-v0.37.0` publish workflow had distributed its release assets and was checking clean installations of the published CLI.

## Friction

The Ubuntu Yarn Classic verification failed when `axm --version` loaded `@effect/platform-node-shared@4.0.0-rc.118` beneath `@effect/platform-node@4.0.0-rc.117` alongside `effect@4.0.0-rc.117`. The nested package imported `effect/dist/process/ChildProcess.js`, which rc.117 does not provide. The publish workflow concluded failure despite successful distribution and other package-manager checks.

## Cost / impact

Completion of the public release and the private adoption was delayed. A new patch release is needed because version 0.37.0 is immutable.

## Outcome

A revised local CLI tarball bundles the tested platform-node pair. Clean local Yarn, npm, and pnpm installs of that tarball each reported `0.37.0`. The public patch release remains in progress.

## Evidence

Canonical publish run `https://github.com/agentxm/axm/actions/runs/36612449987`; failing Yarn job `109563173165`; local clean-install command `corepack yarn@1.22.22 global add ... axm.sh@0.37.0`; `ERR_MODULE_NOT_FOUND` for `effect/dist/process/ChildProcess.js`.
