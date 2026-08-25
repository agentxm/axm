# Software architecture knowledge

Portable, human-first guidance for preserving the durable semantic delta over
a repository through explicit architecture subjects, responsibilities,
boundaries, lifecycle, stewardship, selected views, and evidence-aware
documentation, with accepted obligations owned by Requirements colocated
beneath their architecture subjects.

Use it to reason about requirement engineering and classification across all
six profile types, offerings and value, goal-oriented behavior, capability and feature models,
domain-driven design, the C4 model, Wardley mapping, and small sets of
architecture docs. It is not a
repository-specific architecture, a record of unaccepted proposals, or a prose
mirror of current implementation details.

Just Enough Architecture Docs defines the philosophy, admission test,
authority model, and maintenance discipline. The bundled
`software-architecture-docs` application profile is the required OKF v0.2
representation and conformance contract for every corpus managed through the
Gen Stack pack.

**Maturity:** Candidate. Every concept in this release is agent-generated,
marked `draft`, and not recorded as human-verified. Evaluate the guidance before
adopting it as an authority. Promote concepts individually only after actual
review or evidence from independent use supports the change.

## Revision 4.1.0

- Adds `System` to the required root kernel and a unified, subject-colocated
  `Requirement` model with stable IDs and six requirement types.
- Adds restrained source and derivation traceability while keeping verification
  techniques and volatile evidence backlinks outside requirement metadata.
- Adds practical requirements-engineering guidance from source concern through
  acceptance, individual verification and validation, bounded set review,
  architecture response, evidence, and controlled change.
- Makes Requirement the sole normative owner for accepted system obligations,
  including invariant, guarantee, prohibition, boundary, failure, recovery,
  dependency, and process semantics, while architecture retains subject,
  responsibility, authority, decision, relationship, and response.
- Permits tests and evaluations to repeat Requirement predicates while keeping
  the stable Requirement as the sole normative authority, and distinguishes
  evaluation definitions, executions, results, observations, and decisions.
- Distinguishes the quality of every Requirement from a quality Requirement and
  adds actionable writing questions, repair examples, and assessable quality
  guidance without importing a full management schema.
- Adds an ISO-based classification crosswalk, human-centred foundation, and one
  focused authoring procedure for every profile requirement type.
- Replaces separate Architecture Constraint and Product Quality Requirement
  types and their top-level collections with constraint and quality
  specializations of Requirement.
- Advances the normative profile to `0.10.2` and updates its validator,
  synthetic reference corpus, focused guides, and migration contract.

This is a breaking representation change from `3.1.0`; rollback is to knowledge
package `3.1.0` and profile `0.9.0`.

Install it with:

```bash
axm install @craigsmitham/knowledge/software-architecture
```

To author or revise architecture documentation with the companion skill,
install the pack instead:

```bash
axm install @craigsmitham/packs/gen-stack
```

Start with `src/overview.md` for scope,
`src/architecture-documentation/index.md` for corpus adoption and
organization, or `src/guides/index.md` to author a profile concept or review
responsibilities through scenarios.

This knowledge package is licensed under the Creative Commons
Attribution-ShareAlike 4.0 International license (`CC-BY-SA-4.0`). The
reciprocal license applies to the package content; it does not automatically
apply to unrelated output created while using the package.
