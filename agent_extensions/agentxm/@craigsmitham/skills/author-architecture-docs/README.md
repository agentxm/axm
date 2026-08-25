# Author architecture docs

Creates and revises human-readable software architecture docs that preserve
the smallest accepted semantic delta over repository and runtime authorities.

Use it for the required System, lifecycle, ownership, decision-policy, and assurance
concepts; accepted ADRs and subject-colocated functional, quality, process,
human-factors, usability, and constraint Requirements; responsibility and boundary
documents; corpus organization; offering and
value models; capability, feature, and surface models; DDD context views; C4
model views; Wardley-informed strategic views; and focused document reviews.
Do not use it for initial setup or whole-set maintenance, to choose among
architecture alternatives, to turn a proposal into accepted design, or to
mirror the implementation in prose. Product research, roadmaps, pricing,
sales, and marketing content remain outside the skill unless architecture
documentation is the requested artifact.

Every Just Enough Architecture Docs corpus must conform to OKF v0.2 and the
software-architecture-docs application profile. The skill routes each named
profile type to a concise one-artifact guide and creates only the requested
semantic artifact and required navigation. Unprofiled architecture material is
routed to setup for adoption or migration rather than treated as an alternative
authoring form. Adjacent additions, reductions, or reorganizations remain
grounded recommendations until the user authorizes them.

The bundled knowledge currently declares Candidate maturity; its concept
documents are draft and not human-verified. Repository-local accepted authority
continues to govern meaning; the application profile governs its required
representation and permitted variance.

Within the pack, initial adoption and system-to-corpus mapping belong to
`setup-architecture-docs`; a bounded new, revised, organized, or reviewed
artifact belongs here; established-corpus health and repair belong to
`reconcile-architecture-docs`.

This skill is a non-standalone member of the Gen Stack pack because
it loads that pack's software-architecture knowledge.

## Revision 4.1.0

- Routes the required System concept and unified Requirement type through
  focused guides alongside the existing context and decision concepts.
- Applies subject colocation, stable requirement IDs, six requirement types,
  and restrained traceability without verification-method metadata.
- Routes accepted invariants, guarantees, prohibitions, boundary rules, and
  required failure or recovery outcomes to Requirements while architecture
  concepts retain responsibility, authority, boundary, decision, and response.
- Enforces OKF v0.2 and profile `0.10.2` conformance.
- Keeps accepted Requirements even when code or tests expose the same
  predicate, and preserves linked evaluation redundancy without creating a
  second normative authority.
- Routes classification and all six requirement types through focused guidance,
  including explicit usability and human-factors boundaries.

This is a breaking change from `3.1.0`; rollback is to `3.1.0` and profile
`0.9.0`.

## Install

```bash
axm install @craigsmitham/packs/gen-stack
```

## Example

> Revise the reservation architecture docs so the C4 concept retains
> reservation-state responsibility, the accepted recovery invariant has one
> subject-colocated Requirement authority, and executable evidence remains
> linked rather than copied.

## License

MIT. The software-architecture knowledge bundle retains its separately declared
license.
