# Tool record

Use for an engineering instrument as locally adopted and supported.
Apply the [common profile](../references/profile.md). The Type contract is
normative for profile 0.5.0; the remaining sections guide authoring.

## Type contract

A Tool MUST identify:

- Supported engineering tasks, selection rationale or decision reference, and
  any local adoption restrictions.
- Adopted distribution, version authority, provider/source where applicable,
  and installation/configuration authorities and prerequisites.
- Supported entry points and consequential local conventions; material inputs,
  outputs, integrations, and dependencies.
- Local limitations, support/accountability, upgrade/recovery guidance, and
  maintenance triggers.

Tool adoption policy MUST remain separate from document status. Version facts
SHOULD link to manifests or managed configuration instead of maintaining another
version list. Generic product usage SHOULD link upstream. Common draft-gap
allowances apply; selection rationale does not confer organizational approval.

## Gather evidence

Inspect manifests, lockfiles, installed-state evidence when authorized, local
configuration, accepted selection decisions, and task entry points. Separate a
package dependency from a locally supported instrument. A hosted Tool may link
to a Provider record owning account, billing, and recovery arrangements.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Tool
title: <Tool and local use>
description: <Supported engineering task and distinctive local conventions>
status: draft
---

# <Tool and local use>

## Purpose and adoption
## Distribution, setup, and access
## Supported usage
## Inputs, outputs, and connections
## Limitations, support, and recovery
## Gaps and maintenance
```

Use `owned-by`, `provided-by`, `uses-provider`, `source-in`, `runs-in`, and
`depends-on` as applicable. Qualify toolchain dependencies as build/runtime/
operational. Document software operation as a Service instead when that is the
distinct responsibility being maintained; do not duplicate the same subject.

## Check and maintain

Can an engineer find the supported installation, applicable usage, and version
authority without copying upstream manuals? Review upgrades, configuration,
integration, task entry point, support, or adoption-policy changes.
