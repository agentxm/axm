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
  at: 2026-09-30T14:52:02Z
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

## Client configuration and recovery

The [task-interface binding](../../docs/guides/repository-task-interface.md)
owns cache eligibility, output ownership and evidence meaning. Do not disable
unknown-cache safeguards. A dependency archive is not a task verdict.

For a single Nx invocation, append `--skip-nx-cache`. For a multi-stage root
workflow, set `NX_SKIP_NX_CACHE=true`; pnpm would otherwise forward an appended
flag only to the final stage.

The stock Nx HTTP client uses `NX_SELF_HOSTED_REMOTE_CACHE_SERVER` and
`NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN`. Local users supply an approved HTTPS
origin and a **read-only** repository credential in their environment or ignored
root `.env.local`. Keep tokens out of source, logs, and release assets. Set
`NX_SKIP_REMOTE_CACHE=true` to bypass remote reuse while retaining local caching;
set `NX_SKIP_NX_CACHE=true` as well for complete re-execution.

GitHub's setup action accepts `NX_REMOTE_CACHE_URL` and the read-only
`NX_REMOTE_CACHE_READ_TOKEN`. A repository variable `NX_SKIP_REMOTE_CACHE=true`
disables remote consumers and warming, including during initial rollout before
reader installation. Its value must be `true`, `false`, or absent. An invocation's
native bypass also remains effective. Fully absent configuration disables remote access;
partial or malformed configuration fails explicitly. Failed results are never
cached. Fork and Dependabot runs bypass remote access;
forks receive no cache credential. Only the separate successful-main warmer
uses `NX_REMOTE_CACHE_WRITE_TOKEN` from the protected `nx-cache-writer`
environment. Its live deployment branch policy must allow main only. Warming
runs after CI completion and does not gate publication. The GitHub caller visits
each selected lane's eligible graph; native hits avoid recomputation
while missing hashes are populated. This covers cancelled predecessors and
expired objects without separate warming state.
`cache:warm:affected` remains available for an explicit bounded revision range.
Scheduled source assurance bypasses both local and remote task caches.

Use the setup action and [cache workflow](../../.github/workflows/nx-cache.yml)
for exact platform selection. Ordinary push warming populates source checks on
Linux x64 and native binary prerequisites on the other platform lanes; assurance
continuations can backfill the complete eligible graph. Include all warmer jobs
when comparing total runner work.

## Diagnose reuse

Set Nx's native `NX_PROFILE=test-results/nx-profile.json` for the invocation
being investigated, using a workspace-relative file. The trace records task
timing; it is separate from the task-cache `run.json` used to inspect cache
outcomes. Invocations writing the same profile path overwrite it, leaving the
last recorded invocation rather than the complete multi-stage workflow. Use a
distinct relative path per phase and Actions step durations for setup and other
commands. Nx 23 does not expose cache lookup time through the trace, so do not
infer network time from task duration. A GitHub dependency-cache hit is a
separate setup/transport signal.

[Reproduce AXM Linux CI](../runbooks/reproduce-linux-ci.md) owns isolated-cache
restoration checks and retained evidence. Recovery follows the owning target's
source diagnostics, not an automatic dependency installation. Upgrade
configuration and its conformance evidence together.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Repository tooling maintainers are the support role via CONTRIBUTING; an individually assigned tooling owner is not documented.

Review this record when Nx versions, plugins, target contracts, cache inputs, or host adapters change.
