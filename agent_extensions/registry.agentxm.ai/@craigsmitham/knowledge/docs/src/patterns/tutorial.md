---
type: Pattern
title: Tutorial
description: When readers need to acquire a skill, lead them through a safe, bounded lesson with meaningful actions and recognizable results that build confidence for further practice.
tags:
- docs
- tutorial
- learning
- diataxis
- explanation
- documentation-pattern
- pattern
- authoring
status: draft
sources:
- id: diataxis-tutorials
  resource: https://diataxis.fr/tutorials/
  title: Diátaxis — Tutorials
- id: diataxis-tutorials-how-to
  resource: https://diataxis.fr/tutorials-how-to/
  title: Diátaxis — The difference between a tutorial and how-to guide
- id: beats
  resource: https://learningmusic.ableton.com/make-beats/make-beats.html
  title: Ableton — Make beats
- id: python-tutorial
  resource: https://docs.python.org/3/tutorial/
  title: Python — The Python Tutorial
generated: { by: codex/gpt-6, at: 2026-11-22T02:10:28Z }
---

# Tutorial

A tutorial fits a reader who wants practice and can give the teacher
responsibility for choosing a useful exercise. A lesson can be someone’s
first encounter with an entire craft or an experienced practitioner’s
first use of one technique. The deciding question is what the activity
lets this particular learner experience.[^diataxis-tutorials]

## Where a lesson earns its place

In Ableton’s *Make beats*, the learner starts with a musical pattern and
can add or remove individual notes in a grid. The exercise gives a
beginner a rhythm to vary and a way to hear what one change does.[^beats]
That opportunity is visible in the lesson. To tell whether someone can
now make a change deliberately, listen to the rhythm they choose for a
new pattern and ask what they changed.

The audience matters even for a first lesson. The Python Tutorial
assumes its readers already understand programming. An author can
choose an introductory exercise for someone experienced in another
language that would leave a first-time programmer guessing. Check what
the activity asks the learner to bring to it.[^python-tutorial]

## The cost of choosing the exercise

A teacher can arrange one working environment, an attainable goal,
small actions with recognizable results, and a chance to try again.
Taking choices off the learner’s hands gives them attention to spend
on the skill in front of them. It also makes the author responsible
for the path. A changed default or missing prerequisite early in the
lesson can spoil everything after it.[^diataxis-tutorials]

A musician preparing a rhythm track for a rehearsal brings a deadline and
conditions the author cannot choose. A [how-to guide](how-to.md) can
accommodate that work.[^diataxis-tutorials-how-to] Someone who can already perform the task but
wonders why it behaves as it does has a question for an
[explainer](explanation.md). For repeated practice where learners can
increasingly direct themselves, consider whether a
[learning checklist](learning-checklist.md) provides enough support.

To understand what a chosen activity gives the learner, read
[Why a tutorial gives the learner something to do](../explainers/tutorial.md).
To develop and check a lesson, follow
[How to write a tutorial](../guides/writing-a-tutorial.md).

[^diataxis-tutorials]: Daniele Procida, [Tutorials](https://diataxis.fr/tutorials/).
[^diataxis-tutorials-how-to]: Daniele Procida, [The difference between a tutorial and how-to guide](https://diataxis.fr/tutorials-how-to/).
[^beats]: Ableton, [Make beats](https://learningmusic.ableton.com/make-beats/make-beats.html).
[^python-tutorial]: Python, [The Python Tutorial](https://docs.python.org/3/tutorial/).
