---
observed_at: "2026-09-30T12:58:40Z"
session: "tn5h"
area: "Bun runtime compatibility and cross-process verification"
---

# Bun userInfo follows overridden home variables

## Context

Cross-process filesystem coordination used `node:os.userInfo().homedir` to choose one namespace per operating-system account. Node-based process tests passed with different HOME values.

## Friction

The compiled Bun CLI's scope tests observed coordination directories in their disposable platform home. A bounded probe with the repository-pinned Bun 1.3.14 confirmed that `userInfo().homedir` follows HOME; Node 24.19 returned the account home. Bun Worker probes with an empty or explicitly cleared environment still inherited the parent HOME.

## Cost / impact

The Node process witness did not establish the shipped runtime's namespace independence. Delivery required another OS lookup adapter and a Bun process witness before verification could proceed.

## Outcome

The correction uses bounded operating-system account queries for Bun and keeps Node's account API. Platform verification remains pending.

## Evidence

Bun's `src/runtime/node/node_os.zig` at `bun-v1.3.14` delegates `userInfo` to `homedir`. Upstream issue https://github.com/oven-sh/bun/issues/39859 remains open. The process probes and failed built-CLI scope checks were observed during this task.
