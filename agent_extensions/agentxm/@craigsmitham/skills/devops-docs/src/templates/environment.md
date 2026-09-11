# Environment record

Use for a local, CI, deployed, shared, or ephemeral execution context.
Apply the [common profile](../references/profile.md). The Type contract is
normative for profile 0.5.0; the remaining sections guide authoring.

## Type contract

An Environment MUST identify:

- Purpose, classification, scope, and material account/network/region/tenancy
  or other isolation boundaries.
- Intended software placement and configuration/infrastructure authorities,
  including deliberate differences from other contexts.
- Permissible data, fixtures, persistence/retention, and reset rules where
  applicable, grounded in their authorities.
- Accountability, access and change expectations, development and operating procedures,
  readiness criteria, and creation/reset/retirement lifecycle.
- Verification limitations, gaps, and maintenance triggers.

An environment MUST NOT be assumed persistent or deployable. Intended placement
and observed deployment/health MUST remain separate. Never invent data policy,
access grants, or a parity requirement. Common draft-gap allowances apply.

## Gather evidence

Inspect infrastructure and workflow configuration, account mappings, data
policies, setup/reset procedures, and dated observations. Record which source
owns each setting. Highlight meaningful differences instead of copying complete
configuration sets into Markdown. Do not treat a named environment as a fixed
bundle of settings when the implementation manages them independently.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Environment
title: <Execution context>
description: <Purpose, users, and distinguishing boundary>
status: draft
---

# <Execution context>

## Purpose and boundaries
## Configuration and intended participants
## Data and lifecycle rules
## Access, change, and procedures
## Readiness evidence, gaps, and maintenance
```

Use `owned-by` and `uses-provider` here. Derive participant lists from Service
or Tool `runs-in` edges, naming the source. A context comparison table is useful
only when it exposes consequential differences and identifies their authority.

## Check and maintain

Can a reader identify the right context, its permitted data, source of settings,
and safe reset/retirement route? Review boundary, account, configuration, data,
access, lifecycle, or participant changes. Do not run resets during authoring.
