---
type: Explainer
title: Documentation audits
description: How a documentation audit can explain a reader’s difficulty across several accurate pages, and how its coverage limits the findings.
tags: [docs, audit, assessment, quality, evidence, coverage, findings, remediation]
status: stable
sources:
  - id: documentation-quality
    resource: documentation-quality.md
    title: Documentation quality
  - id: documentation-organization
    resource: documentation-organization-and-discovery.md
    title: Documentation organization and discovery
generated: { by: codex/gpt-6, at: 2026-11-22T01:48:07Z }
---

# Documentation audits

When readers keep running into trouble across a collection of documents,
which problems deserve attention first? A **documentation audit** examines
a defined set of documents as they stood at a particular point in time.
Its findings show where the collection falls short for readers or maintainers
and explain which repairs deserve attention first. The repairs themselves
are a separate piece of work.

Suppose the links in a payroll handbook all pass an automated check, yet
new employees keep asking when their first timesheet is due. Reviewing the
timesheet page in isolation turns up a deadline consistent with the payroll
calendar. Why does the question keep coming back?

## What becomes visible across pages

Imagine entering the handbook from the welcome email. Its link opens the
current timesheet page. Entering through the onboarding index opens last
year’s calendar, still online for employees correcting old submissions.
Each destination exists and each date is accurate for its year. Only by
following the two routes for the same reader can a reviewer see how the
handbook gives a new employee two answers. The old calendar also serves
a real purpose. Deleting it would break a route that works.[^documentation-organization]

A link check established that both destinations exist. Comparing the
calendars to the payroll schedule established which deadline applied to
each year. Following the onboarding route showed *who* would see the wrong
year *when*. These observations together explain why changing the index
entry would help. Whether that change reached employees is a further
question that can be checked after the edit.[^documentation-quality]

## How far a finding reaches

An audit claim is only as strong as its evidence and declared coverage.
A census of links can locate every link to the old calendar in a specified
edition. Walking the two routes in this example shows which deadline a new
employee would encounter on each. Neither observation says how many
employees used the index. Support questions can establish that people
were confused about the deadline. Unless the questions record how people
arrived, their cause remains an inference.

That limit matters when prioritizing a repair. **Severity** estimates what
happens to the reader if the condition persists. **Confidence** reflects
the strength and coverage of the evidence. A missed pay cycle could have
serious consequences even if the auditor knows of only one misleading
route. The finding can name that consequence, identify the specific entry
that needs repair, and leave the frequency open. A single health score
would hide the distinction.

In this case, the absence of a payroll FAQ adds nothing to the finding.
The handbook already contains the answer. A missing page would matter if
a reader needed information they could not get, or if the organization
had committed to publishing it.

A different audit question calls for different evidence. A maintainer
concerned about obsolete policy might trace every current claim to its
owner. A writer concerned about first-time setup might follow a sample of
newcomers’ tasks from search to completion. Both can produce actionable
findings if the report identifies the population, the portion examined,
what worked, and where the evidence ends.

## Related

- [Documentation audit report contract](../guides/auditing-documentation.md)
- [Documentation quality](documentation-quality.md)
- [Documentation organization and discovery](documentation-organization-and-discovery.md)
- [Documentation craft](documentation-craft.md)
- [Documentation workflow](documentation-workflow.md)

[^documentation-quality]: Documentation quality distinguishes objective,
    independently checkable functional qualities from interdependent qualities
    of human fit and flow.
[^documentation-organization]: [Documentation organization and discovery](documentation-organization-and-discovery.md).
