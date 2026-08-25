# Author architecture docs

Creates and revises human-readable software architecture docs that preserve
the smallest accepted semantic delta over repository and runtime authorities.

Use it for required system lifecycle, ownership, decision-policy, and assurance
concepts; accepted ADRs and binding constraints; responsibility and boundary
documents; product quality requirements; corpus organization; offering and
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

This skill is a non-standalone member of the software-architecture pack because
it loads that pack's software-architecture knowledge.

## Revision 3.1.0

- Routes all six system-context, decision, and constraint types through focused
  one-artifact guides rather than profile sections alone.
- Adds behavioral coverage for concise System Ownership and Architecture
  Decision Policy authoring, completing focused coverage for those six types.
- Retains strict OKF v0.2 and profile `0.9.0` conformance without changing the
  profile contract.

This is a nonbreaking authoring-guidance addition to `3.0.0`; rollback is to
`3.0.0`.
Behavioral regression and closure audit evidence must remain bound to the exact
`3.1.0` package and suite identities.

## Install

```bash
axm install @craigsmitham/packs/software-architecture
```

## Example

> Revise `docs/architecture/reservations.md` so it preserves the accepted
> reservation responsibility, recovery invariant, and evidence routes without
> duplicating the state-machine tests.

## License

MIT. The software-architecture knowledge bundle retains its separately declared
license.
