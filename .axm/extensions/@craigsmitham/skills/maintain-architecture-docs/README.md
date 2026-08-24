# Maintain architecture docs

Reviews and maintains an established set of software architecture docs through
evidence-aware repair, reconciliation, pruning, consolidation, and lifecycle
decisions.

Use it when architecture docs may be stale, broken, duplicated, contradictory,
or more costly than useful. Review requests remain read-only; explicit
maintenance requests authorize bounded mechanical and unambiguous repairs.
Semantic additions, removals, mergers, reclassification, and lifecycle or
authority changes require explicit user authorization for that class and scope;
otherwise the skill reports a risk-grounded recommendation. Do not use it for
initial setup, a known new architecture subject, choosing an architecture, or
generic documentation cleanup.

This skill is a non-standalone member of the software-architecture pack because
it loads that pack's software-architecture knowledge.

## Install

```bash
axm install @craigsmitham/packs/software-architecture
```

## Example

> Maintain the reservation platform architecture docs after the storage
> refactor. Repair objective link and navigation problems, but surface any
> desired-state disagreement instead of assuming the code is authoritative.

## License

MIT. The software-architecture knowledge bundle retains its separately declared
license.
