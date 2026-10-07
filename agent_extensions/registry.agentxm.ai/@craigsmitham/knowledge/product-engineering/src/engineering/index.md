# How to build it

How do we construct and verify what we committed to?

The craft of turning an accepted commitment into working, inspectable software.
This section owns technical design, construction, and the evidence that the
result behaves as intended. Choosing the solution concept belongs to
[What to build](../solution/); moving the result toward production belongs to
[How to ship it](../delivery/).

What arrives here is a commitment, not a specification. Technical design
regularly shows that a solution concept is wrong or too expensive, and saying so
is part of the work rather than a failure of the previous section.

For broader context, follow
[Behavior and commitment](../reading-product-engineering.md#behavior-and-commitment).
Connect the behavior under construction to actor goals, accepted obligations,
and domain meaning.

## What this section holds today

Three areas below have general guidance; two worked cases also connect technical
design to requirements, migration, and the engineering system. The concepts
cover judging a
codebase against product-quality outcomes on available evidence, choosing and
building the tests that prove a claim, giving behavior an authoritative
statement, and shaping the repository surface those tasks run through.

| Area | Status |
| --- | --- |
| Architecture and technical design | Worked Northbank cases; general design guidance remains unwritten |
| Construction | Not yet written |
| Verification | Populated: test levels, test worlds, and specification authority |
| Review and assessment | Populated: ten quality pillars, eight cross-cutting records, and test-suite quality |
| Execution surface | Populated: task interfaces, contracts, and conformance |

Architecture and technical design would own boundaries, seams, scale, and
evolvability as design choices rather than as review judgments. Construction
would own portable construction craft, with technology bindings kept in their
own bundles. General guidance for those areas remains unwritten. The Northbank
cases explain
selected design choices without filling that gap. The quality pillars judge an
existing structure; they do not tell you how to choose one.

For conceptual grounding in domain modeling, read
[Domain-driven design](../foundations/domain-driven-design.md) in Foundations.
It explains subdomains, bounded contexts, aggregates, and their relationships;
general architecture and construction guidance remains unwritten.

For responsibility for the product as users understand it, read
[Fred Brooks on the architect's role: conceptual integrity and responsibility to the user](../foundations/brooks-architect-role.md). It connects design authority to
implementation feedback and explains how his use of architecture crosses the
solution and engineering questions. Detailed architecture guidance remains unwritten.

For the relationship between component evolution, sourcing, and appropriate
methods, read [Wardley mapping](../foundations/wardley-mapping/wardley-mapping.md). Its landscape
perspective helps distinguish uncertain exploration from standardized provision.

## Follow a worked change

- [Northbank allocation: from service promise to code change](northbank-allocation-change.md) — A fictional replacement operation connects strategic purpose, domain boundaries, concrete code responsibilities, concurrency, verification, and migration of existing commitments.
- [Northbank engineering: tooling, delivery, and infrastructure](northbank-engineering-system.md) — A fictional engineering-system change connects package boundaries, task contracts, CI/CD, runtime dependencies, artifact identity, migration, and retirement to the product obligations they support.

## Review and assess a codebase

- [Codebase review](codebase-review/) - An outcome-centered review framework with ten product-quality pillars, eight typed cross-cutting records, a separate supporting-artifact assessment for test suites, and explicit uncertainty rules.

## Choose a test level

Levels are chosen on one axis and authority on another. These three guides
decide where a claim is proved; the specification guides below decide which
behaviors earn an authoritative, human-readable statement of intent.

- [Choosing the narrowest effective test](choosing-the-narrowest-effective-test.md) - Use when a change needs executable evidence and no material risk yet requires a real cross-boundary or browser world; admit the test deliberately, choose the narrowest level that observes the claim, substitute collaborators through explicit seams, and keep repository conventions out of tests.
- [Designing cross-boundary and end-to-end tests](designing-cross-boundary-and-end-to-end-tests.md) - Use when a material risk spans components, processes, services, storage, artifacts, or deployment configuration; separate claim scope from boundary reality and execution distance, then select the smallest representative test world and observation surface that still discriminates the claim.
- [Choosing browser-dependent interface tests](choosing-browser-dependent-interface-tests.md) — Use when an interface claim may depend on real browser rendering, interaction, accessibility, or platform behavior; state the observable claim, name the browser capability that alone reveals it, and admit the narrowest scope — from DOM-emulated component to deployed journey — that keeps the risk visible.

## Build and operate the admitted tests

Each guide above admits a test and fixes its scope. These two take over once
that decision is made and the suite has to be written, owned, and run.

- [Operating cross-boundary test suites](operating-cross-boundary-test-suites.md) - Use once a cross-boundary test world is chosen and the suite has to live somewhere; place the harness with one accountable owner, design seed state, readiness, and cleanup, bind execution to the decision point it can honestly serve, and keep failures attributable.
- [Writing browser test evidence](writing-browser-test-evidence.md) - Use once a browser test is admitted and the question is how to write it; choose locators and readiness conditions that survive churn, isolate browser and application state, size the environment matrix to real risk, and keep visual and accessibility conclusions inside what their methods support.

## Give behavior an authoritative statement

- [Designing executable specifications](designing-executable-specifications.md) - Use when intended behavior needs an authoritative, human-readable, continuously verified statement that non-authors can dispute; choose which rules earn a specification, keep incidental mechanics out of the specification text, and bind automation below the readable layer.
- [Keeping specifications authoritative](keeping-specifications-authoritative.md) - Use once an executable specification is accepted and must stay trustworthy; separate acceptance from verification, record evidence for obligations that cannot run on every change, triage a failure before editing either side, retire dead rules, and gate generated change on reviewed intent.

## Shape the repository execution surface

Read the entry guide first for the vocabulary and boundaries; the two principle
concepts and the adoption guide assume it.

- [Designing a coherent repository task interface](repository-task-interface.md) - Use when repository tasks, scripts, launchers, wrappers, or CI paths compete, or when placing new repeatable work; name the competing-semantics problem, the outcomes one task interface must deliver, and the portable vocabulary that the contract, invocation, and adoption guides build on.
- [Resolved task contract principles](resolved-task-contract-principles.md) — Use when deciding what a single repository task means — who owns it, what it guarantees from a clean shell, which dependencies it declares, and when a cache replay still answers the caller's question; the five principles that define a canonical resolved contract.
- [Task invocation and conformance principles](task-invocation-and-conformance-principles.md) - Use when wrappers, aliases, hooks, agents, or CI steps have accumulated around a repository's tasks; the five principles that bound each entrypoint's role, keep one membership authority per workflow, hold actors to canonical semantics, and check resolved rather than declared behavior.
- [Adopting a repository task interface](adopting-a-repository-task-interface.md) - Use when converting the task-interface principles into an actual repository change; a twelve-step design or repair sequence, the local binding that records runner-specific decisions, the signals that show whether the interface helped, and a worked example of collapsing four validation inventories into one.

## What this section does not cover

The concepts here are technology-agnostic. Language, framework, and vendor
specifics live in their own bundles and are referenced rather than restated.
The craft of understanding and intervening in existing systems belongs to
[How to maintain it](../maintenance/); this section supplies technical design,
construction, and verification for those interventions.

| Adjacent concern | Owner |
| --- | --- |
| Requirements: specifying, reviewing, and changing an obligation | [What to build](../solution/requirements/) |
| Existing-system understanding, impact analysis, and maintenance intervention choices | [How to maintain it](../maintenance/) |
| Work items: the record that carries a change or a defect | [How to ship it](../delivery/work-items/) |
| Reliability, security, and efficiency of a system already running | [How to run it](../operations/) |
| Documentation craft | The `docs` bundle, outside this one |

The reliability, security, and efficiency row is easy to misread, because three
review pillars carry those same names: Reliability, Security, and Efficiency. The pillars judge a product at a
stated revision on available evidence. Sustaining the same properties in a live
system is a different question with a different owner, and [Software quality
pillars](codebase-review/software-quality-pillars.md) states the split in full.
Efficiency is where the cost question sits on this side: `SQ-06` asks whether
required behavior meets a declared time, capacity, resource, and cost envelope,
while How to run it owns what a running system actually costs to keep.

Two further boundaries are worth stating plainly, because both look like they
could belong here and only half of each does.

Usability is divided by question rather than by subject. [What to
build](../solution/) chooses the interaction; How to build it judges, on
available evidence, whether the built result achieves it. [`SQ-07`
Usability](codebase-review/software-quality-pillars.md) is that judgment, not a
design method.

The execution surface is divided from delivery automation the same way. The
execution surface owns what a task means and who may invoke it; [How to ship
it](../delivery/) owns when a workflow runs it and what happens to the result.
A task interface that is honest about its contract is what makes a pipeline
able to call it, which is why the two must not restate each other.
