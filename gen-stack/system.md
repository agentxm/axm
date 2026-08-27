---
type: System
title: AXM
description: The purpose, boundary, exclusions, and environmental relationships of the
  public AXM CLI and OSS-safe reusable core.
status: stable
tags: [axm, public-cli, system-boundary]
sources:
  - id: axm-architecture-overview
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/overview.md
    title: AXM overview
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  is-subject-of-requirement:
    - /system/requirements/constraint/public-private-boundary.md
    - /system/requirements/process/changes-land-through-pull-requests.md
    - /system/requirements/process/human-maintainer-approval.md
    - /system/requirements/process/pre-launch-contract-changes-remain-coherent.md
    - /system/requirements/process/public-artifacts-protect-private-context.md
    - /system/requirements/process/required-ci-before-merge.md
---

# AXM

## Purpose

AXM helps people and agents find, create, distribute, install, and manage
reusable extensions across coding agents while preserving explicit workspace
intent, authority, and ownership.

## Boundary

The System is the public AXM CLI and the OSS-safe reusable core maintained in
this repository. It contains the public command experience, reusable extension
and workspace behavior, and supporting public utilities required to realize
that behavior.

## Material exclusions

- The private AgentXM platform and Registry services are outside this System.
- Coding-agent products, extension runtimes, and third-party package ecosystems
  retain their own authority.
- Shared AgentXM product language remains owned by the public AgentXM Knowledge
  bundle.
- Work items, Implementation, Evaluation Executions and Results, and runtime
  observations retain their repository-native or external authorities.

## Environmental relationships

AXM interacts with Registry services through published contracts, with package
and source hosts through their public protocols, and with coding agents through
their supported native configuration and extension surfaces. The canonical
[public/private boundary Requirement](/system/requirements/constraint/public-private-boundary.md)
governs how private AgentXM responsibilities may affect this public System.

## Narrower views and evidence

The [AXM CLI Surface](/architecture/surfaces/cli.md) owns the public command-line
encounter boundary. The [detailed architecture corpus](https://github.com/agentxm/axm/blob/main/docs/architecture/index.md)
owns accepted architecture that has not been admitted as a governed Gen Stack
concept. Code and configuration establish current realization; schemas and
generated artifacts establish exact machine-readable contracts; tests and CI
provide bounded evidence.
