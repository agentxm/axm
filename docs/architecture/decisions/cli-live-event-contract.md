---
type: Decision
status: stable
description: Long-running AXM operations publish one schema-backed lifecycle event stream that the live frame, the machine event writer, and telemetry consume independently.
depends-on:
  - ./cli-output-view-model-and-terminal-ownership.md
  - ../commands/output.md
  - ../commands/terminal-design.md
  - ../system-wide/testing-strategy.md
---

# CLI live-event contract

## Context and forces

The output decision established the settled half of human presentation: a
typed `Doc` tree painted by one terminal owner. Live presentation had no
equivalent contract. Three mechanisms coexisted. Plan execution published
typed lifecycle events to an invocation-scoped broadcast marked experimental,
and the only subscriber flattened each event into one spinner label. The
extension-lifecycle feature exposed a bracket-style presentation port that
wrapped source resolution so the CLI could show a spinner around it, with no
detail crossing the boundary. Every other long operation wrapped a whole core
call in one static-label task.

The consequences were visible. The frame could not show which unit was
downloading, how far along it was, or that the operation was waiting on
another process. Machine progress events on stderr were derived from spinner
labels, so an agent consuming them received less than core had produced.
Waiting and restoration had no first-class presentation. Every new long
operation had to choose one of three mechanisms, and each choice coupled a
feature to presentation timing.

The live contract must keep core independent of the terminal, let a machine
consumer observe everything a human observes, keep the frame cheap regardless
of event volume, guarantee that settled output never overtakes live output,
and leave the painter replaceable.

## Accepted choice

Every long-running operation publishes typed lifecycle events to one
invocation-scoped broadcast, and every consumer of live progress is an
independent subscriber to that broadcast.

The event union is schema-backed and carries identifiers, labels, counts, and
states, never formatted strings. Its members are `OperationStarted`,
`PhaseStarted`, `UnitStarted`, `UnitProgress`, `UnitResolved`, `Waiting`,
`WaitEnded`, and `OperationSettled`. Every event carries a per-operation
monotonic sequence number and a wall-clock timestamp. `OperationSettled` is
terminal and occurs exactly once per operation. The phase vocabulary gains
`resolution`, the phase in which requested sources are resolved into concrete
packages before lockfile reconciliation begins. A non-plan operation settles
with the outcome `completed` when it finishes successfully; plan-family
operations settle with the outcome their resolution derives.

The lifecycle service owns the broadcast, assigns sequence numbers, exposes a
drain latch, and lets a subscriber register as lossless. Publishing is a no-op
when no service is in context, so library code publishes unconditionally.
Producers cover plan execution, source resolution, downloads, per-agent
materialization, sync preflight, and upgrade steps. The bracket port and the
static task wrappers are retired.

The broadcast is unbounded. Three obligations make that safe:

1. Lifecycle events are discrete state transitions, so their count is
   proportional to the planned units. Continuous measurements such as download
   bytes are throttled at the producer and never published per chunk.
2. The human frame never consumes raw events. One projector subscriber folds
   the stream into latest-wins progress state, and the frame reads that state
   on each repaint.
3. Every operation ends with the terminal event, and settled output waits on
   the drain latch that every lossless subscriber completes after observing
   it.

Three subscribers exist. The frame projector and the machine event writer
register as lossless. Telemetry buffers locally with a sliding window and does
not register as lossless, so a slow telemetry sink can never stall an
operation.

The live-to-settled handoff is defined. At `OperationSettled` the frame
collapses its task tree into a transcript document and clears the live region.
The settled `Doc` prints only after the drain latch opens. A machine consumer
therefore receives every progress event before the result document and the
exit code.

Core never depends on the terminal owner. Events carry identifiers, labels,
counts, and states; the phrase layer beside the painter owns every human
wording. Machine progress on stderr is the encoded lifecycle event inside the
existing progress envelope.

Accepting authority: maintainer approval in session. The executable
specifications `cli/machine-progress-events-follow-the-lifecycle-schema`,
`cli/long-running-operations-emit-lifecycle-events`, and
`cli/non-tty-output-is-plain-and-unpadded` own the enforceable obligations;
this record owns the choice and its rationale.

## Rationale

One typed stream gives every consumer the same facts at the same resolution.
The frame can show a task tree with numeric progress, the machine writer can
forward exactly what core produced, and telemetry can count without any of
them reaching into feature code. A schema-backed union makes the machine
channel a published contract instead of an accident of spinner wording.

Bounded backpressure was rejected because a bounded broadcast retains each
message until every current subscriber has taken it. One slow subscriber
would suspend the publisher for all, so a lagging telemetry sink in human mode
would stall the operation unless every such subscriber remembered to add its
own buffer. The three obligations above deliver the same safety without a
global capacity bound: volume is bounded by construction, the only latency-
sensitive consumer reads latest state, and completion is explicit.

A bracket port was rejected because it only marks where feedback belongs and
cannot carry detail. Per-call progress callbacks were rejected because each
call site would define its own shape and the machine channel would again be
assembled from presentation calls. Operation-level Effect streams were
rejected because they make every operation's return type carry presentation
concerns and give the settled result and the live stream overlapping
authority.

## Material alternatives

- **Keep the three mechanisms and improve the spinner.** Machine progress
  would remain derived from labels and every new operation would still choose
  a mechanism. Rejected.
- **Bounded broadcast with backpressure.** Global suspension by one slow
  subscriber, as described above. Rejected.
- **Bracket-style presentation ports per feature.** No detail crosses the
  boundary and the frame cannot compose a tree. Rejected.
- **Progress callbacks passed into each operation.** Shape drift per call
  site and no single machine contract. Rejected.
- **Operations return an Effect stream of events.** Presentation enters every
  operation's type and duplicates the settled result's authority. Rejected.
- **Adopt a terminal framework as the live contract.** The framework's
  component tree would become the feature contract before the event model is
  established, foreclosing the renderer choice this record keeps open.
  Rejected.

## Consequences

Positive:

- the frame shows a task tree, child units, numeric progress, waiting, and
  restoration from the same facts core records;
- a machine consumer observes every lifecycle event in order and before the
  result document;
- new long operations publish events and inherit presentation without
  touching the terminal owner;
- the projector fold is pure, so a recorded event log verifies the frame
  deterministically; and
- the painter and frame remain replaceable behind two typed contracts, the
  `Doc` tree and the event stream.

Negative:

- the machine progress event shape changed: the `phase`, `percent`, and
  `message` fields are gone and the encoded lifecycle event replaced them,
  which is a pre-launch contract break called out in its specification
  impact;
- every producer must publish a terminal event on every exit path, including
  failure and interruption, or settled output waits on the drain;
- continuous measurements need producer-side throttling, which each download
  or copy loop must own; and
- telemetry may drop events under pressure by design, so it counts trends and
  never reconstructs an operation.

## Required evidence

The decision holds only while these tests pass:

- a lagging lossless subscriber never stalls the publisher, loses no event,
  and delays the result document until it has drained;
- the event count of the largest end-to-end plan is proportional to its
  planned units, with continuous measurements throttled;
- the projector fold over a recorded event log is deterministic and yields the
  same progress state at every terminal width;
- an interruption mid-apply delivers `OperationSettled` to every subscriber and
  closes the operation scope with no leaked fibers; and
- every event round-trips through the published schema.

## Optionality proof

The renderer conformance suite pairs recorded event logs with golden `Doc`
fixtures and asserts, for any painter, the width property at 40, 80, 120, and
200 columns, color and glyph fallbacks, frame and transcript interleaving,
projector determinism, and interruption restore. A bounded alternative painter
with a different visual language runs through the same suite behind the same
seam.

Spike result: the alternative painter passed the same suite as the
production painter without any change to feature views, the `Doc`
vocabulary, the event stream, the projector, or the frame. The only defects
the suite caught were the alternative's own line-ending and nesting
mistakes, which the width, color, and glyph checks localized to painter code
in minutes. A renderer swap is therefore bounded to the painter behind the
`Doc` seam, and the suite is the acceptance gate for any future one.

## Supersession and reconsideration

Reconsider the unbounded broadcast if a producer cannot keep its event count
proportional to planned units or cannot throttle a continuous measurement at
its source. Reconsider the single stream if the CLI gains concurrent
independent operations within one invocation that the operation identifier
cannot distinguish. Reconsider the drain-before-settled rule only if a
consumer needs the result document before progress has finished, which today
no consumer does. Any superseding decision must keep the machine event a
published schema and must keep core independent of the terminal owner.
