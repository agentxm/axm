---
type: Explainer
title: Why a tutorial gives the learner something to do
description: How a chosen exercise, recognizable feedback, and a tutor’s decisions let a learner encounter a skill in use.
tags: [docs, tutorial, lesson, learning, feedback, diataxis]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T00:06:36Z }
sources:
  - id: lesson
    resource: https://diataxis.fr/tutorials/
    title: Diátaxis — Tutorials
  - id: turtle
    resource: https://docs.python.org/3/library/turtle.html#tutorial
    title: Python — Turtle graphics tutorial
---

# Why a tutorial gives the learner something to do

Python’s turtle tutorial gives learners a way to see what their commands do.
An arrow sits in the middle of a window. The learner types a command, the
arrow moves, and a line appears behind it. By the time the learner has drawn
a triangle, they have seen two commands do quite different things. Moving
forward draws in the current direction. Turning changes the direction the
next line will take.[^turtle]

A finished picture would show the triangle immediately. Watching the
arrow turn gives the learner something else. They can see it change
direction at the same spot in the window.
When they send it forward again, the new edge reveals the consequence
of their own last instruction. The picture records a sequence of
decisions that the learner has had a hand in making.

## The tutor chooses the encounter

Why a triangle? Three short edges give the learner several chances to
connect a turn with the line that follows. The result has a recognizable
end. A learner can see whether the last edge reaches the starting point,
even on their first encounter with the language. In Diátaxis the author
of a tutorial chooses an activity for what it allows a learner to
experience. The drawing belongs to the learner, while the choice of a
manageable exercise belongs to the tutor.[^lesson]

That responsibility reaches outside the lesson text. The turtle window
depends on Python’s Tk interface. In an environment without it, someone
can follow the first instruction exactly and still never see the arrow.
Python’s documentation calls out that dependency for people preparing
to use turtle with a learner. An instructor in the room could notice a
blank screen. A written lesson has to anticipate the moment when a learner
might reasonably wonder whether anything happened.[^turtle]

There are two different questions to ask about the triangle at the end.
Did the directions lead to the drawing? The finished triangle answers
that. Can this learner use a turn to send the next line where they want?
An opportunity to steer again can show something the finished picture
alone cannot.

For a decision about whether a lesson fits a reader’s need, see the
[Tutorial pattern](../patterns/tutorial.md). For the work of composing
and trying a lesson, see [How to write a tutorial](../guides/writing-a-tutorial.md).

[^lesson]: Daniele Procida, [Tutorials](https://diataxis.fr/tutorials/).
[^turtle]: Python, [Turtle graphics tutorial](https://docs.python.org/3/library/turtle.html#tutorial).
