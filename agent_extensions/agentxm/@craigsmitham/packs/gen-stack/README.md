# Gen Stack

Gen Stack is an opinionated, human-governed realization of the generative-stack
idea: carry human intent to verified behavior through explicit, composable
layers, then return operational evidence to the loop. It combines that layered
pipeline with OODA and a concrete process for bounded software change.

People or institutions still accept desired meaning and authorize mutations and
release. Agents and tools may gather evidence, develop candidates, execute
authorized work, and report results; Gen Stack does not confer autonomy.

## The stack

```text
Signals and observations
          ↓  orient and decide
        Intent
      shapes both
     ↙           ↘
Architecture ⇄ Requirements
     ↘           ↙
  Compilation + Evaluation Protocols
          ↓               ↓
  Implementation + Evaluation Executions
          └──────→ Results and observations ───↺
```

| Layer | Owns | Typical home |
| --- | --- | --- |
| Inputs and feedback | What happened, its provenance, and uncertainty | Source systems, telemetry, incidents, research, Results, and Observations |
| Intent | Human direction, value, actors, and problem context | Governed concepts in `gen-stack/intent/` |
| Architecture and Requirements | Durable system shape and accepted obligations on it | Co-developed concepts in `gen-stack/architecture/` |
| Change and compilation | A bounded why, what, how, and translation into realization | Conversation or work-item host |
| Evaluation | Durable assessment claims and revision-bound evidence | Protocols in `gen-stack/evaluations/`; Suites, Executions, and Results in native tools |
| Implementation | Realized behavior within explicit conservation boundaries | Source, schemas, configuration, migrations, and deployment artifacts |

Each layer is a composition point: multiple inputs, tools, candidates, and
evaluation methods can expose different blind spots. Gen Stack keeps that useful
redundancy while assigning one normative owner to each accepted obligation.
Evidence may challenge desired state, but it does not rewrite it automatically.

## An illustrative repository

An adopting repository keeps durable system knowledge under `gen-stack/` while
realization and evidence remain in their native homes:

```text
<repository-root>/
├── gen-stack/                         # durable, human-governed knowledge
│   ├── index.md
│   ├── system.md
│   ├── lifecycle.md                   # system lifecycle
│   ├── ownership.md                   # system stewardship
│   ├── decisions.md                   # architecture decision policy
│   ├── assurance.md                   # confidence and independence policy
│   ├── intent/                        # outcomes, actors, needs, and value
│   ├── architecture/
│   │   ├── capabilities/checkout.md   # an illustrative system subject
│   │   ├── capabilities/checkout/
│   │   │   └── requirements/...       # obligations colocated with the subject
│   │   └── decisions/...
│   └── evaluations/protocols/...      # durable assessment contracts
├── src/...                            # current realization
├── tests/...                          # Suites and executable Cases
└── .github/workflows/...              # repeatable Executions and evidence flow
```

The exact governed layout is defined by the
[Gen Stack application profile](../../knowledge/gen-stack/src/profile/gen-stack-application-profile.md).
The example does not require a particular language, test framework, tracker,
model, or deployment platform.

## How a bounded change moves

```text
Signal
  ↓
$shape ↔ $research / $investigate
  ↓
Ready Pitch → $spec accepts Pitch → Ready Specification
                                      ↓ $design accepts Specification
                              Ready Design
                                      ↓ $plan accepts Design
                                Ready plan
                                      ↓ $implement accepts plan
          implementation ⇄ focused review → $review → authorized $ship
                                                        ↓
                                  observe, evaluate, learn, compact ───↺
```

The route is proportional: discovery is optional and a useful outcome may be no
change. Pitch, Specification, Design, and plan share `Draft`, `Ready`, and
`Accepted`, explicit Open items, and one canonical Change target. The first
coherent Draft and every state change are persisted; ordinary chat iteration is
not. Review recommends; separately held authority permits the final action. The
canonical definition is [Deciding and realizing bounded software
changes](../../knowledge/gen-stack/src/processes/deciding-and-realizing-software-changes.md).

## Artifact usability

Every portable Pitch, Specification, Design, and plan uses the same first-screen
order: exact identity, state, canonical target, bindings, Summary, and Open
items. Stable `OI-<n>`, `A-<n>`, `F-<n>`, and `U-<n>` references make blockers,
actions, findings, and unknowns recoverable across turns. Detail is disclosed
progressively, portable tables stay narrow, and Plan work and checkpoints use
vertical cards. Text labels remain authoritative; emoji and color are optional
host decoration and never carry meaning alone.

## Invocation model

Gen Stack stages are deliberate user controls, not ambient routing. Selecting a
stage starts its workflow but does not waive its inputs, semantic authority,
mutation authority, review evidence, or release authority.

| Selection | Extensions | Purpose |
| --- | --- | --- |
| Implicit or explicit | `gen-stack` | Explain the method, orient work, maintain an adopted corpus and Change coordination, and recommend the smallest eligible stage |
| Explicit only | `$shape`, `$research`, `$investigate`, `$spec`, `$design`, `$plan`, `$implement`, `$review`, `$ship` | Perform one focused change-realization stage after the user deliberately selects it |
| Implicit or explicit | `sync-change` | Perform a user-requested manual checkpoint or repair for one exact artifact |
| Internal only | `researcher`, `reviewer` | Supply fresh-context read-only work to an activated skill |

`$stage` is the documentation's host-neutral shorthand for deliberate
selection; use the host's native skill selector where its syntax differs.
An unprefixed request such as “design this API,” “fix this bug,” or “review this
diff” remains ordinary assistant work and does not acquire Gen Stack stage
semantics. A completed stage may recommend another stage, but recommendations,
handoffs, readiness, and workflow position never activate it. A valid forward
invocation does accept its exact persisted Ready predecessor before dependent
work. Focused stages own automatic lifecycle-event writes; `sync-change`
handles only manual checkpoints and repairs.

## What the pack installs

| Extension layer | Included capability |
| --- | --- |
| Knowledge | `@craigsmitham/knowledge/gen-stack` supplies the canonical vocabulary, operating model, application profile, and guides |
| Skills | `gen-stack` provides method and corpus orientation; nine explicit stages perform focused work; `sync-change` handles manual artifact checkpoints |
| Fresh-context subagents | `researcher` performs isolated read-only research; `reviewer` performs focused or integrated read-only review |

Version `7.0.0` adds the shared first-screen artifact presentation, textual
visual keys, structured Open items, progressive disclosure, vertical cards,
bounded tables, and compact recovery handoffs across the focused stages.

Version `6.0.0` adds the shared update-in-place artifact lifecycle,
event-driven persistence, exact predecessor acceptance, and compaction recovery
boundary. It removes Quick Change and plan-to-task projection from the pack;
use `$spec` followed by `$design`, and treat derived execution records as
host-native coordination outside Sync Change.

Install the pack rather than its coupled members:

```bash
axm install @craigsmitham/packs/gen-stack
```

Start with [How the Gen Stack operates](../../knowledge/gen-stack/src/overview.md).
To establish the corpus in a repository, follow
[Adopting Gen Stack](../../knowledge/gen-stack/src/adopting-gen-stack.md).

## Attribution and license

This synthesis was influenced by Chad Fowler's
[The Generative Stack](https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/)
and John R. Boyd's
[The Essence of Winning and Losing](https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf).
See [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) for provenance.

The pack metadata and README are MIT-licensed. Each member retains the license
declared in its manifest.
