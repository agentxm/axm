# How to run it

How does the product stay healthy, secure, and affordable in production?

Sustaining a running system, responding when it misbehaves, and turning what an
incident taught into a change someone actually makes. This section owns
production reality. Understanding an existing system and choosing a path for
its evolution belongs to [How to maintain it](../maintenance/). That section
covers replacement and consumer migration reasoning; this one retains live
decommissioning and recovery arrangements. Getting a change to production
belongs to [How to ship it](../delivery/); whether the change produced the outcome anyone
wanted belongs to [What to solve](../problem/).

How a running system is arranged so it can be observed, degraded, and recovered
is a design altitude of its own. Failure modes, blast radius, and recovery paths
are chosen forms, not emergent properties, and this section owns those choices.
The [overview](../overview.md) holds the bundle's definition of design and the
table of altitudes; this section applies both rather than restating them.

## Planned scope

This section holds no concepts yet. The table states what it would own, so that
a concept arriving from elsewhere can be placed, and so that the neighboring
sections can point here honestly.

| Area | Scope |
| --- | --- |
| Observability | Telemetry, logs, traces, and service-level objectives |
| Reliability | Capacity, resilience, graceful degradation, and recovery |
| Incident practice | Detection, response, command, and post-incident review |
| Operational security | Access, secrets, patching, and audit for a running system |
| Cost and sustainment | Ownership, on-call load, and retiring systems that still run |

## Sustaining a system, not judging a codebase

Three areas above answer to codebase-review pillars carrying the same subject:
`SQ-03` Reliability, `SQ-04` Security, and `SQ-06` Efficiency. Only Reliability
shares the name exactly. Operational security here is what `SQ-04` judges once
the system is running, and Cost and sustainment is the part of Efficiency that
continues after release: `SQ-06` asks whether required behavior meets a declared
time, capacity, resource, and cost envelope, while this section owns what a
running system actually costs to keep.

The claims are not the same claim. [Codebase
review](../engineering/codebase-review/software-quality-pillars.md) judges a
product at a stated revision on the evidence a repository and its surroundings
can supply, and its output is a bounded verdict with its uncertainty attached.
This section owns the same properties in a system that is already running, where
the evidence is live and the response is operational rather than editorial.

Neither result substitutes for the other. A passing review does not establish
that the running system is reliable, secure, or affordable, and an incident does
not by itself invalidate the review that preceded it. When production evidence
contradicts a review verdict, both are data, and the review's claim context is
where the disagreement is usually explained.

## Incident practice and the incident record

Incident practice splits across two sections, and the split is deliberate. Three
owners are involved, and each owns something different.

| Concern | Owner |
| --- | --- |
| What the durable record must show about impact, severity, control, objectives, chronology, closure, and follow-up | [Operational Incident Records](../delivery/work-items/incidents/), in How to ship it |
| The portable craft of detection, severity reasoning, escalation, command and communication, closure, and post-incident review | This section |
| The local values that craft takes: the threshold that opens a record, the severity scale, the named response roles, the escalation paths, and who may close | The consuming organization's incident policy |

This section owns the response regime, and it owns the whole of it: when impact
crosses a threshold worth coordinating, how severity is reasoned about from
current evidence, who holds command and how command transfers, how escalation
and communication are run, what ends a response, and what a post-incident review
does with the result. How to ship it owns none of that. It owns what the record
must show so that the response stays recoverable afterwards, which is why its
guidance says what a record captures about severity and control and never how a
responder should set either.

None of the response regime is written yet. The claim is a scope claim, stated
so that the record contract in How to ship it can point here honestly, and so
that response craft arriving from elsewhere lands here rather than settling in
the record subtree.

Post-incident review sits here rather than in a section of its own. An earlier
shape of this bundle had a seventh question about learning; the
[overview](../overview.md) records why it was retired and where each of its
clauses went. Learning from production landed here, because the evidence, the
timeline, and the people are already here.
