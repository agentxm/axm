---
type: Environment
title: "AXM native platform CI"
description: "Native runner and evidence boundaries for Windows workspace behavior and cross-platform binary/install verification."
status: draft
uses-provider:
  - ../providers/github.md
sources:
  - id: migration-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
    title: Pre-migration repository guidance
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# AXM native platform CI

## Purpose and configuration

Native GitHub-hosted jobs establish platform-specific behavior that the Linux
container cannot. [ci.yml](../../.github/workflows/ci.yml) owns runner selection,
Windows workspace tests, binary compilation/smoke, timeouts, and uploaded
evidence. [publish.yml](../../.github/workflows/publish.yml) owns the separate
installed-product and package-manager verification matrix. Native macOS,
Windows, and architecture coverage remain at those authorities rather than a
second matrix here.

## Native Windows verification

Required CI runs the bounded `Windows workspace lifecycle` job on
`windows-latest` for pull requests, main pushes, and manual CI dispatches. It
uses the repository toolchain setup and these Nx targets:

```powershell
pnpm nx run workspace-projection:test-windows --outputStyle=static
pnpm nx run cli-e2e:e2e-windows --outputStyle=static
```

The core target exercises instruction-file managed copies on the native
Windows filesystem. The CLI target uses a workspace and user home whose paths
contain spaces, then covers agent detection, project and user setup, skill and
MCP lifecycle mutations, sync preview and apply, machine output, native
JSON/JSONC/TOML/YAML writers, lock refresh, and transactional recovery from an
injected filesystem failure. Both suites assert that they are running on
Windows; they never convert a substrate mismatch into a skip.

The job has a 25-minute ceiling and one Vitest worker per target. The workflow selects JUnit diagnostics and Allure report artifacts;
[CI artifact upload paths](../../.github/workflows/ci.yml) own the current
allowlist. Do not broaden uploads to process environments or workspace configuration
values.

## State, access, and lifecycle

Jobs provision toolchains through the repository setup action and operate in
ephemeral runner workspaces. Windows lifecycle tests use isolated workspace and
user-home fixtures, including paths with spaces. Credentials and permissions
are event/job-specific workflow inputs, not fixture contents. Public artifacts
must remain within the configured report/asset paths and repository privacy
policy. Workflow retention settings own artifact lifetime; GitHub owns hosted
runner disposal. A rerun creates new execution evidence, not validation of an
earlier host. No manual runner reset or persistent deployment is prescribed.

Readiness requires each applicable native gate to pass for the identified
commit/artifact; Linux success is insufficient. Follow
[Release the CLI](../runbooks/release-cli.md) when interpreting release evidence.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Repository workflow maintainers own job configuration; named operational escalation and provider recovery contacts remain unverified.

Review this record when platform matrices, runner images, fixtures, artifact retention, permissions, or release gates change.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
