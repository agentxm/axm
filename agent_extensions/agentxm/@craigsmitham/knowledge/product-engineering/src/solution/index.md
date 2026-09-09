# What to build

Which solution concept do we commit to, and how do we state that commitment so
others can dispute it?

Exploring what could be built, choosing the form a solution will take, and
writing that choice down well enough that someone who was not in the room can
argue with it. This section owns the search across candidate forms as much as
the commitment that ends it, and the requirement as that commitment's
disputable statement. The alternatives set aside are part of what it owns: a
commitment is the residue of an exploration, and a concept nobody explored
around is a guess. Framing the problem the commitment answers belongs to
[What to solve](../problem/); constructing and verifying the result belongs to
[How to build it](../engineering/).

## What design means here

[The overview](../overview.md) holds the bundle's definition of design and the
test that a statement becomes design the moment it constrains form. It also
states why a requirement is not a rival to design. This section applies both
rather than restating them, so that there is one account to correct if either
turns out to be wrong.

The record is not the design. A sketch is disposable and a shaped concept is
deliberately unfinished; what survives is the choice, not the artifact that
carried it.

Design recurs at several altitudes, and sections own altitudes rather than the
word. This section owns the solution concept and the interaction a person has
with it. Technical design belongs to [How to build it](../engineering/), and the
arrangement of a running system belongs to [How to run it](../operations/).

Usability is touched by three sections, and each edge is stated where it is
crossed. [What to solve](../problem/) carries usability as a risk to be retired
by evidence, and says the craft of designing for it belongs here. The second
edge runs to [How to build it](../engineering/): What to build chooses the
interaction; How to build it judges, on available evidence, whether the built
result achieves it. Choosing the interaction is choosing a form, which is design
work at the interaction altitude, and a judgment that the built result misses
the interaction is a finding about the build rather than a new interaction
choice.

## Requirements

- [Requirements](requirements/) — The portable craft of discovering,
  analyzing, specifying, reviewing, changing, and maintaining requirements:
  foundations, development, authoring, review, lifecycle, and local
  adaptation.

Where product meaning stops and a normative obligation begins is stated in
[Requirements and neighboring
artifacts](requirements/foundations/requirements-and-neighboring-artifacts.md).
[What to solve](../problem/) sends that boundary here, and that file is where it
is answered: an offering, an audience, a need, a job, and a value proposition
carry no obligation until one is written as a requirement someone can dispute.

## Planned scope

The design areas hold no concepts yet.

| Area | Scope |
| --- | --- |
| Solution concept | Shaping, sketching, breadboarding, elaborate-and-reduce, and the alternatives set aside |
| Resolution and fidelity | Choosing how finished a representation should be, and what premature fidelity forecloses |
| Interaction and experience design | What a person encounters, how they operate it, and accessibility |
| Constraint as design input | Appetite, fixed time with variable scope, and trading scope against a budget |

## Where this section would split

The section runs on two epistemologies. The four areas above are
appetite-bounded exploration: rough, noncommittal, and cheap to discard.
[Requirements](requirements/) holds statements that must survive being
disputed, traced, and continuously verified. They belong together because a
requirement is what a design choice becomes under scrutiny, and the subtree
keeps the difference visible without making it a boundary between sections.
If section size ever forces a split, that is the fault line — not design
against requirements, which would reinstate the handoff the next heading
denies.

## Not a handoff

This section does not hand a finished specification to the next one. Technical
design, construction, and verification routinely reveal that a solution concept
was wrong or too expensive, and the commitment is expected to change in
response. The sections divide by question, not by sequence.

Reciprocity is not symmetry. Getting the right solution concept comes before
getting the concept right: one that answers the wrong problem is not rescued by
being built well, and the cost of changing it rises with every increase in
fidelity. That ordering is why this section precedes How to build it in the
value stream, and why the work here stays cheap and discardable for as long as
it usefully can.
