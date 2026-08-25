# Gen Stack

An opinionated generative software stack for carrying authoritative intent
through design, implementation, and independent evidence loops.

The pack composes software-engineering and software-architecture guidance around
one governing distinction: Requirements are the normative authority for accepted
obligations; tests, evaluations, implementation, and operational observations are
witnesses. A witness may intentionally repeat a Requirement word for word without
becoming a second authority.

## Included extensions

| Extension | Role |
| --- | --- |
| `@craigsmitham/knowledge/gen-stack` | Cross-cutting doctrine for authority, evidence, feedback, trust, compaction, and bounded regeneration |
| `@craigsmitham/knowledge/software-engineering` | Work-item and evidence-timed change guidance |
| `@craigsmitham/knowledge/software-architecture` | Requirements, architecture meaning, decisions, boundaries, and the required OKF profile |
| `@craigsmitham/skills/author-software-work-items` | Capture work with explicit Requirement, architecture, and evidence impact |
| `@craigsmitham/skills/author-architecture-docs` | Author accepted architecture and Requirement semantic deltas |
| `@craigsmitham/skills/setup-architecture-docs` | Establish the smallest conforming architecture authority |
| `@craigsmitham/skills/reconcile-architecture-docs` | Reconcile authority, witnesses, and corpus conformance |
| `@craigsmitham/rules/yagni` | Defer speculative commitments while preserving costly options cheaply |
| `@craigsmitham/rules/tidy-first` | Consider the smallest useful structural preparation before behavior change |

## Install

```bash
axm install @craigsmitham/packs/gen-stack
```

## Working model

1. Establish or identify the Requirement authority before treating an observed
   predicate as intended behavior.
2. Classify each work item's possible Requirement impact without silently
   authoring, changing, or retiring an obligation.
3. Make architecture and implementation changes within explicit boundaries.
4. Evaluate the result through deliberately redundant witnesses tied back to
   stable Requirement identities.
5. Treat results and observations as evidence for a human or authorized
   governance decision, never as automatic edits to intent.
6. Prefer changes that remain observable, containable, reversible, and cheap to
   regenerate or delete.

The adoption ladder is incremental. Installing the pack does not imply that a
repository has automated regeneration, complete evaluation coverage, or a
proven production feedback loop.

## Migration from the former packs

`@craigsmitham/packs/software-engineering` and
`@craigsmitham/packs/software-architecture` are superseded compositions. Remove
both and install this pack explicitly. They are not aliases: the Gen Stack adds
cross-cutting authority and feedback semantics that neither former pack could
express alone.

Published versions of the former packs remain available for reproducibility.
Their constituent extensions also remain independently reusable where their
declared standalone and dependency contracts permit it.

## Attribution

This pack's synthesis was influenced by Chad Fowler's essay
[Regenerative Software](https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/).
The repository does not vendor Fowler's prose or diagrams. See
`THIRD_PARTY_NOTICES.md` for provenance.

## License

The pack metadata and README are MIT-licensed. Each member retains the license
declared in its manifest.
