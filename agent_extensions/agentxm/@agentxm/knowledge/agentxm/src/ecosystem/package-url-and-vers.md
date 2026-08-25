---
type: Explainer
description: How Package URL identifies software packages across ecosystems and VERS expresses their compatible version ranges.
tags: [purl, vers, software-packages, companion-packages]
status: stable
generated:
  by: openai/codex
  at: 2026-08-14T00:43:46Z
sources:
  - id: purl
    resource: https://www.packageurl.org/docs/purl/introduction
    title: Package URL introduction
  - id: vers
    resource: https://www.packageurl.org/docs/vers/introduction
    title: VERS introduction
---

# Package URL and VERS

Package URL (PURL) is a standard syntax for identifying software packages
across package managers, platforms, and ecosystems.[^purl] VERS is a related
syntax for expressing package version ranges together with the ecosystem
semantics needed to interpret them.[^vers]

A PURL begins with `pkg:` and describes a package through parts such as its
type, optional namespace, name, version, qualifiers, and subpath. Which parts
are meaningful depends on the PURL type. The **namespace** here is the formal
PURL component; it is not an AgentXM handle or registry scope.

VERS pairs a version scheme with a range expression so tools can exchange
constraints without assuming every ecosystem uses the same version syntax or
ordering rules.

## What the standards provide

Together, PURL and VERS make software-package identity and compatibility more
portable across ecosystems. They help discovery, software composition analysis,
vulnerability matching, and other tools exchange precise package references.

They do not prove that a package exists, establish its authenticity, install
it, or create a dependency. A package identity, a selected package version, and
a permitted version range are separate concepts.

## Relationship to AgentXM

AgentXM uses PURL to identify a **software package** and PURL plus optional VERS
to describe a **companion package** relationship. A companion package is
software that an extension supports or accompanies. The relationship improves
discovery; AXM does not install the software package.

A PURL is not an AgentXM extension FQN. A VERS range is not an AgentXM extension
version constraint. AgentXM schemas and behavior define how companion-package
metadata is accepted and used, while PURL and VERS remain authoritative for
their respective external syntaxes.

[^purl]: Package URL introduction.

[^vers]: VERS introduction.
