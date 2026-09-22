---
type: Tool
title: Dependabot in AXM
description: Native dependency proposals for the pnpm workspace and GitHub Actions, with coordinated manual exceptions and ordinary review gates.
status: draft
uses-provider:
  - target: ../providers/github.md
    scope: Hosted updates, dependency alerts, and repository security settings
sources:
  - id: options
    resource: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
  - id: security
    resource: https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates
  - id: jobs
    resource: https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-job-logs
---

# Dependabot in AXM

## Purpose and configuration

Use GitHub's hosted Dependabot to propose dependency updates for review.
[.github/dependabot.yml](../../.github/dependabot.yml) owns the schedule,
cooldown, PR limits, groups, and exceptions. GitHub owns the updater version;
there is no local installation, scheduled wrapper, or updater App credential.
The pnpm workspace uses public npm packages, so no private registry secret is
required for the current dependency inventory.

The root npm entry covers workspace manifests, the
[catalog](../../pnpm-workspace.yaml), and [lockfile](../../pnpm-lock.yaml).
The Actions entry covers workflows and local composite actions. Keep existing
action SHA pins and version comments when reviewing updates. Native catalog
support removes the original reason for selecting Renovate; its configuration
and self-hosted workflow are retired.

The configuration permits routine npm minor/patch updates and grouped Actions
updates. `allow.update-types` limits version updates without excluding major
security fixes; the cooldown and version PR limit do not delay security
updates. Groups apply only to version updates, leaving security PRs separate.
GitHub documents these semantics in its options reference.[^options]

## Review and manual maintenance

Dependency PRs use the existing [CI workflow](../../.github/workflows/ci.yml),
maintainer acceptance, and [merge queue](../runbooks/operate-merge-queue.md).
There is no automatic merge or privileged dependency-only verification path.
The proposed-change JUnit reporter uses annotations and job summaries for
Dependabot PRs because their token cannot create check runs. Tests and required
verification still run.

- Keep the Effect runtime and `@effect/*` tooling coordinated manually. Full
  ignores also prevent automatic security remediation for those packages:
  review alerts and the existing audit reports, and prepare a compatible fix.
- Keep Node, pnpm, and Bun declarations synchronized with
  [mise.toml](../../mise.toml), package manifests, and workflow inputs. The
  existing toolchain checks remain authoritative; updater scope does not
  include a separate toolchain manager. Raise the `@types/node` ceiling only
  with the runtime floor.
- Preserve the two TypeScript aliases in the catalog. A grouped proposal
  does not authorize collapsing the compiler and compatibility packages.
- Review override edits against their advisory and affected range. Overrides
  are remediation floors, not an independent routine upgrade surface; do not
  globally ignore an otherwise updatable direct dependency to protect one.
- Grouping does not enforce version equality or peer compatibility. Review
  the complete manifest and lockfile diff and keep package families coherent.
- Supply an [Nx release plan](../runbooks/release-cli.md) when the existing
  `release plan:check` gate requires one. Reviewer additions use the normal
  release-plan workflow rather than exempting bot PRs from the gate.

Major npm migrations, standalone lockfile refreshes, and deduplication remain
deliberate maintenance. This configuration adds no replacement dashboard or
monthly lockfile job. Preserve pnpm's existing release-age rules and
`pmOnFail: ignore`; security urgency does not silently bypass installation
policy.

## Activation and operational evidence

Version updates become active when the configuration reaches `main`.
Repository administrators must also ensure the dependency graph, Dependabot
alerts, and security updates are enabled. These are separate repository
settings, not effects of writing the configuration.[^security]

Readback on 2026-09-22 found alerts enabled and security updates disabled.
Repository and organization Actions inventories contained no `RENOVATE_*`
secrets or variables. The organization installation list contained no
Renovate/Mend App; the repository had no matching Renovate branches, open PRs,
or open dependency dashboard. This is a dated observation, not proof of
current settings. No native update job or generated PR has yet been verified
for this configuration.

At integration, reconcile the required settings through their configuration
owner, then read them back. Use GitHub's Dependabot update-job history to
request a check, inspect errors, and link actual proposal evidence.[^jobs]
Verify catalog/lockfile updates and workflow/composite-action updates through
ordinary CI; preserve SHA pins and manual exceptions in the resulting diffs.

For resolution failures, inspect the native job log, then reproduce the
reported installation failure with the pinned workspace toolchain. Address
the dependency constraint or configuration and request another update check.
Do not add an App credential or broaden CI permissions as a generic retry.

## Accountability and maintenance

Repository maintainers review proposals and handle manual exceptions through
the normal contribution process. Repository administrators own access to the
security settings; the [GitHub provider record](../providers/github.md) retains
membership and recovery-accountability gaps. Documentation maintenance follows
the [bundle adoption](../README.md).

Review this record when updater scope, patches, dependency cohorts, toolchain
floors, CI permissions, registry access, or security settings change. Activation
readback and representative native PR evidence remain integration work.

[^options]: [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

[^security]: [Configuring Dependabot security updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates).

[^jobs]: [Dependabot job logs](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-job-logs).
