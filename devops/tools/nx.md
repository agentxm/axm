---
type: Tool
title: "Nx in AXM"
description: "Local adoption and source authorities for AXM task orchestration, caching, and affected selection."
status: draft
runs-in:
  - ../environments/native-development.md
  - ../environments/linux-ci.md
  - ../environments/native-platform-ci.md
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# Nx in AXM

Nx is the workspace-installed engineering instrument for project tasks,
dependency ordering, cache reuse, and affected selection. The local adoption
decision and consequential conventions live in the
[repository task-interface binding](../../docs/guides/repository-task-interface.md).
Use its supported targets and published pnpm workflows; underlying tool
invocations do not establish equivalent repository evidence.

[package.json](../../package.json), [pnpm-lock.yaml](../../pnpm-lock.yaml),
[nx.json](../../nx.json), project configuration, and repository Nx plugins own
distribution, version, and resolved task configuration. Toolchain preparation
is described in [CONTRIBUTING](../../CONTRIBUTING.md); dependencies are installed
explicitly. No global Nx installation is required.

Task inputs, dependency artifacts, declared outputs, and supported host adapters
are governed by the binding. Use Nx's native opt-in profile for diagnosed task
timing questions; routine workflows do not maintain a repository-specific cache
report. A restored dependency archive is not a task verdict. Upgrade
configuration and its conformance evidence together. For diagnosed freshness
needs, use the binding's cache-bypass semantics; do not disable unknown-cache
safeguards. Recovery from a failed task follows its owning target and source
diagnostics, not an automatic dependency installation.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Repository tooling maintainers are the support role via CONTRIBUTING; an individually assigned tooling owner is not documented.

Review this record when Nx versions, plugins, target contracts, cache inputs, or host adapters change.
