---
type: System Assurance
title: AXM system assurance
description: The confidence, evidence authorities, review route, and reassessment triggers
  for AXM changes.
status: stable
tags: [assurance, ci, maintainer-review]
sources:
  - id: contributing
    resource: https://github.com/agentxm/axm/blob/main/CONTRIBUTING.md
    title: Contributing to AXM
  - id: automated-review
    resource: https://github.com/agentxm/axm/blob/main/contributing/guides/automated-pull-request-review.md
    title: Automated Pull Request Review
  - id: ci-workflow
    resource: https://github.com/agentxm/axm/blob/main/.github/workflows/ci.yml
    title: AXM CI workflow
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
---

# AXM system assurance

## Required confidence

During pre-launch active development, AXM relies on pull requests, required CI,
and human maintainer approval for change assurance. No additional independent
architecture-approval body is part of the accepted posture.

The canonical [pull-request Requirement](/system/requirements/process/changes-land-through-pull-requests.md),
[required-CI Requirement](/system/requirements/process/required-ci-before-merge.md),
and [human-approval Requirement](/system/requirements/process/human-maintainer-approval.md)
own those binding obligations.

## Evidence authorities

- accepted Gen Stack concepts and the detailed architecture corpus establish
  applicable desired meaning and durable response shape;
- schemas, types, and generated artifacts establish exact machine-readable
  contracts;
- behavior, contract, and end-to-end tests establish the supported scenarios
  they exercise;
- source code and configuration establish current realization; and
- CI Executions and Results establish only the bounded checks and revision they
  actually assessed.

A passing check does not accept meaning, prove complete Evaluation coverage, or
authorize release beyond the repository workflow.

## Review route and exceptions

Human maintainer approval is authoritative. Automated semantic review is an
advisory safety pass and cannot approve, merge, or replace required CI or human
review. Current check results and review state remain in GitHub.

## Reassessment triggers

Reassess this posture at public launch or after a material change in security,
data criticality, or required verification. Also reassess when ordinary CI and
maintainer review no longer address an observed consequential failure mode.
