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

The PR lane restores dependency caches into job-local directories and uses Nx's
native HTTP client with read-only credentials for deterministic task outputs.
The [task-interface binding](../../docs/guides/repository-task-interface.md) owns
input and evidence semantics; [Nx in AXM](../tools/nx.md) owns client setup and
bypass. Missing
configuration and fork runs disable remote access. Scheduled source assurance
re-executes with both Nx caches bypassed. Dependency caches are not test evidence;
E2E leaves remain fresh even when their build prerequisites are cached.
The shared mise action also restores the main toolchain cache in proposed-change
jobs; only runs on `main` save a new copy.

Release-candidate, scheduled and manual full verification runs workspace and
E2E partitions alongside one another. Ordinary main pushes do not repeat the
complete accepted source gate.
Parallelism inside each machine remains bounded by its resources; more jobs
must not weaken required checks or share mutable test state. Actions job timing
and runner minutes establish observed performance, not configured concurrency.

[Reproduce AXM Linux CI](../runbooks/reproduce-linux-ci.md) owns recovery.
Repository workflow maintainers own job configuration. GitHub owns hosted-runner
provisioning; account limits and billing belong to the provider record.

## Maintenance and verification

Review this record when setup, runner selection, caches, or verification changes.
Workflow runs own revision-specific hosted evidence; this record does not
claim live cache adoption or measured efficiency gains.
Documentation maintenance follows the [adoption declaration](../README.md).
