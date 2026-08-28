# Architecture review

Assess realization separately for every changed or materially impacted
accepted Architecture authority. Bind the exact authority and revision. A C4
View may help navigation but is not itself a realization authority.

Apply the common lens to the meaning each authority actually owns:

- responsibilities and ownership;
- boundaries, containment, and allowed crossings;
- interfaces, contracts, and compatibility;
- relationships and dependency direction;
- state and data ownership, lifecycle, and consistency;
- interactions, ordering, concurrency, and idempotency;
- failure detection, containment, recovery, and observability;
- security, privacy, accessibility, performance, and other quality behavior;
- accepted decisions, constraints, and consequences; and
- implementation locations, explained divergence, and unexplained divergence.

Add only the relevant type lens:

- **System or C4 element:** responsibility, containment, runtime or deployment
  boundary, dependencies, and exposed interfaces;
- **Bounded Context or Context Map:** model ownership, language, upstream and
  downstream relationship, integration pattern, and translation boundary;
- **ADR:** the accepted decision, constrained alternatives, consequences, and
  conditions under which it applies;
- **Capability or Feature:** owned outcome, cooperating subjects, constraints,
  and durable decomposition;
- **Surface:** actors, encounter points, interaction hierarchy, states,
  failures, and accessibility.

Check applicable Architecture-realization Protocol coverage and evidence
without treating a Requirement-satisfaction Result as interchangeable. Route a
durable boundary, responsibility, relationship, or decision change to `spec`
or the applicable Architecture authority. Route an unexplained implementation
departure from accepted Design to `design` or `implement` according to its
owner.
