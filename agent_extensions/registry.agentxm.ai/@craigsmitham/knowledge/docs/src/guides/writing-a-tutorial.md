---
type: Guide
title: How to write a tutorial
description: When someone needs a first experience with a skill, build a short lesson around something they can do, observe, and try again.
tags: [docs, tutorial, lesson, authoring, revision, learning, diataxis]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T02:00:19Z }
sources:
  - id: lesson
    resource: https://diataxis.fr/tutorials/
    title: Diátaxis — Tutorials
  - id: calculator
    resource: https://docs.python.org/3/tutorial/introduction.html#using-python-as-a-calculator
    title: Python — Using Python as a calculator
---

# How to write a tutorial

Start with the skill someone wants to learn. Choose a first attempt
whose result they can recognize from their own experience. Suppose a
volunteer who sets out chairs for a concert wants to learn Python.
A layout of six rows of eight seats gives them a result they can check
while they are getting used to the interpreter.

## Choose a small piece of the skill

Write down what the learner will do and what they will have a chance to
notice. *Calculate the seat count twice* is an activity. *See how changing
one input changes a calculation* is a reason for choosing it. An opening
tour of numeric types would delay both. Make the same choice for your
brief. Keep the part of the task that lets the learner experience the
skill firsthand.[^lesson]

## Set up the first attempt

Do the activity in the environment your reader will have. Choose one
starting state you can describe precisely. For the seating exercise,
supply a working interactive Python 3 shell and begin at its prompt.
If installation is a separate task for this audience, give them its
directions before the exercise begins. In your own lesson, arrange for a
fresh start wherever it is safe to repeat the work.

Write the shortest passage that gives the learner a recognizable result.
Then use that result to introduce the next move. In this excerpt, the
first calculation makes the later behavior of assignment worth
noticing.[^calculator]

> At the Python prompt, enter `6 * 8` and press Return. You should see
> `48`, the number of chairs in six rows of eight.
>
> Now give the row count a name. Enter `rows = 6`. The prompt returns
> without printing a number. Enter `rows * 8` to see your seat count again.
>
> Add a row. Enter `rows = 7`, then enter `rows * 8` on the next line.
> You now have room for 56 people.

## Revise around the feedback the learner gets

Read each step for what the learner can observe and what it tells them.
When assignment succeeds, Python prints no confirmation. If a draft
promises a result after every command, someone following it may repeat
the assignment and wait again. Put the expected quiet moment beside the
command. Name a way back where a likely slip would otherwise stop the
lesson. Here, if Python reports that `rows` is undefined, enter
`rows = 6` at the prompt and repeat the calculation.

Save choices that need experience until the learner has a result to
experiment with. For this learner, one changed row count gives useful
repetition. Adding a choice of three editors introduces a decision
whose consequences they have yet to encounter.[^lesson]

## Replay the lesson and try a small variation

Return to the starting conditions you set for the learner and use the text
as written. In a fresh Python session, the expected sequence is 48, a
quiet prompt, 48 again, another quiet prompt, and 56. Repair the first
mismatch and replay from the beginning.

If you can observe a learner, let them take that path without supplying
the missing steps aloud. At the end, vary one detail so they can use what
they just practiced. For the concert, the room still has seven rows, but
it can fit nine chairs in each. See whether they can use the shell to
obtain 63 and point to the value they changed. Their actions tell you
which part of the lesson to revisit.
Without a learner, report the replay and leave the learning outcome open.

[^lesson]: Daniele Procida, [Tutorials](https://diataxis.fr/tutorials/).
[^calculator]: Python, [Using Python as a calculator](https://docs.python.org/3/tutorial/introduction.html#using-python-as-a-calculator).
