---
type: Explanation
title: Quality characteristics and architectural concerns
description: How quality characteristics become contextual, assessable concerns that matter to architecture, and how scenarios and evidence make them useful without turning a taxonomy into a checklist.
tags: [quality-characteristics, quality-attributes, quality-requirements, architecture-significant-requirements, quality-scenarios, software-architecture]
status: draft
sources:
  - id: iso-25010
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 — Product quality model
  - id: sei-qaw
    resource: https://www.sei.cmu.edu/library/quality-attribute-workshops-qaws-third-edition/
    title: Software Engineering Institute — Quality Attribute Workshops
generated:
  by: codex/gpt-5.6
  at: 2026-08-16T02:29:42Z
---

# Quality characteristics and architectural concerns

A **quality characteristic** names a dimension along which people can judge a
system, such as its reliability, security, usability, or maintainability. It
provides a vocabulary for asking questions; by itself it is not a requirement,
priority, or design decision. ISO/IEC 25010 provides a product-quality model
whose characteristics and subcharacteristics can support specification,
measurement, and evaluation.[^iso-25010]

A **quality concern** makes that vocabulary local. It identifies whose concern
is at stake, what outcome or risk matters, and where it applies. A **quality
requirement** goes further by stating an accepted expectation precisely enough
to assess. The progression is:

> quality characteristic → contextual concern → assessable requirement →
> evidence

For example, *reliability* is a characteristic. “Operators need interrupted
imports to resume without duplicating accepted records” is a concern. An
accepted statement about the recovery conditions, permitted loss, and
observable result is a requirement. A recovery test, operational exercise, or
production measure can then provide evidence.

## Quality qualifies behavior

Functional and quality concerns are distinct but inseparable in operation.
Functional concerns describe what outcomes, rules, and interactions the system
must support. Quality concerns qualify how well, under what conditions, or with
what risk those outcomes must be delivered.

Some quality concerns attach directly to one function: the time allowed to
complete a search, for example. Others emerge across several elements or
product surfaces: recoverability, confidentiality, operability, and ease of
change frequently depend on collaborations and boundaries rather than one
feature owner. They therefore need not be documented in a capability catalog or
repeated under every feature.

## When quality becomes architectural

A quality concern is architecture-significant when satisfying it materially
constrains one or more of:

- responsibility, authority, or state ownership;
- boundaries, dependencies, or permitted interactions;
- consistency, trust, failure, or recovery models;
- deployment, scaling, or observability structure;
- the system's ability to change; or
- a consequential tradeoff among these choices.

Not every quality requirement crosses that threshold. A local validation rule
may be important and testable while requiring no durable architectural
explanation. Conversely, a concern can be architecture-significant before it
has a numerical target if it already constrains the design. Record the known
constraint and the evidence that could resolve uncertainty; do not invent a
number merely to make prose look measurable.

## Refine consequential concerns with scenarios

When a broad label permits competing interpretations, refine the concern as a
scenario. The Software Engineering Institute's Quality Attribute Workshop uses
stakeholder-generated, prioritized scenarios to discover the quality attributes
that drive architecture.[^sei-qaw] A useful scenario identifies:

- the source of a stimulus;
- the stimulus or event;
- the relevant operating environment;
- the affected system or artifact;
- the required response; and
- the measure by which the response will be assessed.

This is a reasoning aid, not a mandatory six-field record. Use the lightest form
that exposes the constraint. “Recoverable” alone is too broad; “after a worker
stops during an accepted import, a replacement resumes from the last durable
checkpoint without accepting a record twice” reveals state, authority, and
recovery implications even before an accepted time threshold exists.

## Use taxonomies as coverage prompts

A quality model helps a team notice neglected concerns and use stable language.
It should not become a checklist that gives every characteristic equal weight
or forces every document to contain an empty section for each one. Ask which
stakeholders and risks make a characteristic relevant, then document only the
concerns that pass the local importance and durability threshold.

Likewise, avoid generic labels in architecture prose. “The system is secure and
scalable” supplies neither a boundary nor an assessable expectation. Name the
threat, load, environment, response, tradeoff, or design constraint that makes
the concern consequential.

## Connect claims to proportionate evidence

Let prose preserve stakeholder meaning, scope, rationale, and architectural
consequences. Let executable or live sources own exact observations where they
are more authoritative:

- tests and simulations exercise scenarios;
- schemas and static checks enforce mechanically decidable constraints;
- benchmarks and load tests measure controlled behavior;
- service objectives and monitoring describe observed operation; and
- reviews and experiments address qualitative or uncertain tradeoffs.

Link these sources instead of copying their details. State what each item of
evidence can and cannot establish. A benchmark is not production behavior, a
test does not prove every execution, and monitoring detects only what it can
observe.

The result is neither a quality catalog nor a second specification system. It
is a small set of contextual, architecture-significant concerns whose meaning,
consequences, and evidence remain visible as implementation changes.

[^iso-25010]: ISO/IEC 25010 defines a product-quality model with
    characteristics and subcharacteristics intended as a reference for
    specifying, measuring, and evaluating product quality.
[^sei-qaw]: The SEI describes the Quality Attribute Workshop as a method for
    identifying, refining, and prioritizing stakeholder scenarios that reveal
    architecture-driving quality attributes.
