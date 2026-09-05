---
type: Guide
title: Scenario analysis
description: Use when challenging product-quality claims with concrete stakeholder, workload, failure, threat, hazard, integration, and change scenarios.
tags: [codebase-review, review-aid, scenarios, risk, tradeoffs, architecture]
status: draft
sources:
  - id: atam
    resource: https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/
    title: Architecture Tradeoff Analysis Method collection
  - id: iso-25040
    resource: https://www.iso.org/standard/83467.html
    title: ISO/IEC 25040:2024 Quality evaluation framework
  - id: nist-ssdf
    resource: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf
    title: NIST SP 800-218 Secure Software Development Framework
  - id: nasa-assurance
    resource: https://standards.nasa.gov/standard/nasa/nasa-std-87398
    title: NASA-STD-8739.8B Software Assurance and Software Safety Standard
  - id: sre-cascades
    resource: https://sre.google/sre-book/addressing-cascading-failures/
    title: Google SRE — Addressing Cascading Failures
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Scenario analysis

Use this optional aid when a quality claim is too abstract to challenge
directly. A scenario makes the stakeholder, stimulus, environment, product
boundary, response, and acceptable bound concrete. Architecture tradeoff
analysis uses scenarios because quality interactions and tradeoffs are
contextual rather than universal properties of a structural pattern.[^atam]

## Form a bounded scenario

Record:

| Field | Question |
| --- | --- |
| Stakeholder or source | Who or what initiates, experiences, or is affected by the scenario? |
| Stimulus | What goal, input, event, demand, change, fault, threat, misuse, or hazard occurs? |
| Environment | Under which operating mode, workload, version relationship, degradation, or lifecycle condition? |
| Product scope | Which product and interfaces are responsible for the response? |
| Response | What observable product outcome is required or prohibited? |
| Bound | What time, loss, capacity, effort, authority, harm, cost, or uncertainty tolerance applies? |
| Authority | Which stakeholder, contract, domain source, or decision supplies that expectation? |

Do not invent a bound because it would be convenient to test. Quality
evaluation begins from an identified evaluation purpose and requirements, and
scenario authority remains part of the evidence.[^iso-25040]

## Choose scenario families conditionally

Use only families relevant to the selected criteria:

- intended user goals, stakeholder variants, and operating modes for
  Suitability and Usability;
- domain boundaries, invalid states, repetition, concurrency, and failure
  semantics for Correctness;
- sustained demand, dependency failure, partial work, interruption,
  degradation, and recovery for Reliability and Efficiency;
- actor, asset, trust transition, malicious influence, and control failure for
  Security; secure-development guidance makes threat context and risk response
  explicit rather than prescribing one review sequence;[^nist-ssdf]
- hazard, foreseeable misuse, safe state, integration, and resumption for
  Safety; a portable scenario cannot replace domain hazard authority;[^nasa-assurance]
- platform, participant, representation, protocol, version, and data evolution
  for Compatibility;
- representative modification, migration, scale, adaptation, and replacement
  for Evolvability; and
- representative maintainer questions about concepts, state, effects,
  boundaries, and rationale for Intelligibility.

## Challenge the scenario

Trace how the product can reach the response, which assumptions and resources
it depends on, which neighboring outcomes can be impaired, and what evidence
would falsify the apparent result. For demand and failure scenarios, consider
amplification, queues, deadlines, retry budgets, saturation, containment, and
recovery without treating those mechanisms as the Reliability verdict.[^sre-cascades]

Record one primary criterion for the scenario result and typed cross-cutting or
neighbor relationships for other consequences. A scenario that exposes a
tradeoff should not be duplicated into contradictory findings.

## Interpret the result

A scenario can:

- demonstrate a material contrary behavior;
- support a bounded positive claim when the conditions and evidence are
  representative;
- expose missing or conflicting specification;
- reveal an unassessed risk or tradeoff; or
- remain `Indeterminate` because authority, representativeness, execution, or
  evidence is insufficient.

Passing a selected scenario does not prove the entire criterion. Failure of an
imagined or out-of-scope scenario does not prove a product defect. Preserve the
selection rationale, counterexamples, and omitted scenario families so another
reviewer can understand the evidence boundary.

[^atam]: SEI, [Architecture Tradeoff Analysis Method collection](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/).
[^iso-25040]: ISO, [ISO/IEC 25040:2024 quality evaluation framework](https://www.iso.org/standard/83467.html).
[^nist-ssdf]: NIST, [SP 800-218 Secure Software Development Framework](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf).
[^nasa-assurance]: NASA, [NASA-STD-8739.8B Software Assurance and Software Safety](https://standards.nasa.gov/standard/nasa/nasa-std-87398).
[^sre-cascades]: Google SRE, [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/).
