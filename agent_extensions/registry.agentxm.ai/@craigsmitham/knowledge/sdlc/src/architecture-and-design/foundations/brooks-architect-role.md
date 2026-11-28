---
type: Explanation
title: "Fred Brooks on the architect's role: conceptual integrity and responsibility to the user"
description: How Fred Brooks connects conceptual integrity, the user's mental model, design authority, and implementation feedback, with an interpretation for collaborative product engineering and explicit model boundaries.
tags: [fred-brooks, architecture, conceptual-integrity, design-authority, user-model, collaboration, architecture-and-design]
status: draft
sources:
  - id: mythical-man-month
    resource: https://www.informit.com/store/mythical-man-month-essays-on-software-engineering-anniversary-9780201835953
    title: "Frederick P. Brooks Jr. — The Mythical Man-Month, Anniversary Edition, chapters 4–6 and 19"
  - id: design-interview
    resource: https://www.informit.com/articles/article.aspx?p=1600886
    title: Interview with Fred Brooks on the Publication of The Design of Design
  - id: ddd
    resource: domain-driven-design.md
    title: Domain-driven design
  - id: lifecycle
    resource: https://github.com/craigsmitham/agent-extensions/blob/c56a54cb5cdb2c14c0d71801709c2b38968c99dd/knowledge/product-engineering/src/overview.md
    title: Product engineering overview
generated: { by: codex/gpt-6, at: 2026-11-22T01:50:02Z }
---

# Fred Brooks on the architect's role: conceptual integrity and responsibility to the user

How does a product remain understandable as a whole when many people design
and build it? Fred Brooks makes that coordination problem central to the
architect's role. His concern is the mental model a user needs to accomplish
work through the product: its concepts, available actions, and rules for
combining them.[^mythical-man-month]

This explanation is for product practitioners, designers, and engineers who
want to understand that responsibility and its relationship to collaborative
work. It develops Brooks's argument before offering an interpretation for this
bundle. The equipment-rental example is invented; it illustrates the reasoning
and supplies no evidence about the effectiveness of a team structure.

## Conceptual integrity and the whole product

**Conceptual integrity** means that the parts express a coherent set of design
ideas. Brooks connects it to the balance between useful capability and the
conceptual effort required to use that capability. His argument gives designers
a reason to question an attractive feature whose concepts fit poorly with the
rest of the system.[^mythical-man-month]

Suppose a rental website calls tomorrow's equipment “reserved.” The email
says the request was received. At the depot, staff can promise delivery only
after they assign a machine. Should the contractor send a crew to the site?
Giving all three messages the same label would conceal the disagreement. A coherent design must decide
what commitment exists, when it begins, what may change, and what the customer
can do if the service cannot fulfill it. Those decisions connect booking,
allocation, substitution, cancellation, and communication.

A richer product may legitimately introduce more concepts. A tentative request
and a confirmed reservation could both be useful if their relationship is
clear. The design question is whether the distinction helps the customer reason
about the job. Reducing the number of terms while hiding a consequential
difference would make the product harder to understand.

## The architect represents the user

Brooks calls the architect “the user's agent.” His architecture describes the
product as users can perceive and invoke it; implementation supplies the
mechanisms. A programming language or machine interface therefore belongs to
his account just as an interactive product's controls can.[^mythical-man-month]

For the rental service, the architectural question is what accepting a
reservation promises. Whether a particular implementation uses a queue or a
database transaction is a different design question. A technical choice becomes
relevant to the public promise when, for example, its failure behavior prevents
the service from confirming that promise reliably.

Representing the user also raises a practical question: which users and whose
work? The customer wants dependable delivery; a depot operator needs to handle
equipment failures; support needs to explain the resulting choices. In this
example, stewardship of the product requires making those perspectives explicit
and examining their conflicts. An architect's confidence cannot stand in for
learning how those people actually work.

## Design authority and collaborative contribution

Brooks argues for one architect or a small, closely aligned group controlling
the design concepts. His 1995 retrospective retains a named architect and,
for large systems, a hierarchy of subsystem architects. He also recognizes
that architectural ideas can originate with users and implementers.
[^mythical-man-month]

The distinction is between contributing an idea and resolving its implications
for the whole. Suppose the booking team wants immediate confirmation while
the depot team wants to accept every request before checking availability.
Both proposals can have reasonable local motivations. Combining them without
settling what confirmation means produces an unreliable promise.

Someone must bring the conflict to a decision, explain the resulting contract,
and ensure that affected parts agree. Brooks gives that responsibility explicit
authority. His position is stronger than a general preference for collaboration:
he proposes an organizational answer to the problem of incompatible local
decisions.

Authority has limits as a way of securing good design. A decision can be
consistent and still rest on a mistaken understanding of customer needs.
Concentrating every minor choice in one person can also delay work and separate
judgment from the people who understand its consequences. The scope of the
decision and the evidence available to its owner matter alongside the clarity
of ownership.

## Implementation keeps architectural judgment grounded

Brooks describes early, continuing communication between architect and builder.
The architect must be able to suggest a feasible implementation, accept other
implementations that meet the objectives, and reconsider features whose costs
turn out to be disproportionate. Implementation remains creative design work.
[^mythical-man-month]

In the rental example, guaranteeing a particular machine immediately might
require coordination that the current depot systems cannot support within the
available budget. That discovery opens several alternatives: reserve a class
of equipment, confirm after a short availability check, or narrow the service
to depots that can honor an immediate commitment.

Each alternative changes something different. Reserving a class changes what
is promised. Delayed confirmation changes when the promise begins. Restricting
coverage changes who can use the service. An implementation estimate does not
choose among those meanings by itself; it supplies evidence that the people
responsible for the product must interpret together.

The distinction between architecture and implementation is useful here because
it reveals what would change for the user. Feedback crosses that distinction
throughout the work. It already belongs to Brooks's account and should not be
presented as a modern correction added by this bundle.

## Making the intended design available to others

In “Passing the Word,” Brooks develops written specifications, discussion, and
explicit decisions as ways to communicate architecture. He also insists that
when formal and prose definitions coexist, their authority relationship must
be clear.[^mythical-man-month]

For the rental service, a diagram of booking and allocation components cannot
settle whether a reservation survives the loss of an assigned machine. A
behavioral statement, an example, and its rationale make that question
discussable:

> A confirmed reservation promises equipment of the agreed class. Losing the
> assigned machine triggers substitution or an explicit failure to fulfill the
> reservation; it does not silently turn confirmation back into a request.

Examples can then become witnesses to the accepted rule through
[Executable specifications](../../software-testing/patterns/executable-specifications.md).
A passing example establishes only what it observes. The wider design still
needs examination for gaps and contradictions, and the relationship between
the examples and the authoritative statement must survive change.

## Coherence during learning and change

Brooks explicitly supports iterative requirements discovery, early prototypes,
and frequent feedback from real use in his 2010 interview. He retains a chief
designer with design authority and a separate management role. Iteration and
architectural responsibility coexist in that account.[^design-interview]

Suppose research later shows that some customers need a particular machine's
capabilities or certification. A promise about a broad equipment class no
longer covers their job. The team could introduce an explicitly different
reservation type, change how classes are defined, or decide that those needs
fall outside this offering. Coherence helps expose the choice; it cannot settle
whether the opportunity deserves investment.

## An interpretation for collaborative product engineering

The interpretation proposed here retains **explicit responsibility for the
coherence of the product** while leaving the organizational arrangement open.
It brings Brooks's argument into a setting where teams revise the design
through use and may own different models of the same equipment.
[^lifecycle][^ddd]

Three distinctions make that interpretation concrete:

- **Responsibility and job title.** A team needs to know who resolves a
  disagreement about shared product behavior and who follows its consequences
  across affected areas. A named architect, a lead working with peers, or an
  explicit team decision arrangement could carry that responsibility. These
  are candidate arrangements, not evidence that each works equally well.
- **Product coherence and model scope.** DDD allows allocation and maintenance
  to model the same equipment differently within explicit bounded contexts.
  Their internal meanings need not become one universal model. Their
  interaction must preserve the commitments on which users and other parts of
  the product rely. This is a synthesis with DDD, rather than terminology
  borrowed from Brooks.[^ddd]
- **Decision authority and grounds for revision.** Authority makes a decision
  actionable; research, implementation experience, and operational evidence
  keep it open to correction. A useful explanation of a decision includes the
  assumptions and consequences that would justify revisiting it.

Applied to the rental example, this means someone owns the resolution of what
confirmation promises across booking and depot work. The depot can retain its
own allocation model. A proposed optimization must expose any effect on that
promise, and new evidence can lead the collaborators to revise the promise
deliberately.

This interpretation does not prescribe a permanent architecture board, a
particular reporting hierarchy, or a universal consensus rule. Those choices
need their own account of team size, coupling, expertise, and decision cost.
The useful question carried forward from Brooks is who takes responsibility
when individually reasonable contributions fail to make an understandable whole.

## Continue exploring

- [Domain-driven design](domain-driven-design.md) develops shared language,
  bounded contexts, and relationships among models; use it to examine the scope
  within which meanings should agree.

[^ddd]: [Domain-driven design](domain-driven-design.md), especially model and context boundaries.

[^design-interview]: [Interview with Fred Brooks on the Publication of The Design of Design](https://www.informit.com/articles/article.aspx?p=1600886), June 8, 2010.

[^lifecycle]: [Product engineering overview](https://github.com/craigsmitham/agent-extensions/blob/c56a54cb5cdb2c14c0d71801709c2b38968c99dd/knowledge/product-engineering/src/overview.md), the original setting for this interpretation.

[^mythical-man-month]: [Brooks, The Mythical Man-Month, Anniversary Edition](https://www.informit.com/store/mythical-man-month-essays-on-software-engineering-anniversary-9780201835953), chapters 4–6, pp. 41–70; chapter 19, “The Central Argument: Conceptual Integrity and the Architect,” pp. 255–257.
