---
type: Provider
title: "GitHub for AXM engineering and delivery"
description: "Repository hosting, workflow execution, release distribution, and CI-image hosting used by AXM."
status: draft
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# GitHub for AXM engineering and delivery

## Relationship and account scope

This draft groups the configured GitHub surfaces supporting `agentxm/axm`:
repository hosting and Actions, GitHub Releases, and `ghcr.io/agentxm/axm-ci`.
The repository and image use the `agentxm` namespace. The release workflow also
uses the separately permissioned Homebrew tap; its write authority must not be
inferred from repository access. Whether these surfaces share billing and
recovery administration is unverified; split this record if their maintainers
confirm independent relationship lifecycles.

## Configuration and access authorities

- [Repository](https://github.com/agentxm/axm) and its settings own access,
  protection, Actions permissions, and secret administration.
- [CI](../../.github/workflows/ci.yml),
  [publication](../../.github/workflows/publish.yml), and
  [CI-image publication](../../.github/workflows/ci-image-publish.yml) declare
  configured workflows and permissions; presence does not prove successful use.
- [Package inventory](https://github.com/orgs/agentxm/packages) owns GHCR
  visibility and published images. The [CI-image record](../tools/ci-image.md)
  preserves public-pull and retention requirements.

Workflow `GITHUB_TOKEN` permissions are job-scoped. Additional release and tap
credentials remain symbolic references in the [release runbook](../runbooks/release-cli.md)
and workflow; no secret values belong here. Repository owners administer those
settings, but their current membership and recovery owner are not established
by the checked-in review routes.

## Constraints and relationship gaps

Replacement or cancellation affects source collaboration, CI, release assets,
CI-image pulls, and tap automation. Public/fork PRs must retain ephemeral
runner isolation. Commercial plan, billing/budget owner, renewal/cancellation
terms, agreements, SLA references, and account recovery arrangements require
evidence from the authorized account administrators; none is inferred from
the public namespace. No live-account inspection was performed on 2026-09-11.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Relationship accountability and named administrators remain gaps for the repository maintainers to resolve from GitHub account settings.

Review this record when account administration, offerings, workflow permissions, package visibility, or billing arrangements change.
