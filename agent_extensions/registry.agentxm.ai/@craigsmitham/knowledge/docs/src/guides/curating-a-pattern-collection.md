---
type: Guide
title: How to curate a pattern collection
description: When readers have several documented patterns to choose from, build and test routes from their design questions to useful entries, then revise the collection from experience of use.
tags: [docs, pattern-collection, pattern-language, curation, indexing, feedback, maintenance]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T02:02:34Z }
sources:
  - id: readers
    resource: https://wirfs-brock.com/rebecca/papers/whowillread/
    title: Wirfs-Brock and Hvatum — Who Will Read My Patterns?
  - id: point
    resource: https://www.enterpriseintegrationpatterns.com/patterns/messaging/PointToPointChannel.html
    title: Enterprise Integration Patterns — Point-to-Point Channel
  - id: publish
    resource: https://www.enterpriseintegrationpatterns.com/patterns/messaging/PublishSubscribeChannel.html
    title: Enterprise Integration Patterns — Publish-Subscribe Channel
  - id: idempotent
    resource: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
    title: Enterprise Integration Patterns — Idempotent Receiver
  - id: value
    resource: https://wirfs-brock.com/rebecca/papers/valueofpatterncollections/
    title: Wirfs-Brock and Hvatum — The Value of Pattern Collections (2026 preprint)
---

# How to curate a pattern collection

Start with the pattern descriptions you intend to maintain and a decision
your readers face. The worked brief here is for a team curating a small
reading list from *Enterprise Integration Patterns*. Engineers can find a
named pattern, but a new colleague designing an order notification wants
to know where to begin.

## 1. Bound the collection by the choices it serves

Ask a practitioner to describe the last choice in their own words.
Record the facts they had before choosing and what happened afterward.
Check that the entries you selected explain recurring designs and that
each has a use within the declared scope. Label a promising but untested
local addition as a candidate. Keep its evidence with the description.

For the example, distinguish “one packing station must take this job”
from “both shipping and billing need to hear about this order.” Both
involve a message and several potential receivers. The important fact
is how many independent parties need to act. That question gives the
collection a useful opening even for someone who knows none of its
names.[^point][^publish]

## 2. Write the route a reader could follow

Put the question at the point of choice and state the consequence of each
answer. Link to the descriptions for the full designs. Here is an excerpt
from the proposed collection.

> **Who should act on this message?**
>
> - Any one packing station can claim the job. Start with
>   [Point-to-Point Channel](https://www.enterpriseintegrationpatterns.com/patterns/messaging/PointToPointChannel.html).
> - Shipping and billing each need to act. Start with
>   [Publish-Subscribe Channel](https://www.enterpriseintegrationpatterns.com/patterns/messaging/PublishSubscribeChannel.html).
>
> **Could a recipient handle the same message twice?** After choosing a
> channel, ask what a repeat would do to that recipient’s work. If it
> could, for instance, bill the customer twice, see [Idempotent Receiver](https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html).

The first two links offer alternatives for a choice about recipients.
The last adds a separate design decision about repeated delivery.
Attach that relationship wherever a practitioner could encounter the
problem. Give readers who remember a name a direct lookup. If the topic
is unfamiliar, introduce the terms through a case the reader recognizes.
For this collection, follow one order from placement to packing.
Keep the full account of each pattern at its own address.[^idempotent][^readers]

## 3. Try an unfamiliar case before calling it a language

Give the route to someone with a fresh task. Suppose three packing
stations are competing for jobs while a dashboard needs a copy of every
order event. Can a reader explain which choice applies to the stations,
which applies to the dashboard, and why? If the page makes them choose
one answer for the entire system, revise the opening to ask about each
message and its intended recipients.

Use a connected case like this to examine any claim that the entries form
a pattern language. Show how applying one pattern changes the next choice
and when the designer might stop or go back. If the benefit is selection
of a single entry, describe the artifact as a collection. A writer can
rehearse both routes alone and record where the wording runs out. Observe
an intended reader when claiming that people can find their way.

## 4. Revise from use and preserve old paths

Ask practitioners which entry they used and what happened when they
applied it. In the order example, did each job reach just one packing
station? Did billing receive the events it needed? Finding a relevant
pattern and getting the intended result answer different questions. Keep
the case and its conditions so future readers can judge how far the
lesson travels. Use that feedback when deciding which entries to revise
or retire.[^value]

When a reader chooses an unsuitable entry, try their actual search wording
and inspect the first misleading cue. Change the cue if discovery failed.
Revisit the description if the design itself failed under conditions it
claimed to cover. If an entry has lost its use or evidence, record why
it was retired and what, if anything, takes its place. Repair live routes
and leave a way for someone following an old name or citation to discover
what happened.

[^readers]: Rebecca Wirfs-Brock and Lise Hvatum, [Who Will Read My Patterns?](https://wirfs-brock.com/rebecca/papers/whowillread/).
[^point]: Gregor Hohpe and Bobby Woolf, [Point-to-Point Channel](https://www.enterpriseintegrationpatterns.com/patterns/messaging/PointToPointChannel.html).
[^publish]: Gregor Hohpe and Bobby Woolf, [Publish-Subscribe Channel](https://www.enterpriseintegrationpatterns.com/patterns/messaging/PublishSubscribeChannel.html).
[^idempotent]: Gregor Hohpe and Bobby Woolf, [Idempotent Receiver](https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html).
[^value]: Rebecca Wirfs-Brock and Lise Hvatum, [The Value of Pattern Collections](https://wirfs-brock.com/rebecca/papers/valueofpatterncollections/), preprint.
