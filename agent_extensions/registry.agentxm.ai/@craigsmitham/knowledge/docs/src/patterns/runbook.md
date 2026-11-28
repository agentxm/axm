---
type: Pattern
title: Runbook
description: For a bounded operational task with an established procedure, specify repeatable execution with explicit conditions, verification, recovery, and escalation.
tags:
- docs
- runbook
- operations
- maintenance
- incident-response
- verification
- automation
- documentation-pattern
- pattern
- authoring
status: stable
sources:
- id: aws-runbooks
  resource: https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_ready_to_support_use_runbooks.html
  title: AWS — Use runbooks to perform procedures
- id: aws-runbook-branching
  resource: https://docs.aws.amazon.com/systems-manager/latest/userguide/automation-action-branch.html
  title: AWS — Run conditional automation steps
- id: gitlab-backups
  resource: https://runbooks.gitlab.com/customersdot/backups/
  title: GitLab — CustomersDot backups, Verification
- id: diataxis-how-to
  resource: https://diataxis.fr/how-to-guides/
  title: Diátaxis — How-to guides
generated:
  by: codex/gpt-6
  at: '2026-11-22T02:12:07Z'
---

# Runbook

Choose a runbook when an operator has an established task to perform and
another person must be able to tell whether it finished or where it
stopped. The team needs to know which request starts the procedure, who
may act, what conditions it covers, and what result counts as complete.
This applies to scheduled work as well as a remedy selected during an
incident.[^aws-runbooks]

## When the detail earns its keep

A [how-to guide](how-to.md) can help practitioners reach a goal using
judgment about their own circumstances.[^diataxis-how-to] A runbook pays
for its extra detail when operators share responsibility for a specific
operation. Knowing the local target, permissions, stopping conditions,
and evidence of completion lets the next shift take over. Someone must
keep those details current as equipment and responsibilities change.

A team that already knows the procedure and keeps missing one check may
need only a [checklist](checklist.md) at that point. If the team has yet
to decide which remedy would help, a [playbook](playbook.md) can guide
that investigation. A runbook becomes useful once the remedy is chosen
and the observed conditions fall within the established procedure.

## Illustrative example

Suppose checkout errors rise after a release. The
[response playbook](playbook.md#illustrative-example) helps the team decide
whether to roll back. Once rollback is approved, different versions of the
deployment platform might require different steps. Either path finishes
when the approved version is serving on the named target and its
agreed health checks pass. If the version is correct but a required check
fails, the operator hands off the observed state and the outstanding check.

Even a successful rollback settles only the deployment question. Customer
errors that persist send the responder back to the investigation. A team
doing the same rollback as planned maintenance can use the runbook directly.

## What published runbooks show

GitLab’s CustomersDot backup documentation describes an automated restore
followed by queries to check that the restored data is recent. A successful
restore of yesterday’s data and one of a much older copy could otherwise
look alike.[^gitlab-backups] The verification can be automated or performed
by an operator, depending on who can observe the result.

Branching is compatible with a repeatable procedure. AWS Systems Manager
documents an executable runbook that chooses a step from a parameter or
an earlier result.[^aws-runbook-branching] These examples show ways to
express and check a bounded task. Whether a team can execute its own
procedure across shifts needs a local rehearsal.

For the distinction between finishing a step and observing the intended
result, see [What a runbook lets an operator repeat](../explainers/runbook.md).
To capture and rehearse the local procedure, follow
[How to write a runbook](../guides/writing-a-runbook.md).

[^aws-runbooks]: AWS Well-Architected, [Use runbooks to perform procedures](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_ready_to_support_use_runbooks.html).
[^gitlab-backups]: GitLab, [CustomersDot backups, Verification](https://runbooks.gitlab.com/customersdot/backups/#verification).
[^aws-runbook-branching]: AWS Systems Manager, [Run conditional automation steps](https://docs.aws.amazon.com/systems-manager/latest/userguide/automation-action-branch.html).
[^diataxis-how-to]: Diátaxis, [How-to guides](https://diataxis.fr/how-to-guides/).
