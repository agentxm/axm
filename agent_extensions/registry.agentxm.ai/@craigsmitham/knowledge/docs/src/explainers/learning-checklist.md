---
type: Explainer
title: How a learning checklist changes practice
description: How prompts make a learner’s reasoning open to feedback, and why a later task without prompts reveals something that assisted practice cannot.
tags: [docs, learning-checklist, practice, scaffolding, retrieval, feedback, transfer]
status: draft
sources:
- id: butler
  resource: https://pubmed.ncbi.nlm.nih.gov/20804289/
  title: Repeated testing produces superior transfer of learning relative to repeated studying
- id: fading
  resource: https://doi.org/10.1080/00220970209599510
  title: From Example Study to Problem Solving
generated: { by: codex/gpt-6, at: 2026-11-22T01:49:36Z }
---

# How a learning checklist changes practice

A learning checklist can help a beginner explain a choice and give a
teacher something specific to respond to. Consider a new museum guide
learning to choose objects for a short tour. They
can follow a colleague’s itinerary from room to room. Asked to plan a
tour for a visiting choir, they pick three instruments but have trouble
saying what the group could notice by seeing them together.

Imagine the guide preparing for the tour in the museum’s shared planning
notes. Two prompts sit above the proposed stops. *What would you like the
group to notice? Which detail on each object will help them see it?* The guide
might choose three objects that make sound in different ways and point
to a string, a membrane, and a column of air. A colleague can now give
feedback on an actual connection the guide made. A list of object names
would have shown only the result of that reasoning.

## What the prompts contribute

Answering before consulting a model asks the learner to retrieve and use
what they know. Butler studied a related mechanism in experiments with
prose passages. People who took repeated tests later did better on questions
about the material, including new inferential questions, than those who
repeatedly studied it. The final test took place a week later. This was
evidence about retrieval under those conditions. The museum exercise
illustrates a possible use of the idea.[^butler]

The prompts also supply a cue the guide may eventually have to generate.
If every successful tour plan begins with those two questions, the
supervisor still has to find out whether the guide can frame them unaided.
Renkl and colleagues studied a transition from worked examples to problems
with progressively more of the solution left to the learner. Their
experiments found benefits on near-transfer problems, new problems
similar to those used in practice. Whether those findings carry over to
planning a museum tour would need its own trial.[^fading]

Later, a group interested in the history of local industry requests a
tour. Can the guide select a thread connecting the objects and identify
what visitors can see for themselves, without the practice prompts? That new
occasion gives the supervisor evidence about independent use. It also
shows why the intention behind a checklist matters. A permanent reminder
to count every visitor at the exit serves a different purpose. It can
keep helping an experienced guide long after the practice prompts come away.

For help choosing the form, see the [Learning checklist pattern](../patterns/learning-checklist.md).
To develop practice, feedback, and an independent check, see
[How to design a learning checklist](../guides/designing-a-learning-checklist.md).

[^butler]: Andrew Butler, [Repeated testing produces superior transfer of learning relative to repeated studying](https://pubmed.ncbi.nlm.nih.gov/20804289/).
[^fading]: Renkl and colleagues, [From Example Study to Problem Solving](https://doi.org/10.1080/00220970209599510).
