# Provider record

Use for our relationship with a supplier, adopted offerings, and accounts.
Apply the [common profile](../references/profile.md). The Type contract is
normative for profile 0.5.0; the remaining sections guide authoring.

## Type contract

A Provider MUST identify:

- Offerings used, purpose, and evidence distinguishing planned/configured use
  from observed adoption.
- Account/tenant/subscription identity, console or inventory authority, and
  environment mappings when relevant. Explicitly state the grouping boundary.
- Relationship accountability, administrators, operating identities, access
  mechanisms, credential references, effective-scope authority, and recovery owner.
- Applicable commercial plan, billing/budget authority, renewal/cancellation
  conditions, and agreement/SLA references, or justified non-applicability.
- Material constraints and consumers affected by replacement or cancellation,
  engineering and operations guidance, dated verification/gaps, and maintenance triggers.

Account details MUST NOT imply that a brand is a single legal entity or account.
Separate records when administration, ownership, or maintenance is independent.
The provider's SLA MUST NOT be presented as our own service commitment.
Common draft-gap allowances apply; restricted values remain in their authorities.

## Gather evidence

Inspect authorized account inventories, configuration, billing and agreement
references, access directories, and recovery guidance. A configured SDK does
not prove a paid subscription, active traffic, or effective access. Name the
missing source when those facts cannot be established.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Provider
title: <Supplier and relationship scope>
description: <Adopted offerings and distinguishing account scope>
status: draft
---

# <Supplier and relationship scope>

## Purpose and adopted offerings
## Accounts and operating contexts
## Accountability, access, and recovery
## Commercial arrangements and authorities
## Constraints and usage guidance
## Verification, gaps, and maintenance
```

Use a compact account table when several accounts share this record. Record
`owned-by` here. Discover consumers from their `uses-provider`, `provided-by`,
or `hosted-by` edges; label any inverse list as derived.

## Check and maintain

Can a maintainer identify the correct account, responsible role, access route,
agreement authority, and cancellation dependencies? Review after account,
administrator, recovery, offering, commercial-term, or consumer changes. Keep
dated observations distinct from current authoritative links.
