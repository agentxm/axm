---
type: Explainer
title: How principles guide judgment
description: Why a shared commitment can guide two people toward different actions, and what gives their decisions a common basis.
tags: [docs, principle, judgment, practical-reason, authority, explanation]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T00:07:34Z }
sources:
  - id: zen
    resource: https://peps.python.org/pep-0020/
    title: Tim Peters — The Zen of Python
  - id: style
    resource: https://peps.python.org/pep-0008/
    title: PEP 8 — Style Guide for Python Code
  - id: goods
    resource: https://facultyinitiative.net/article/the-christian-tradition-never-agreed-on-when-rebellion-is-justified
    title: Oliver O’Donovan — The Christian Tradition Never Agreed on When Rebellion Is Justified
  - id: perspectives
    resource: https://frame-poythress.org/wp-content/uploads/2014/04/John-Frame-Doctrine-of-the-Christian-Life-Excerpt.pdf
    title: John Frame — The Doctrine of the Christian Life
---

# How principles guide judgment

How can two reviewers follow the same principle and give opposite
advice? Both agree that a function name is hard to read. One recommends
renaming it before the next release. The other wants to keep the name. The
first is looking at a new internal function. The second is looking at a
public function whose callers would break tomorrow.

Both can appeal to “Readability counts.” Tim Peters included that line in
*The Zen of Python*, an informational PEP about the design of Python.
PEP 8 takes up the idea in its style guidance. It recommends lowercase
function names with underscores where they help readers, recognizes local
conventions, and warns against breaking compatibility for the sake of
style. Knowing which function people already depend on changes what
good stewardship of this code requires.[^zen][^style]

## From a good to a reason for acting

Readability is something a community can value. A principle brings that
value to bear on a choice. For the first reviewer, a clearer name will help
the next person find the function and predict what it does. For the second,
readers include the people following existing documentation and calling
the released interface. Renaming it would impose work on people who have
already learned it. The cost matters even though the new name reads better.

Oliver O’Donovan makes a distinction in Christian ethics that helps explain
the movement here. In responding to an account of created order, he agrees
that goods come first and asks how the principles they give rise to orient
people toward action. The analogy for a document author is modest. Naming
a good such as readability still leaves the reader to work out which
available choice would serve it in this situation.[^goods]

## What the person deciding contributes

John Frame considers an ethical question from three perspectives. The
normative perspective asks what directs a person, the situational
perspective attends to the world in which they act, and the existential
perspective considers the person acting, including their motives. In
Frame’s Reformed theology these are views of one judgment, each capable
of correcting a mistake in the others.[^perspectives]

The code review illustrates that relationship on a smaller scale. The
reviewer can quote a convention and still overlook the public contract.
Knowing that a name has shipped can send them back to the style guide to
read its compatibility guidance. Knowing who calls the function may require
asking someone outside their team. The principle asks something of the
reviewer. It takes care to discover who will bear the cost of the change.

The published Python documents have a particular standing in the Python
community. A proposal for another project's naming conventions needs its
own warrant. A principle document earns its place when it makes that
warrant and its consequences intelligible to the next person facing a
different choice. For help developing such a document, see
[How to write a principle document](../guides/writing-a-principle-document.md).

[^zen]: Tim Peters, [The Zen of Python](https://peps.python.org/pep-0020/).
[^style]: [PEP 8](https://peps.python.org/pep-0008/), introductory guidance and function names.
[^goods]: Oliver O’Donovan, [response to Nigel Biggar on created order](https://facultyinitiative.net/article/the-christian-tradition-never-agreed-on-when-rebellion-is-justified), first question.
[^perspectives]: John Frame, [The Doctrine of the Christian Life](https://frame-poythress.org/wp-content/uploads/2014/04/John-Frame-Doctrine-of-the-Christian-Life-Excerpt.pdf), chapter 3.
