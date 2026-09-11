---
type: Environment
title: "Native AXM development"
description: "Workstation setup authorities, state boundaries, and source-CLI workspace selection for AXM development."
status: draft
sources:
  - id: migration-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
    title: Pre-migration repository guidance
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# Native AXM development

AXM develops natively with [mise.toml](../../mise.toml) as tool-version authority.
[CONTRIBUTING](../../CONTRIBUTING.md#getting-started) owns initial setup and the
contribution workflow. Use a task branch or worktree. The
[task-interface binding](../../docs/guides/repository-task-interface.md) defines
the dependency-preparation baseline and supported commands; no environment file,
service, or container is a general prerequisite.

The developer's checkout, dependencies, Git state, and native credential helpers
belong to that workstation context. A source CLI may target another workspace;
follow [Run the source CLI](../runbooks/run-source-cli.md) to select it explicitly
and isolate AXM user state when needed. This context is neither the Linux CI
container nor proof of behavior on another operating system.

Use public fixtures in committed artifacts. Repository public-context policy
applies even when the workstation has private credentials or repositories.
Workstation retention, backups, administrator access, and reset policy are not
defined by this repository. Preserve uncommitted work and user credentials when
recreating dependencies or retiring a checkout; no blanket reset is authorized.

Readiness is established by the supported setup and relevant repository checks
on the actual host, not by this record. [Native platform CI](native-platform-ci.md)
provides the separate platform execution boundary.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). The workstation operator controls local access and state; repository maintainers own contribution guidance. A shared workstation support and recovery policy is not documented.

Review this record when toolchain preparation, supported hosts, workspace selection, or workstation policy changes.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
