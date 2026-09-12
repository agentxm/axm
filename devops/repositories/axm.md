---
type: Repository
title: "AXM repository"
description: "Source, contribution, verification, and delivery authorities for the public AXM monorepo."
status: draft
hosted-by: ../providers/github.md
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# AXM repository

## Identity and boundaries

The canonical repository is [agentxm/axm](https://github.com/agentxm/axm).
The [README](../../README.md) owns product introduction and installation;
[CONTRIBUTING](../../CONTRIBUTING.md) owns contributor onboarding and change flow.
The repository contains the CLI, internal libraries, executable specifications,
release tooling, and public documentation. It does not establish ownership of
separately operated AgentXM systems.

## Development and delivery

- [Native development](../environments/native-development.md) routes setup and
  source execution; [Linux CI](../environments/linux-ci.md) and
  [native platform CI](../environments/native-platform-ci.md) explain substrate boundaries.
- [Repository task interface](../../docs/guides/repository-task-interface.md)
  owns invocation and evidence semantics; manifests and Nx configuration own
  the current commands and project inventory.
- [Architecture](../../docs/architecture/index.md) owns responsibilities and
  boundaries. [Executable specifications](../../specifications/catalog.md)
  remain the sole local requirements authority; the
  [authoring guide](../../contributing/guides/executable-specifications.md)
  owns placement and admission.
- [Release the CLI](../runbooks/release-cli.md) owns canonical delivery of the
  fixed `release:cli` cohort, native binaries, Homebrew formula, and official
  skill. [Local preview publication](../runbooks/publish-local-preview.md) has a
  separate purpose and verification boundary.
- Install/uninstall regression evidence lives in the owning specifications and
  [root install](../../apps/cli-e2e/src/root-install.e2e.test.ts) and
  [root uninstall](../../apps/cli-e2e/src/root-uninstall.e2e.test.ts) E2E files;
  these replace discovery through the retired manual smoke guide.

## Governance and lifecycle

[Repository instructions](../../AGENTS.md), [CONTRIBUTING](../../CONTRIBUTING.md),
[CODEOWNERS](../../.github/CODEOWNERS), and the required CI aggregate describe
contribution and review policy. CODEOWNERS routes review; it does not establish
provider administration or operational ownership.

GitHub repository settings are the live enforcement authority. Readback on
2026-09-12 established that `main` requires pull requests, resolved
conversations, linear history, and the strict `Required CI` context produced by
GitHub Actions app `15368`; the rules include administrators and prohibit force
pushes and deletion. Required approvals are zero, code-owner and last-push
approval are off, and no actor or team has a bypass restriction. Squash is the
only enabled merge method, automatic branch deletion and auto-merge are on, and
the host permits branch updates. External-contributor maintainer acceptance
therefore remains an explicit process boundary rather than a host-expressible
conditional review rule.

Actions are enabled for all actions, default workflow permissions are read-only,
and workflows cannot approve pull requests. Pull-request jobs use GitHub-hosted
ephemeral runners; trusted persistent-runner and release-production jobs are
limited by event and repository conditions in the workflows. SHA-only action
selection is not enforced by the host, so workflow source owns action pinning.
The repository is maintained for pre-launch development. Transfer and archival
arrangements are not documented in the reviewed sources.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Repository maintainers operate the contribution flow described in CONTRIBUTING; the complete administrator and recovery-owner roster requires confirmation in GitHub settings.

Review this record when the remote, ownership, repository layout, contribution
gates, Actions permissions, runner trust boundary, or distribution model
changes.

## Documentation migration history

The 2026-09-11 adoption moved operational meaning into `devops/`. Git preserves
prior versions; these paths explain older links and evidence, not aliases.

| Former path or section                                           | Canonical home / disposition                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contributing/guides/releasing.md`, except local previews        | [Release the CLI](../runbooks/release-cli.md)                                                                                                                             |
| Its Local Preview Publish section                                | [Publish a local preview](../runbooks/publish-local-preview.md)                                                                                                           |
| `contributing/guides/automated-pull-request-review.md`           | [Automated PR review](../playbooks/automated-pr-review.md)                                                                                                                |
| `contributing/guides/development-environment.md`: native context | [Native development](../environments/native-development.md)                                                                                                               |
| Its container/cache model                                        | [Linux CI](../environments/linux-ci.md)                                                                                                                                   |
| Its native Windows and platform boundaries                       | [Native platform CI](../environments/native-platform-ci.md)                                                                                                               |
| Its source-CLI, container-use, and image-upgrade procedures      | [Source CLI](../runbooks/run-source-cli.md), [Linux CI reproduction](../runbooks/reproduce-linux-ci.md), [image upgrade](../runbooks/upgrade-ci-image.md)                 |
| `containers/ci/README.md`: image contract and retention          | [CI image](../tools/ci-image.md); the source README remains a discovery pointer                                                                                           |
| Its cache persistence and recovery detail                        | [Linux CI](../environments/linux-ci.md)                                                                                                                                   |
| `docs/guides/smoke-testing-guide.md`                             | Retired without successor: install/uninstall checks duplicate the executable journeys linked above; custom-registry setup and lockfile-version-6 expectations were stale. |

Architecture, the task-interface binding, specification admission, authentication
implementation guidance, and Effect implementation guidance retain their
canonical locations and distinct reader purposes.
