# Team record

Use for a group with collective responsibility and a collaboration interface.
Apply the [common profile](../references/profile.md). The Type contract is
normative for profile 0.5.0; the remaining sections guide authoring.

## Type contract

A Team MUST identify:

- Remit, responsibility boundaries, and capabilities offered to others.
- Primary organizational placement and consequential collaboration/handoff
  arrangements; organizational containment is distinct from collaboration.
- Accountability for the team and how to discover subjects it owns.
- Membership/contact directory authority, engagement channels, and applicable
  support expectations, escalation, and on-call references.
- Maintenance triggers and material gaps in these arrangements.

Membership changes alone MUST NOT create a new team identity. Do not impose
Team Topologies categories or invent support commitments. Record interaction
purpose, expectations, and duration where they affect use. Common draft-gap
allowances apply.

## Gather evidence

Use the team's charter or responsible lead, accepted working agreements,
directory, and support authorities. A chat channel, repository reviewer list,
or organization chart alone does not establish all responsibilities.
Keep changing membership and work queues linked to their owning systems.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Team
title: <Team name>
description: <Distinct remit and supported collaboration>
status: draft
---

# <Team name>

## Remit and boundaries
## Accountability and organizational placement
## Working with this team
## Support and escalation
## Authoritative directories, gaps, and maintenance
```

Author `part-of` and a primary `owned-by` when represented. Derive owned-service
or owned-tool lists from the subjects' edges. Name a responsible role and contact
authority when there is no represented owner; do not make the team own itself.
An optional interaction table can record counterpart, purpose, expectations,
and duration without introducing a new typed relationship.

## Check and maintain

Can another engineer tell when to engage this team, what to expect, and where
responsibility transfers? Review remit, placement, support, contact authority,
or working-agreement changes. Date consequential interaction snapshots.
