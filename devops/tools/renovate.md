---
type: Tool
title: Renovate in AXM
description: Self-hosted dependency update proposals across the AXM pnpm catalog and workflow digests, with cohort grouping, review-only merge policy, and the outstanding app credential.
status: draft
uses-provider:
  - target: ../providers/github.md
    scope: Actions execution and the repository-owned Renovate app credential
runs-in:
  - target: ../environments/linux-ci.md
    scope: Scheduled hosted Linux runner that resolves and proposes updates
---

# Renovate in AXM

## Purpose and adoption

[.github/renovate.json5](../../.github/renovate.json5) owns this repository's
dependency update configuration. Renovate opens grouped pull requests against
the [pnpm catalog](../../pnpm-workspace.yaml), the workspace package manifests,
and the `uses:` digests in [workflows](../../.github/workflows), so currency is
maintained by reviewing proposals rather than by periodic manual sweeps.

Renovate was selected over Dependabot on one deciding capability rather than a
preference between the two managers. Nearly every dependency version here is
declared once in the `catalog:` block of
[pnpm-workspace.yaml](../../pnpm-workspace.yaml) — 48 entries — and not in a
package manifest. Dependabot's npm ecosystem does not resolve pnpm catalogs, so
enabling it would have managed the few direct manifest entries and left the real
version surface unmanaged. Renovate resolves catalogs natively.

Adoption is configuration-only: no repository-specific update automation was
written, and the manager's own scheduling, grouping, and dashboard replace a
manual sweep rather than wrapping one.

## Distribution, setup, and access

Renovate is **self-hosted** by
[.github/workflows/renovate.yml](../../.github/workflows/renovate.yml), which
runs the open-source CLI (AGPL-3.0) on a standard GitHub-hosted runner, weekly
and on demand. The action and its pinned version are the version authority; this
record maintains no second version list.

The rejected alternative is the Mend-hosted Renovate GitHub App. Its Community
tier is free and covers unlimited public and private repositories, so cost alone
did not decide this. Its published Community limits did:

|                 | Mend Community (free)  | Mend Enterprise (paid) | Self-hosted here       |
| --------------- | ---------------------- | ---------------------- | ---------------------- |
| Concurrent jobs | 1 **per organization** | 16                     | Per workflow run       |
| Schedule        | Every 4 hours          | Hourly                 | Weekly, plus dispatch  |
| Job timeout     | 30 minutes             | 60 minutes             | 60 minutes             |
| Runner          | 1 vCPU / 3 GB          | 2 vCPU / 8 GB          | Standard GitHub runner |
| Support         | None                   | Helpdesk               | None                   |

Two of those are disqualifying. The single concurrent job is scoped to the
**organization**, so every repository in the `agentxm` namespace contends for
it. And Renovate resolves lockfiles by running the workspace's own installer:
this workspace carries 15 Nx projects, 13 package manifests, and roughly 1,100
resolved packages, which is not a safe fit for a 30-minute budget on 1 vCPU and
3 GB. Exceeding it would have made the paid tier the remedy for a constraint
self-hosting does not impose.

The cost accepted is a credential to provision and rotate. The workflow
authenticates as a repository-owned GitHub App — not a personal access token —
so its pull requests are attributable and each run's token is short-lived. It
reads `vars.RENOVATE_APP_ID` and `secrets.RENOVATE_APP_PRIVATE_KEY`; no secret
value belongs in this record.

The token is scoped at mint time rather than inheriting the installation's
blanket permissions. The app needs exactly four repository permissions:

| Permission           | Why                                                                |
| -------------------- | ------------------------------------------------------------------ |
| Contents: write      | Push the update branch                                             |
| Pull requests: write | Open and update the proposal                                       |
| Issues: write        | Maintain the dependency dashboard, which is an issue               |
| Workflows: write     | The `github-actions` manager edits files under `.github/workflows` |

**The GitHub App is not yet created and those values are not yet set.** Until
they are, the scheduled run fails at its first step and no proposals are
produced. Creating the app with the permissions above, installing it on this
repository, and recording its rotation responsibility belong to the
[GitHub provider record](../providers/github.md), where account administration
and named administrators remain open gaps.

## Supported usage

The scheduled Monday run needs no entry point. On demand, dispatch the
**Renovate** workflow from Actions; `dryRun` defaults to true and resolves
updates into the log without opening pull requests, and `logLevel` accepts
`info` or `debug`. Use a dry run to inspect grouping before letting a live run
open branches.

No update class auto-merges:

| Update class           | Proposal                                  | Auto-merge | Reason                                                                                      |
| ---------------------- | ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| Patch and minor        | Grouped by cohort, weekly                 | No         | Reviewed; the cohort groups keep a framework moving as one coherent change                  |
| Major                  | Dependency dashboard approval first       | No         | Each major in flight is owned by a work item; unapproved branches would conflict with it    |
| Security advisory      | Immediately, outside the stability window | No         | Advisories should not wait out `minimumReleaseAge`, but still take the ordinary review gate |
| Workflow action digest | Grouped, weekly                           | No         | Preserves the cadence the retired Dependabot configuration ran                              |
| Lockfile maintenance   | Monthly                                   | No         | Transitive refresh with no declared-version change                                          |

The policy is deliberately conservative for the window in which the tracked
dependency majors are in flight, not permanently; revisit it once they land.

Proposals are ordinary pull requests, so they run the same Actions-owned
`Required CI` result and merge queue as authored work, described in
[Operate the merge queue](../runbooks/operate-merge-queue.md). No bypass path
exists or is configured.

## Inputs, outputs, and connections

Renovate reads the catalog, the workspace package manifests, and workflow
`uses:` references; it writes update branches, their pull requests, and the
dependency dashboard issue. Consequential local conventions:

- `minimumReleaseAge` matches the one-day window
  [pnpm-workspace.yaml](../../pnpm-workspace.yaml) already enforces, so a
  proposal is never opened for a release the installer would refuse.
- `rangeStrategy` is `bump`, not the default. Catalog entries are caret ranges;
  the default strategy acts only once a release leaves the range, which would
  let the catalog drift within its carets.
- The Effect cohort is disabled. `effect` and the `@effect/*` runtime packages
  are pinned to one exact release candidate that
  `minimumReleaseAgeExclude` names individually, and the cohort only moves as a
  whole under its own migration.
- `@types/node` is held rather than capped. The declared types sit two majors
  ahead of the Node runtime pinned in [mise.toml](../../mise.toml), and choosing
  the direction is a separate decision because the published CLI `engines` range
  is a user-facing contract.
- Cohort groups keep a framework's packages in one branch: Nx, Vite and Vitest,
  ESLint and its plugin and parser cohort, the two TypeScript aliases, and
  Allure. The TypeScript pair is deliberate architecture, governed by its
  dual-alias decision record, not drift to be collapsed.
- The development toolchain is held, not managed. `mise.toml` is the authority
  for Node, pnpm, and Bun; `package.json` repeats the pnpm pin in
  `packageManager` and `publish.yml` repeats the Node and Bun pins literally,
  and `check:ci-toolchain` fails unless the copies agree. Renovate reaches those
  declarations through three managers and therefore three branches, so any one
  of them alone breaks that check. The toolchain moves by hand, in one change.
- `engines.node` is held for the same reason plus a stronger one: it is a
  published contract, and raising it can refuse installation for an end user.
- The `overrides:` block is held. Each key is a vulnerable range and its value
  is the lowest safe release, which is not a dependency version Renovate can
  usefully track — see the limitation below.

## Limitations, support, and recovery

- **Observed, but not end to end.** A `--platform=local` dry run on 2026-09-21
  resolved this configuration against the real workspace and confirmed the
  cohorts: `renovate/nx`, `renovate/eslint`, `renovate/vite-and-vitest`,
  `renovate/allure`, and `renovate/github-actions` each resolve to exactly one
  branch, Effect and `@types/node` produce none, and 37 updates land across 22
  branches. That run exercised config resolution, preset inheritance, catalog
  parsing, and grouping. It did **not** exercise the GitHub platform, branch or
  pull-request creation, or lockfile artifact resolution, because the credential
  is unset. Repeat the dispatched dry run once the app exists.
- Renovate does manage the `overrides:` block in
  [pnpm-workspace.yaml](../../pnpm-workspace.yaml), so it is disabled
  deliberately rather than out of reach. The dry run showed why: it treats each
  remediation floor as an ordinary version and proposed
  `brace-expansion@>=1.0.0 <1.1.18` → `5.0.12`, a release the key's own range
  excludes. Advisories still reach these packages through `vulnerabilityAlerts`,
  which overrides the disable — the same run kept the `js-yaml` and `qs`
  security branches. The floors themselves remain a manual authority, as does
  `minimumReleaseAgeExclude`, and both still want their own detector.
- Disabling the whole `@effect/*` scope also freezes the caret-ranged Effect
  development tooling — the ESLint plugin, the language service, and the
  compiler patcher — which are not part of the pinned runtime cohort. Narrow the
  rule if that proves too broad in practice.
- Grouping is configured against the cohorts present today. A new framework
  cohort arrives as ungrouped per-package proposals until a rule is added.
- Recovery from a failed run is the workflow's own log and a re-dispatch; the
  manager holds no local state beyond the dashboard issue and its branches.
  A proposal that cannot install is closed rather than repaired in place.

## Gaps and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Local support accountability is not
established in this record; repository tooling maintainers are the support role
through [CONTRIBUTING](../../CONTRIBUTING.md), and an individually assigned
owner is not documented. The linked configuration establishes intended behavior,
not current installation or health.

Open gaps: the Renovate GitHub App is not created and its `RENOVATE_APP_ID` and
`RENOVATE_APP_PRIVATE_KEY` values are unset, so the workflow cannot yet run and
no proposal has been opened against the platform; there is no Tool record for
the pnpm installer that Renovate invokes to resolve lockfiles; and the
auto-merge policy is set for the in-flight window rather than steady state.

Review this record when the credential is provisioned and the first proposals
are observed, when a run approaches the job timeout or the weekly cadence proves
wrong, when the tracked majors land and the auto-merge policy is reconsidered,
when a cohort is added or the held `@types/node` entry is resolved, or when the
hosting selection changes.
