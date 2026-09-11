---
type: Reference
title: AXM DevOps documentation adoption
description: Local scope, maintenance authority, and host-rule composition for AXM’s DevOps documentation bundle.
status: stable
---

# AXM DevOps documentation adoption

AXM adopts [DevOps Docs profile 0.5.0](../agent_extensions/agentxm/@craigsmitham/skills/devops-docs/src/references/profile.md) over OKF v0.2 at the
repository-relative root `devops/`. The adopted contract is preserved in the
[versioned profile](https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/agent_extensions/agentxm/@craigsmitham/skills/devops-docs/src/references/profile.md)
and its linked type contracts. The tracked
[authoring guidance](../agent_extensions/agentxm/@craigsmitham/skills/devops-docs/src/tasks/author.md)
is accessible to human readers as well as agents.

Scope: AXM Provider, Repository, Tool, Environment, Playbook, Runbook, and Measure
records in the corresponding standard type folders. Service, Team, and
Organization records are outside this initial adoption. The
[index](index.md) exposes current coverage.

Responsible documentation maintainer: [@craigsmitham](https://github.com/craigsmitham),
accepted with this repository's setup proposal. Subject accountability remains
in each record; this declaration does not appoint provider administrators,
publishers, or recovery owners. Draft records retain unresolved evidence gaps.

[Root repository instructions](../AGENTS.md) govern command execution, public
context, review, and change authority. `docs/` remains a separate bundle under
[its own profile](../docs/AGENTS.md); its title omission, shortened index
descriptions, and semantic `depends-on` convention do not apply here.
Architecture, specifications, implementation guidance, and the repository task
interface retain their existing authority outside this record scope.

Local choices: repository-facing relative links support GitHub and editor use;
Git owns history, so no separate `log.md` is maintained. The
[repository record](repositories/axm.md) records migration history. Changes to
profile version, scope, or maintenance authority require revisiting this declaration.
