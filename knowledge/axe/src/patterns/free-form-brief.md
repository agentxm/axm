---
type: Pattern
title: "Free-form brief"
description: "Accept a natural-language brief when the caller needs to express intent, preferences, or constraints that fixed arguments would obscure."
tags: ["skills", "arguments", "brief", "free-form", "constraints", "natural language"]
status: draft
sources:
  - id: generate
    resource: https://impeccable.style/docs/generate/
    title: Impeccable generate
---

# Free-form brief

Impeccable lets a designer name an element, ask for variations in a direction,
and specify how many to generate in one sentence. Existing design constraints
can travel with that request.[^generate]

Consider “Try two quieter versions of the checkout heading and keep the price
prominent.” Resolve the heading on the checkout page, carry the count into
generation, and keep the price constraint when comparing the results. “Quieter”
expresses a preference that a fixed list of styles might lose. If two headings
fit the description, ask which heading the caller meant and retain the other
choices.

In a design skill’s `SKILL.md`, show this request alongside the inputs the
agent carries into its preview. If the only caller choice is which component
to inspect, a component name is enough.

A brief can follow an [operation selector](operation-selector.md). Mark where
prose begins if it could include a reserved verb or an option as literal text.
Use a [named option](named-option.md) for a recurring control that needs exact
validation. Keep prose available for the judgments the option cannot express.

Try two paraphrases, one with the constraint at the end. Check the resulting
work against the original target, count, direction, and constraint. Correct
target selection alone cannot show that the whole brief survived.

[^generate]: Impeccable, naming an element, directing variations, and resolving an ambiguous target.
