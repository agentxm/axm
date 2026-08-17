# Software architecture

Durable structural decisions and the functional and quality concerns that give
them meaning. Use this section when implementation details are insufficient to
explain what the system must continue to preserve and why.

## Start here

- [Software architecture overview](overview.md) - What software architecture owns, what it deliberately leaves to other authorities, and how it relates desired structure to current implementation.

## Boundaries and change

- [Responsibilities and non-responsibilities](responsibilities-and-non-responsibilities.md) - How stating both what an element owns and what it excludes prevents overlapping authority and accidental coupling.
- [Boundaries, authority, and state](boundaries-authority-and-state.md) - How authority and state ownership give structural boundaries meaning and constrain what may cross them.
- [Dependency direction and change](dependency-direction-and-change.md) - How information hiding and dependency direction limit the effects of likely change and preserve policy ownership.

## Confidence and communication

- [Invariants, preservation, and enforcement](invariants-and-enforcement.md) - What makes a property invariant, how state and observation boundaries qualify its preservation, and how invariants relate to requirements, correctness, and enforcement.
- [Expressing invariants](expressing-invariants.md) - How to distinguish an invariant from neighboring requirements, state its scope and observation boundary precisely, and connect it to preservation obligations and evidence.
- [Views and concerns](views-and-concerns.md) - Why architecture uses concern-specific views and how to keep multiple views from becoming competing models of the system.

## Documentation and quality

- [Quality characteristics and architectural concerns](quality-characteristics-and-architectural-concerns.md) - How quality characteristics become contextual, assessable concerns that matter to architecture, and how scenarios and evidence make them useful without turning a taxonomy into a checklist.
- [Just Enough Architecture Docs](just-enough-architecture-docs.md) - A candidate pattern for preserving accepted, durable functional, quality, and structural meaning that executable sources cannot reveal reliably, without maintaining a parallel specification corpus.
- [Applying Just Enough Architecture Docs](applying-just-enough-architecture-docs.md) - How to adopt the pattern, select architecture-document subjects and views, write durable concerns, connect executable evidence, and migrate an existing corpus.
