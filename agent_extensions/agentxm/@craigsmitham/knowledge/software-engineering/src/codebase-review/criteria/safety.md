---
type: Checklist
title: Safety quality criteria
description: Use when assessing whether the product keeps the risk of unacceptable harm within declared tolerances across use, misuse, failure, and integration.
tags: [codebase-review, software-quality, safety, hazards, harm, risk, reporting-review]
status: draft
sources:
- id: iso-25010
  resource: https://www.iso.org/standard/78176.html
  title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
- id: iso-25010-preview
  resource: https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf
  title: ISO/IEC 25010:2023 public preview
- id: nasa-assurance
  resource: https://standards.nasa.gov/standard/nasa/nasa-std-87398
  title: NASA-STD-8739.8B Software Assurance and Software Safety Standard
- id: dependability
  resource: https://www.landwehr.org/2004-aviz-laprie-randell.pdf
  title: Basic Concepts and Taxonomy of Dependable and Secure Computing
- id: ieee-1012
  resource: https://standards.ieee.org/ieee/1012/7324/
  title: IEEE 1012-2024 Standard for System, Software, and Hardware Verification and Validation
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Safety quality criteria

Use this list only when product behavior can cause, contribute to, control,
mitigate, detect, or recover from a hazard. Safety is the product outcome of
keeping risk of unacceptable harm within declared tolerances—not the presence
of a hazard log, interlock, test, warning, or safety process. Those artifacts
and mechanisms can support a claim but cannot establish it by themselves.[^nasa-assurance]

This is a candidate `reporting-review` checklist, not a safety assessment
standard or certification basis. A repository alone rarely establishes
tolerable risk, and safety-relevant decisions require appropriate domain,
regulatory, affected-party, and independent authority. Apply the shared
assessment states and evidence rules in [Reviewing a
codebase](../reviewing-a-codebase.md). The pillar definition and neighbor
boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion through affected people and
assets, hazards, operating modes, exposure, severity, tolerances, and safety
authority. `XC-08` Evidence must qualify every judgment. Unless a criterion
says otherwise, these list-level defaults apply:

| Concern | Default relationship to Safety |
| --- | --- |
| `XC-02` Specification | `EN·EV` — supplies safety constraints, hazards, safe states, responses, and tolerances. |
| `XC-03` Structure | `CTR·TR` — isolation, independence, authority, and interaction can contribute to or impair safety. |
| `XC-04` Lifecycle integrity | `EN·EV·TH` — identified versions, configuration, change, release, and recovery condition safety claims. |
| `XC-05` Risk | `TH·CS·TR` — hazards, misuse, interactions, severity, exposure, and tolerability govern the claim. |
| `XC-06` Assurance | `EN·EV` — proportionate verification, validation, and independent evidence can support safety claims. |
| `XC-07` Feedback | `EN·EV·TH` — operational and incident signals can reveal hazards while detection failure can worsen them. |

## Criteria

### SAF-01 — Operational constraint

**Outcome question:** Does the product prevent operation
outside each declared safety constraint?[^iso-25010-preview][^nasa-assurance]

**Why it matters:** hazard-capable functions must remain within the conditions
under which their use is acceptably safe.

**Applicability:** requires domain-authoritative limits, controlled
operations, affected subjects, and tolerances. Ordinary business validation
without a harm relationship belongs to Correctness.

**Boundary:** this criterion owns the consequence-bearing safety constraint.
Correctness owns conformance to ordinary contracts; Security owns
unauthorized circumvention.

### SAF-02 — Hazard recognition

**Outcome question:** Does the product recognize each
in-scope hazardous condition early enough for its required response?[^iso-25010-preview][^nasa-assurance]

**Why it matters:** a protective response cannot occur when a hazardous state
remains undetected or is detected too late.

**Applicability:** apply only where the product has an allocated detection
responsibility and access to the necessary observations.

**Boundary:** this criterion owns product recognition of a hazard. `SAF-07`
owns a timing-window violation when lateness itself creates the harm risk;
`XC-07` Feedback and `XC-06` Assurance do not substitute for the outcome.

### SAF-03 — Hazard warning

**Outcome question:** Does the product communicate each recognized
hazard to the responsible recipient within the declared warning
bounds?[^iso-25010-preview][^nasa-assurance]

**Why it matters:** detection without a usable and timely warning may not
enable the responsible person or system to reduce harm.

**Applicability:** identify the recipient, channel, urgency, meaning, expected
response, and fallback when delivery is unavailable.

**Boundary:** this criterion owns the harm-bearing warning outcome. `SAF-07`
owns a timing-window violation when timing itself creates the harm risk;
Usability owns general comprehensibility and Reliability ordinary delivery
continuity.

### SAF-04 — Safe-state attainment

**Outcome question:** When continued operation would
violate a safety constraint, does the product enter its declared safe state
within required bounds?[^iso-25010-preview][^nasa-assurance][^dependability]

**Why it matters:** some failures require safing or cessation rather than
continued availability.

**Applicability:** a safe state must be established by domain authority;
shutdown, restart, isolation, or continued control is not inherently safe.

**Boundary:** this criterion owns transition to the harm-minimizing state.
`SAF-07` owns a timing-window violation when timing itself creates the harm
risk; Reliability may favor continued service and Correctness owns transition
conformance absent the harm consequence.

### SAF-05 — Harm mitigation

**Outcome question:** When an in-scope hazard occurs, does
product behavior limit its consequence to the declared tolerance?[^nasa-assurance][^dependability]

**Why it matters:** not every hazard can be prevented, so bounded consequence
is a distinct safety outcome.

**Applicability:** requires an identified harmful outcome, exposure, severity,
mitigation responsibility, and residual tolerance.

**Boundary:** this criterion owns the product's harm bound. `XC-05` Risk
identifies and analyzes the hazard; it does not receive the product verdict.

### SAF-06 — Hazard containment

**Outcome question:** Does an in-scope hazardous effect remain
inside its declared containment boundary?[^nasa-assurance][^dependability]

**Why it matters:** a local hazardous state becomes more severe when it
propagates across components, people, property, or environments.

**Applicability:** apply only where containment boundaries, affected subjects,
coupling, and tolerated escape conditions are defined.

**Boundary:** this criterion owns propagation of harm. Reliability containment
owns accidental service failure; Security isolation owns unauthorized
influence.

### SAF-07 — Timing safety

**Outcome question:** Does every safety-relevant product response
occur within its declared safe time window?[^nasa-assurance]

**Why it matters:** a logically correct response can still be hazardous when
late, early, stale, or improperly sequenced.

**Applicability:** requires a domain-derived response window or sequence and
a credible harm relationship. A generic latency target belongs to Efficiency.

**Boundary:** this criterion owns harm-bearing timing. Efficiency owns
ordinary time fitness; Correctness owns ordinary ordering obligations.

### SAF-08 — Misuse tolerance

**Outcome question:** Under each reasonably foreseeable misuse
in scope, does product behavior keep risk within the declared
tolerance?[^iso-25010][^nasa-assurance]

**Why it matters:** safety extends beyond ideal intended operation when human
or system misuse is foreseeable.

**Applicability:** requires a defensible misuse scenario, exposure, consequence,
and tolerance. It does not require resistance to every malicious act.

**Boundary:** this criterion owns harm under foreseeable misuse. Usability can
reduce user error; Security owns adversarial authority and asset protection.

### SAF-09 — Integration safety

**Outcome question:** When composed with each in-scope system
or environment, does the product preserve the declared safety
constraints?[^iso-25010-preview][^nasa-assurance][^ieee-1012]

**Why it matters:** individually acceptable components can interact to create
a hazardous system state.

**Applicability:** requires a defined integration context, allocated safety
responsibilities, relevant interactions, and shared assumptions. Scenario
analysis can expose tradeoffs without proving safety.

**Boundary:** this criterion owns harmful consequences of composition.
Compatibility owns successful coexistence and exchange; Correctness owns
ordinary interface conformance.

### SAF-10 — Recovery safety

**Outcome question:** Before hazard-capable operation resumes,
does the product re-establish every declared safety prerequisite?[^nasa-assurance][^dependability]

**Why it matters:** recovery can reintroduce harm by bypassing interlocks,
using stale state, or resuming in an unsafe sequence.

**Applicability:** apply where operation can resume after interruption,
degradation, maintenance, update, or a safe state.

**Boundary:** this criterion owns safety of resumption. Reliability owns
restoration of service; Correctness owns ordinary recovery-state conformance.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
The refinements beyond the core ISO safety dimensions remain
context-dependent. Completion never authorizes a safety claim without the
domain-specific requirements, evidence, independence, and authority the
consequence demands.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25010-preview]: ISO/IEC, [ISO/IEC 25010:2023 public preview](https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf).
[^nasa-assurance]: NASA, [NASA-STD-8739.8B Software Assurance and Software Safety](https://standards.nasa.gov/standard/nasa/nasa-std-87398).
[^dependability]: Avizienis, Laprie, Randell, and Landwehr, [Basic Concepts and Taxonomy of Dependable and Secure Computing](https://www.landwehr.org/2004-aviz-laprie-randell.pdf).
[^ieee-1012]: IEEE, [IEEE 1012-2024 Verification and Validation](https://standards.ieee.org/ieee/1012/7324/).
