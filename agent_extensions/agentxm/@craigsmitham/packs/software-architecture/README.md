# Software architecture

Software architecture knowledge and focused workflows for setting up,
authoring, and reconciling architecture docs that preserve accepted, durable
functional meaning, product quality requirements, and structural meaning
without copying facts that executable or live sources own better.

## Included extensions

| Extension | Role |
| --- | --- |
| `@craigsmitham/knowledge/software-architecture` | Human-first, risk-driven architecture meaning; the mandatory lifecycle, ownership, decision-policy, and assurance kernel; named decisions and constraints; product quality requirements; selected views; and the Just Enough Architecture Docs pattern |
| `@craigsmitham/skills/setup-architecture-docs` | Establish the system boundary, root, required context kernel, local adoption, authority routes, maintenance triggers, and agent discovery without inferred architecture |
| `@craigsmitham/skills/author-architecture-docs` | Create or revise an explicitly requested profile concept, including context, ADR, and constraint concepts, while routing exact current facts to their authorities |
| `@craigsmitham/skills/reconcile-architecture-docs` | Reconcile established docs and profile migrations through bounded repair, making semantic changes only with explicit user authority |

The three skills are non-standalone: they load the bundled knowledge through
its canonical AXM path and are distributed through this pack. The knowledge
bundle remains useful on its own. It currently declares Candidate maturity,
with draft, not human-verified concept documents. Just Enough Architecture Docs
defines the philosophy; every corpus managed by the pack must represent it as
OKF v0.2 and conform to the bundled software-architecture-docs profile.
Repository-local accepted authority governs meaning, while the profile governs
representation and permitted variance.

## Revision 0.6.0

This release updates the pack floors to knowledge `3.1.0`, authoring `3.1.0`,
setup `0.5.0`, and reconciliation `0.3.0`. Every one of profile `0.9.0`'s 23
concept types now has a focused one-artifact guide, including the four required
root system-context concepts, accepted ADRs, and binding constraints. The
profile contract is unchanged; rollback is to pack `0.5.0` and its prior member
versions.

## Install

```bash
axm install @craigsmitham/packs/software-architecture
```

## Workflow

- Ask to set up architecture docs when adopting the method or connecting an
  existing documentation root.
- Ask to author architecture docs when accepted meaning needs a bounded new or
  revised, organized, or individually reviewed home.
- Ask to reconcile architecture docs when established docs
  need review, repair, reconciliation, consolidation, pruning, or lifecycle
  attention.
- Use the knowledge bundle directly to reason about responsibilities,
  boundaries, dependency direction, invariants, offerings, audiences, needs,
  jobs to be done, value propositions, use cases, capabilities, features,
  surfaces, product quality requirements, DDD contexts, C4 structures, or
  Wardley mapping.
- Keep undecided alternatives in proposals and precise current facts in their
  executable or live authorities.

## Evaluation cases

Each skill includes a behavioral suite. Together they check minimal adoption,
workflow routing boundaries, accepted desired-state handling, authority
reconciliation, demand-and-value separation, product-quality authority, C4
containment, strategic freshness, maintenance lifecycle decisions, and
resistance to empty scaffolding or exhaustive prose mirrors. Focused execution
cases cover all six system-context, decision, and constraint types.

## License

The pack's own metadata and README are licensed under MIT. Each member retains
the license declared in its manifest. See the repository for source attribution
and provenance.
