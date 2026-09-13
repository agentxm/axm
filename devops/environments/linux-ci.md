---
type: Environment
title: AXM Linux CI
description: Native hosted Linux verification, cache reuse, and trust boundaries.
status: draft
uses-provider:
  - target: ../providers/github.md
    scope: Ephemeral Linux runners, Actions cache, and workflow control
---

# AXM Linux CI

Linux verification uses standard GitHub-hosted runners with the repository
Node, pnpm, and Bun toolchain from `mise.toml`. The shared setup action installs
those tools and native prerequisites. CI does not build or consume a custom
execution image. Workflow YAML owns job membership and resource limits.

PR checks and trusted main checks run on separate ephemeral machines. Untrusted
PR code receives no publication or production authority. Release jobs retain
their exact-source, artifact and permission gates; native Windows and macOS
verification remain separate evidence.

The PR lane restores pnpm and Nx caches into job-local directories. Nx cache
keys include the toolchain, lockfile and source revision; restored results remain
subject to Nx provenance checks. Dependency caches are not test evidence.
E2E leaves remain fresh even when their build prerequisites are cached.

Main workspace verification runs alongside the existing E2E partitions.
Parallelism inside each machine remains bounded by its resources; more jobs
must not weaken required checks or share mutable test state. Actions job timing
and runner minutes establish observed performance, not configured concurrency.

[Reproduce AXM Linux CI](../runbooks/reproduce-linux-ci.md) owns recovery.
Repository workflow maintainers own job configuration. GitHub owns hosted-runner
provisioning; account limits and billing belong to the provider record.

## Maintenance and verification

Review this record when setup, runner selection, caches, or verification changes.
The source describes the intended migration; live hosted execution and retirement
of the previous self-hosted registration require separate delivery evidence.
Documentation maintenance follows the [adoption declaration](../README.md).
