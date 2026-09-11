# Organization record

Use for an organizational entity with purpose and an authority boundary.
Apply the [common profile](../references/profile.md). The Type contract is
normative for profile 0.5.0; the remaining sections guide authoring.

## Type contract

An Organization MUST identify:

- The represented entity, purpose, organizational boundary, and primary placement.
- Responsibilities and decision authority held at this level, with their sources.
- How to discover constituent teams and directly accountable subjects.
- Authoritative directories/contact routes, shared policies, and agreements
  relevant to engineering and operations.
- Maintenance triggers, identity changes, and material gaps.

Organizational containment MUST NOT imply every accountability or permission.
Do not create an Organization for a provider tenant solely because the vendor
uses that label. A rename or membership change alone need not create a new
subject; explain material mergers/splits and preserve interpretation of history.
Common draft-gap allowances apply.

## Gather evidence

Inspect charters, accepted responsibility assignments, organizational directories,
policies, and agreements. Distinguish the group, its legal entity where relevant,
roles, and the people currently filling them. Link personal details and changing
rosters to their owning directory instead of reproducing them unnecessarily.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Organization
title: <Organizational entity>
description: <Purpose and distinguishing responsibility boundary>
status: draft
---

# <Organizational entity>

## Purpose and organizational boundary
## Responsibilities and decision authority
## Structure and discovery
## Directories, policies, and agreements
## History, gaps, and maintenance
```

Use `part-of` for primary placement and `owned-by` when appropriate; never use
a self-edge to complete accountability. A responsible role/contact authority
can supply accountability for a root organization. Team and subject inverse
lists are derived from their canonical relationships.

## Check and maintain

Can an engineer determine which decisions this organization owns and how to
reach the responsible people? Review reorganizations, authority transfers,
directory changes, and policy/agreement changes. Preserve effective context
where earlier evidence names a previous organizational arrangement.
