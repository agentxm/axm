# Software architecture knowledge

Portable, human-first guidance for preserving the durable semantic delta over
a repository through explicit responsibilities, boundaries, lifecycle,
stewardship, invariants, selected views, and evidence-aware architecture
documentation.

Use it to reason about offerings and value, goal-oriented behavior, functional
meaning and product quality requirements, capability and feature models,
domain-driven design, the C4 model, Wardley mapping, and small sets of
architecture docs. It is not a
repository-specific architecture, a record of unaccepted proposals, or a prose
mirror of current implementation details.

Just Enough Architecture Docs defines the philosophy, admission test,
authority model, and maintenance discipline. The bundled
`software-architecture-docs` application profile is the required OKF v0.2
representation and conformance contract for every corpus managed through the
software-architecture pack.

**Maturity:** Candidate. Every concept in this release is agent-generated,
marked `draft`, and not recorded as human-verified. Evaluate the guidance before
adopting it as an authority. Promote concepts individually only after actual
review or evidence from independent use supports the change.

## Revision 3.1.0

- Adds focused one-artifact guides for System Lifecycle, System Ownership,
  Architecture Decision Policy, System Assurance, Architecture Decision
  Record, and Architecture Constraint.
- Links each normative profile type directly to its focused procedure and
  indexes all six alongside the existing concept guides.
- Keeps profile `0.9.0` unchanged because the required representation and
  semantics have not changed; this release fills procedural guidance coverage.

This is a nonbreaking guidance addition to `3.0.0`; rollback is to knowledge
package `3.0.0` with the same profile `0.9.0` conformance contract.

Install it with:

```bash
axm install @craigsmitham/knowledge/software-architecture
```

To author or revise architecture documentation with the companion skill,
install the pack instead:

```bash
axm install @craigsmitham/packs/software-architecture
```

Start with `src/overview.md` for scope,
`src/architecture-documentation/index.md` for corpus adoption and
organization, or `src/guides/index.md` to author a profile concept or review
responsibilities through scenarios.

This knowledge package is licensed under the Creative Commons
Attribution-ShareAlike 4.0 International license (`CC-BY-SA-4.0`). The
reciprocal license applies to the package content; it does not automatically
apply to unrelated output created while using the package.
