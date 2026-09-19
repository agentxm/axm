# Repository record

Use for a source-control repository with its own identity and lifecycle.
Apply the [common profile](../references/profile.md). The Type contract is
normative for profile 0.5.0; the remaining sections guide authoring.

## Type contract

A Repository MUST identify:

- Purpose, intended contents, canonical remote, hosting authority, and accountability.
- Related software/artifacts and significant structural or ownership boundaries.
- Authoritative setup, contribution, build, test, and verification entry points.
- Delivery artifacts, release guidance, and downstream consumers where applicable.
- Access/governance authority, maintenance state, archive/transfer arrangements,
  gaps, and maintenance triggers.

A repository MUST NOT imply exactly one Service. A README or contribution guide
that already owns these facts SHOULD remain canonical. Do not duplicate command
instructions or infer operational ownership solely from CODEOWNERS review routing.
Common draft-gap allowances apply.

## Gather evidence

Inspect the canonical remote, README, contribution guidance, workspace manifests,
build/release configuration, and responsibility sources. Mirrors are secondary
references. Distinguish source ownership, artifact publication, and runtime
operation when they belong to different groups.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Repository
title: <Repository name>
description: <Purpose and distinctive software or artifact scope>
status: draft
---

# <Repository name>

## Purpose and canonical identity
## Accountability and structure
## Development interface
## Delivery and consumers
## Lifecycle, gaps, and maintenance
```

Use `owned-by` and `hosted-by`. Derive software discovery from Service/Tool
`source-in` edges; qualify monorepo subpaths at those sources. A small local
record may link to the existing README for most details. An existing README
may itself serve as the canonical record when selected and host-compatible.

## Check and maintain

Can a new maintainer find the right remote, development instructions, outputs,
and responsible owner? Review remote/host changes, reorganized subpaths, build
and release changes, ownership transfers, and archival. Update incoming links
and historical mappings when the canonical identity moves.
