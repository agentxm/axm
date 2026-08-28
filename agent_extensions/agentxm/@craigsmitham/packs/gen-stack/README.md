# Gen Stack

A human-governed software-change operating model that carries a Signal, need,
issue, or opportunity through proportional uncertainty reduction, coherent
change definition, implementation with focused review feedback, fresh
integrated review, authorized shipping, and renewed observation.

The canonical Process definition and operating-model diagram live in
[`knowledge/gen-stack/src/processes/deciding-and-realizing-software-changes.md`](../../knowledge/gen-stack/src/processes/deciding-and-realizing-software-changes.md).
The diagram is a view of that Process, not a second authority:

```text
Signal, need, issue, or opportunity
                  ↓
                /shape
          ↙               ↘
    /research         /investigate
          ↘               ↙
                 Pitch
                    ↓
                 Change
          /spec ⇄ /design
             ↖ /quick-change ↗
                    ↓
           Change coherence gate
                    ↓
                  /plan
                    ↓
       /implement ⇄ focused review
                    ↓
                 /review
                    ↓
             Release readiness gate
                    ↓
                  /ship
                    ↓
       Observe, evaluate, learn, compact
                    └───────────────↺
```

Shape may draft immediately, draft provisionally and elicit, discover first,
or terminate. Research and investigation are optional and may be re-entered
whenever material uncertainty appears. Specification-first and design-first
work are both valid, and `/quick-change` produces both canonical artifacts in
one response. Every route must converge on one Change whose exact Change
Specification and Change Design revisions are coherent before planning. Review
feedback may course-correct stable implementation increments; a fresh
integrated Review recommends a route for the exact final candidate but does not
authorize release. Shipping is one exact final action under separately
established authority.

## Included extensions

| Extension | Role |
| --- | --- |
| `@craigsmitham/knowledge/gen-stack` | Canonical terminology, Process, authority, corpus, work-item, Architecture, Implementation, Evaluation, and learning guidance |
| `@craigsmitham/skills/gen-stack` | Explain, adopt, and maintain Gen Stack meaning and orient requests to focused stages |
| `@craigsmitham/skills/shape` | Turn raw or mixed change context into a bounded, repository-grounded, test-agnostic Pitch before specification or design |
| `@craigsmitham/skills/research` | Frame and execute bounded, read-only evidence research |
| `@craigsmitham/subagents/researcher` | Perform one fresh, isolated Research framing or evidence phase |
| `@craigsmitham/skills/investigate` | Diagnose a concrete observed condition with discriminating evidence |
| `@craigsmitham/skills/spec` | Produce the human-ratifiable Requirement, Architecture, and semantic Protocol delta without prescribing test realization |
| `@craigsmitham/skills/design` | Compare responses, realize accepted Architecture, and design required Protocol realization plus optional local conformance Evaluations |
| `@craigsmitham/skills/quick-change` | Produce the canonical Change Specification and Change Design together, reconcile them, and return a thin Change handoff |
| `@craigsmitham/skills/plan` | Sequence architectural realization, required Protocol feedback, and proportional focused review checkpoints into an implementation-ready plan |
| `@craigsmitham/skills/sync-change` | Synchronize an exact landed change artifact or deliberately project an exact plan into host-native implementation records with persisted fidelity verification |
| `@craigsmitham/skills/implement` | Realize an authorized plan incrementally, using Protocol Results and focused review actions as feedback |
| `@craigsmitham/skills/review` | Assess stable checkpoints through focused lenses and independently assess the exact final candidate through all assurance areas |
| `@craigsmitham/subagents/reviewer` | Perform one fresh-context, read-only focused checkpoint or integrated final review |
| `@craigsmitham/skills/ship` | Execute one authorized final action and verify persisted state |

Gen Stack orchestration consults an applicable adopted corpus and records a
truthful disposition for each stage. Generic capabilities such as Research
return their native evidence artifacts; the Gen Stack caller adds stage and
corpus meaning without pushing those semantics into the capability. Evidence
never rewrites accepted meaning automatically.

## Install

```bash
axm install @craigsmitham/packs/gen-stack
```

Pack `4.2.0` adds host-neutral exact artifact synchronization across Shape,
Change coordination, Spec, Design, and Plan outputs. The cross-cutting
`sync-change` skill preserves one canonical home, inspects the selected host at
runtime, limits mutation to explicit scope, reads persisted state back, and
reports fidelity. Deliberate plan projection is separately authorized and does
not become another lifecycle stage or replace the canonical plan.

Pack `4.1.0` adds the fresh read-only Reviewer, proportional focused
Architecture, Requirements, Evaluations, and Implementation review checkpoints,
explicit action disposition during implementation, and a compact integrated
final Review result. Checkpoint feedback remains distinct from Protocol Results
and final release-readiness assessment.

Pack `4.0.0` adopts Change as the coordination case, makes Change Specification
and Change Design sibling artifacts with shared canonical fallbacks, classifies
remedial Changes as Bugfixes, and adds `/quick-change` for producing and
reconciling both artifacts in one response.

Pack `3.2.0` adds evidence-guided implementation planning: architecture-bearing
prerequisites precede dependent behavior, required Requirement and Architecture
Protocol Executions guide implementation increments, and final Results remain
exact-revision exit evidence. Implementation-conformance Evaluations stay
separate and delegated unless an accepted input requires them.

Pack `3.1.0` adds shaping and the provisional Pitch before specification and
design, complete Spec and Design presentation contracts, full Architecture
ratification, and the semantic-Protocol-versus-technical-realization boundary.
Pack `3.0.0` introduced the focused change-realization stages and
incorporates Research `3.0.0` plus the Researcher subagent. It deprecates the
separate QRSPI pack and Question skill; Research now owns bounded Research Brief
framing while remaining independent of Gen Stack stage and corpus semantics.

The Gen Stack corpus remains human-governed. Agents can gather evidence,
develop candidates, compare options, recommend, draft, encode explicitly
ratified meaning, and execute authorized mutations. They cannot infer semantic
acceptance or release authority from workflow position, implementation,
evaluation results, or artifact polish.

## Attribution and license

The synthesis was influenced by Chad Fowler's
[The Generative Stack](https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/)
and John R. Boyd's
[The Essence of Winning and Losing](https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf).
See `THIRD_PARTY_NOTICES.md` for provenance.

The pack metadata and README are MIT-licensed. Each member retains the license
declared in its manifest.
