---
type: Runbook
title: Reproduce AXM Linux CI
description: Reproduce a failed Linux verification job using its exact revision and native toolchain.
status: draft
applies-to:
  - ../repositories/axm.md
  - ../environments/linux-ci.md
uses-tool:
  - ../tools/nx.md
---

# Reproduce AXM Linux CI

## Preconditions

Identify the failed run, source SHA, job and command. Preserve existing work and
use an isolated checkout of that revision. Native Linux reproduction requires
the repository tools from `mise.toml` and the native prerequisites declared by
the setup-workspace action. A run on macOS or Windows can diagnose shared code
but does not establish Linux conformance.

## Procedure

1. Inspect the failed job's setup and verification output. Distinguish unavailable
   prerequisites, dependency installation, test failure and report publication.
2. Install the pinned toolchain and run `pnpm install --frozen-lockfile`.
3. Set the agent shell settings from the repository instructions. Run the exact
   published workflow or Nx target shown by the failed job, preserving its
   affected range and release-preparation context when applicable.
4. Correct the cause and run the narrow relevant check, then `pnpm run verify:pr`
   before delivery. Rerun the relevant Actions check on the resulting revision.

For an on-demand full main verification, dispatch `ci.yml` on the intended
trusted revision. The workflow runs the workspace and E2E partitions on hosted
runners. This dispatch verifies code; it does not authorize publication.

## Diagnose task reuse

When the failure concerns cache restoration, use two disposable checkouts at
the same source revision and toolchain. Keep the developer's checkout intact.
An authorized trusted producer must have populated the selected task; the
consumer receives only an approved read-only credential. Client configuration
and bypass are documented in [Nx in AXM](../tools/nx.md).

1. Give each checkout separate empty `NX_CACHE_DIRECTORY` and
   `NX_WORKSPACE_DATA_DIRECTORY` directories. The defaults may share task-cache
   and metadata state across checkouts, so another checkout alone is not a cold
   consumer.
2. Remove generated consumer outputs and invoke the existing target. Require
   `remote-cache-hit` in its task-cache `run.json`, matching hashes, restored
   bytes/modes/reports and no task-body execution. A local hit or HTTP roundtrip
   alone does not qualify.
3. Verify a relevant declared source/configuration change misses. For changes
   to the cache contract, exercise affected dependency, generator, toolchain,
   platform and environment inputs; unrelated inputs should preserve intended
   reuse. Credentials and checkout paths must not become semantic task inputs.
4. Compare with explicit bypass using the same task and identified revision.
   Preserve failures and stop on unexpected reuse; do not weaken inputs to
   improve the hit rate. Measure archive size against the configured service
   limit before extending reuse to new binary outputs.

This diagnoses task reuse; it does not establish native-platform behavior on an
unexecuted host or authorize release publication. Include producer work,
transfers and retries when evaluating the total cost of cache reuse.

## Completion and recovery

Record the revision, platform, command, exit status and report artifacts. A
successful rerun establishes only the exercised scope. Preserve failures and
partial reports; do not change test coverage or disable cache provenance checks
to obtain a pass. Hosted job teardown owns the ephemeral machine; there are no
project-maintained image digests or shared Docker volumes to reset.

## Accountability and maintenance

Workflow maintainers own repository verification; the operator owns local
checkout state. Account and runner availability follow the GitHub provider
record. Review on toolchain, command, cache or workflow changes. Native hosted
migration has not yet established a live exercise record for this procedure.
