# Runbook record

Use for an established procedure with a bounded trigger and verifiable outcome.
Tasks can concern engineering or operations, such as reproducing a build,
resetting a development environment, deploying a service, or restoring service.
Apply the [common profile](../references/profile.md). The Type contract is
normative for profile 0.5.0; the remaining sections guide authoring.

## Type contract

A Runbook MUST identify:

- Trigger/task, intended outcome, applicable system/version/environment, and scope.
- Preconditions: access, tools, inputs, supported state, and authorization boundaries.
- Ordered actions with expected results after consequential steps; supported
  branches, retries, and parameter choices must be explicit.
- Stop/escalation conditions and recovery, compensation, or safe-abort guidance,
  including irreversible actions and limits of available recovery.
- Final success checks, retained execution evidence, actual last exercise/use
  context and limitations (or explicit unknown history), and maintenance triggers.

Branching, multiple roles, and automation MAY serve the bounded task. When the
reader must investigate an unexplained condition or select a different response,
hand off to a Playbook or responsible owner. A runbook MAY stand alone for
planned work. Document acceptance MUST NOT imply exercise or execution authority.
Unknown commands or recovery behavior MUST remain gaps, not invented procedures.
Common draft-gap allowances apply.

## Gather evidence

Inspect established commands and automation statically, their invocation
contracts, supported-context documentation, and retained exercise/use records.
Distinguish author review from successful execution by another person. Do not
execute procedure steps just to write or check the documentation.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Runbook
title: <Perform a bounded engineering or operations task>
description: <Recognized trigger or task and verifiable outcome>
status: draft
---

# <Perform a bounded engineering or operations task>

## Trigger, outcome, and supported context
## Prerequisites and inputs
## Procedure
## Stop, escalation, and recovery
## Completion evidence
## Exercise history, gaps, and maintenance
```

For each consequential step supply action, expected result, and failure path.
Put warnings and stop conditions before the action they govern. Link canonical
automation rather than duplicating it. Use `owned-by`, `applies-to`, `uses-tool`,
and `calls-procedure` as applicable; procedure calls must not form a cycle.

## Check and maintain

Could an appropriately authorized practitioner establish applicability and judge
success or safe abort without improvising? Review after procedure, version,
environment, permission, automation, or failure-handling changes. A rehearsal
requires its own execution scope and authority; retain who/what/when/context
only when evidenced. Successful task completion may still leave an incident
unresolved and require returning to its playbook.
