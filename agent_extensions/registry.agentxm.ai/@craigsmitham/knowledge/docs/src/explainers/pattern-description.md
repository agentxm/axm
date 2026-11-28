---
type: Explainer
title: What a pattern description lets a designer carry to a new case
description: How naming a recurring design makes its essential property recognizable across implementations, and why evidence and judgment still matter.
tags: [docs, pattern, pattern-description, design, recurrence, generativity]
status: draft
sources:
- id: elephants
  resource: https://wirfs-brock.com/rebecca/papers/ElephantsPatternsAndHeuristics/
  title: Elephants, Patterns, and Heuristics
- id: receiver
  resource: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  title: Idempotent Receiver
- id: generative
  resource: https://wirfs-brock.com/rebecca/papers/explrgenpat2023/
  title: Exploring the Generative Nature of Patterns
generated: { by: codex/gpt-6, at: 2026-11-21T22:48:16Z }
---

# What a pattern description lets a designer carry to a new case

What lets a designer recognize a familiar problem in a different system?
A pattern description names the feature to look for. Consider what happens
when a ticket printer receives the same job twice. A second ticket comes out.
A reservations display receives the same message twice telling it that
seat B12 is occupied. The display still shows B12 as occupied. A network
diagram might draw both systems with exactly the same arrow from sender
to receiver. The consequential difference appears when someone asks what
a second delivery will *do*.

Hohpe and Woolf named a design for this problem *Idempotent Receiver*.
Their description identifies a property a designer can seek. Delivering
the same message again should have the same effect as delivering it once.
The authors describe two ways to obtain it. A receiver can recognize
messages it has already handled, or the message can ask for an action
whose effect stays the same upon repetition.[^receiver]

The printer and display are invented examples. One could remember completed
print jobs so that a second delivery of job 314 produces no new ticket.
The display already gets the desired behavior from “mark B12 occupied,”
as long as setting that value is the whole effect. Change the message
to “add one to the number of occupied seats” and duplicates count again.
The pattern name lets a designer ask about either system without assuming
that both should keep the same records.

## What survives the description

Wirfs-Brock and Kohls draw a distinction between a recurring phenomenon
and an author's account of it. Describing a pattern involves selecting
which features of observed designs to keep. The reader supplies local
knowledge to work out a realization in a different setting.[^elephants]
Here the persistent idea is the effect of repeat delivery. The seat
number, display, and printer give the idea a place to work, but none of
them is required by the design.

There is a gap between recognizing that property and producing a design
that achieves it. A record of completed jobs can itself be incomplete.
A reservation update may quietly trigger an email each time it arrives.
Someone has to determine which effects actually matter at the new site.
Hvatum and Wirfs-Brock explore this capacity for a description to help
people generate a fitting response and the part the reader’s experience
plays in doing so. Recognizing a familiar arrangement and successfully
adapting it are different accomplishments.[^generative]

For help deciding when experience deserves this form, see the
[Pattern description pattern](../patterns/pattern-description.md). For
the work of mining and writing one, see
[How to write a pattern description](../guides/writing-a-pattern-description.md).

[^elephants]: Rebecca Wirfs-Brock and Christian Kohls, [Elephants, Patterns, and Heuristics](https://wirfs-brock.com/rebecca/papers/ElephantsPatternsAndHeuristics/).
[^receiver]: Gregor Hohpe and Bobby Woolf, [Idempotent Receiver](https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html).
[^generative]: Lise Hvatum and Rebecca Wirfs-Brock, [Exploring the Generative Nature of Patterns](https://wirfs-brock.com/rebecca/papers/explrgenpat2023/).
