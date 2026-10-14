---
type: Explanation
title: Portability and compatibility
description:
  How to keep a portable core while making host requirements and degradation
  explicit.
tags: [agent-skills, portability, compatibility, hosts]
status: stable
generated: { by: "codex/gpt-6", at: 2026-10-01T03:12:00Z }
stale_after: 2027-02-14
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
---

# Portability and compatibility

Portable skills depend first on the open package contract: a named directory,
`SKILL.md`, portable frontmatter, relative resource paths, and declared runtime
requirements.[^agent-skills-spec] Host- and extension-manager-specific metadata
should refine this core without making the core misleading.

## Define the supported surface

A compatibility claim names a product, its execution surface, and any required
edition, release, configuration, or plugin. A vendor name or model provider is
not a host identity. A desktop application's built-in agent, an external agent
attached to that application, a CLI, a hosted workflow, and an SDK can have
different extension contracts even when they share branding or model access.
Framework features do not establish the behavior of every application built on
that framework.

For every claimed surface, identify discovery locations, invocation controls,
supported frontmatter, tool semantics, path behavior, limits, and distribution
mechanism. Classify the result as:

- **portable** — the same package preserves its contract;
- **adapted** — a small host-owned adapter or metadata file is required;
- **degraded** — the central outcome remains but a named capability is lost; or
- **unsupported** — the job cannot be fulfilled honestly.

Do not claim compatibility from syntax alone. Exercise routing, resource
loading, scripts, permissions, and observable outcomes on each named host and
model. Unknown behavior is unknown, not portable by default.

## Separate the evidence

Keep these claims independently attributable:

| Claim                      | Evidence needed                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Native availability        | Primary documentation or source for the named surface, with review date and conditions.                      |
| Native representation      | Documented discovery, grammar, scope, and lifecycle mechanics. A feature can exist before these are modeled. |
| Extension-manager delivery | An implemented writer or an explicit manual delivery contract for the selected artifact and scope.           |
| Configuration verification | Attributable evidence that the manager produced and managed the expected artifact.                           |
| Runtime verification       | Attributable evidence that the named host discovered, invoked, and used it as claimed.                       |

Missing documentation is unknown availability, not evidence of absence. A
homepage review does not renew a capability review, and a documentation review
does not renew runtime verification. Preserve what was checked, when, and what
remains unreviewed. A passing configuration test does not prove vendor
execution, policy enforcement, or behavior on another surface.

Named features also need semantic qualification. Built-in delegation does not
establish installable custom subagent definitions; an accepted hook declaration
does not establish execution of that handler type; an MCP connection definition
does not establish a live connection. A shared filename does not establish equal
discovery, precedence, grammar, permissions, or removal behavior.

Scope lifecycle claims to the vendor, product, surface, or edition actually
affected. A consumer edition can retire while paid or enterprise access
continues. An evidenced rename can preserve product identity without preserving
every configuration path. Keep dated product inventories in their catalog and
link to them from authoring guidance.

## Apply host and manager profiles

Treat host adaptation and extension management as independent axes. A host owns
runtime discovery and invocation; an extension manager may own canonical
packages, projections, composition, installation, and lifecycle across several
hosts. For an AXM-managed package, apply the
[AXM extension-management profile](platforms/axm.md) in addition to every
claimed host profile.

[^agent-skills-spec]: Agent Skills specification
