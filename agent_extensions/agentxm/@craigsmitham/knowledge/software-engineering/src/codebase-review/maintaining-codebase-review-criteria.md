---
type: Guide
title: Maintaining codebase-review criteria
description: Use when adding, revising, evaluating, or retiring codebase-review criteria; preserve stable quality outcomes while evolving evidence aids, perspectives, and inspection methods independently.
tags: [codebase-review, quality-criteria, checklist-design, maintenance, validation, lifecycle, evidence]
status: draft
sources:
  - id: iso-quality
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
  - id: iso-review
    resource: https://www.iso.org/standard/67407.html
    title: ISO/IEC 20246:2017 Work product reviews
  - id: nasa-requirements
    resource: https://www.nasa.gov/reference/appendix-c-how-to-write-a-good-requirement/
    title: How to Write a Good Requirement
  - id: nasa-inspections
    resource: https://standards.nasa.gov/sites/default/files/standards/NASA/Baseline/1/nasa-std-87399_with_change_1.pdf
    title: NASA-STD-8739.9 Software Formal Inspections Standard
  - id: goals
    resource: https://webperso.info.ucl.ac.be/~avl/files/RE01.pdf
    title: Goal-Oriented Requirements Engineering — A Guided Tour
  - id: scenarios
    resource: https://doi.org/10.1109/32.391380
    title: An Experiment to Assess Different Defect Detection Methods for Software Requirements Inspections
  - id: scenario-replication
    resource: https://doi.org/10.1023/A:1009742216007
    title: A Replicated Experiment to Assess Requirements Inspection Techniques
  - id: security-perspective
    resource: https://doi.org/10.1145/3510003.3511560
    title: Do Explicit Security Perspectives Help Software Developers Find Security Defects?
  - id: rubrics
    resource: https://doi.org/10.1016/j.edurev.2007.05.002
    title: The use of scoring rubrics — Reliability, validity and educational consequences
  - id: checklist-evaluation
    resource: https://doi.org/10.1016/j.infsof.2019.106240
    title: An empirically evaluated checklist for surveys in software engineering
  - id: prompting
    resource: https://doi.org/10.1016/j.infsof.2024.107523
    title: Fine-tuning and prompt engineering for large language models-based code review automation
  - id: verification
    resource: https://doi.org/10.1007/s10515-026-00638-5
    title: Are We Asking the Right Questions? Counterfactual Verification for Reliable LLM Code Review
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Maintaining codebase-review criteria

Use this guide when adding, revising, evaluating, or retiring a criterion in
the codebase-review collection. It keeps the desired qualities being assessed
separate from the ways a reviewer may gather evidence about them.

Use [Software quality pillars](software-quality-pillars.md) as the candidate
foundation for deciding which product outcome owns a criterion. Treat the
current criteria as subordinate expressions of those pillars; do not let a
supporting artifact, review method, tool, or convenient proxy silently redefine
the foundation.

Use [Cross-cutting concerns for software quality](cross-cutting-concerns.md)
when a criterion concerns context, specification, structure, lifecycle
integrity, risk, assurance, feedback, or evidence across several pillars. That
model owns subject and role classification, the admission gate for canonical
cross-cutting records, and typed pillar relationships. This guide continues to
own how criteria and optional review aids evolve.

The collection is a source-reviewed `reporting-review` candidate, not a
field-validated control. This guide governs its design and evolution; it does
not establish that the criteria are complete, reliable, or sufficient for a
release, compliance, safety, or assurance decision.

## Outcome-centered, method-aware

Make the stable core describe **what quality is desired**, not one procedure
for inspecting it:

```text
quality outcome -> observable criterion -> optional evidence aid
                -> contextual perspective or method -> evidence-backed judgment
```

Software-quality models describe properties that can be specified, measured,
and evaluated, while review standards separately describe review processes,
techniques, and records.[^iso-quality][^iso-review] Requirements and
goal-oriented guidance likewise distinguish the result to achieve from its
possible operationalizations.[^nasa-requirements][^goals] Applying that
distinction to codebase-review criteria is a design inference: these sources do
not by themselves prove that outcome-centered prompts produce better reviews.

Do not turn that separation into an outcome-only doctrine. Formal inspection
guidance treats checklists, questions, scenarios, and stakeholder perspectives
as work aids and expects reviewers to think beyond them.[^nasa-inspections]
Experiments have found benefits from scenarios or explicit perspectives in
some settings, but replication and task differences show that those benefits
do not transfer automatically.[^scenarios][^scenario-replication][^security-perspective]
AI prompting evidence is similarly conditional: extra decomposition, personas,
or explanation requirements can help, do nothing, or trade one kind of error
for another.[^prompting][^verification]

The maintenance rule is therefore:

> Keep desired outcomes in the criteria. Add evidence cues, perspectives, or
> methods as separately identifiable aids when evidence shows that they improve
> review performance for a relevant context.

## Keep the artifact layers distinct

| Layer | Owns | Does not own | Expected rate of change |
| --- | --- | --- | --- |
| Quality outcome | The durable property or relationship sought | Inspection steps, tools, or report formatting | Slow |
| Criterion | One observable question about that outcome | An exhaustive proof recipe | Slow |
| Evidence aid | Non-exhaustive artifacts, signals, or examples that may ground a judgment | A claim that one signal is necessary or sufficient proof | Moderate |
| Perspective or method aid | A stakeholder viewpoint, scenario, trace, test, or tool-supported inspection approach | Rewording the desired outcome | Context- and tool-dependent |
| Assessment protocol | Response states, evidence fields, findings, uncertainty, and reporting limits | New quality criteria | Moderate |

Keep these layers linkable by stable identifiers rather than duplicating them.
When an aid changes because a tool, repository convention, or model capability
changes, the underlying criterion should normally remain stable.

The ten pillars belong only to the product-quality-outcome layer. A useful
design principle, engineering-system capability, assurance mechanism, or
evidence property should remain visible and reusable through the typed
cross-cutting model without being promoted into the pillar set.

## Write a core criterion

Use this form:

```markdown
### <ID> — <singular quality name>

**Outcome question:** Does <subject> exhibit <desired observable property>
within the material scope or conditions?

**Why it matters:** <consequence of meeting or missing the outcome>

**Applicability:** <when it applies and what makes a verdict indeterminate>

**Boundary:** <canonical owner and nearest-neighbor distinction>
```

Every criterion must have:

- a stable, pillar-prefixed identifier;
- one coherent quality idea and a named subject;
- an affirmative, judgeable desired state expressed as a question;
- material scope or applicability conditions where they affect the judgment;
- a short rationale naming the consequence of the quality;
- a nearest-neighbor boundary that prevents duplicate ownership; and
- source attribution for domain-critical content.

Avoid:

- imperatives aimed at the reviewer, such as *inspect*, *trace*, *map*,
  *identify*, *compare*, or *verify*;
- named tools, commands, traversal order, or mandatory evidence sources;
- abstract aspirations such as “good quality” or “maintainable” without an
  observable condition;
- compound criteria whose parts can receive materially different judgments;
  and
- solution commitments where several legitimate implementations can satisfy
  the outcome.

Reviewer-action verbs are only a warning sign, not a mechanical ban. A desired
property may legitimately be *traceable*, *observable*, or *verifiable*. Read
the sentence to determine whether it describes the software or directs the
reviewer.

Exactly ten pillars and ten criteria per pillar are editorial coverage
constraints, not a ranking, weighting model, or claim of completeness. Do not
hide unrelated properties in one question merely to preserve the count. If the
constraint no longer permits clear, material criteria, record that conflict and
revise the collection design deliberately.

## Route changes to the owning layer

| Observed need | Change the criterion when | Prefer another layer when |
| --- | --- | --- |
| Quality expectation changed | The desired property, scope, or consequence changed | Only available evidence or tooling changed |
| Interpretations diverge | The subject, property, or applicability boundary is ambiguous | Reviewers understand the outcome but need calibration examples |
| Reviewers miss evidence | The omission reveals a missing quality property | The property is sound but evidence is hard to locate |
| A perspective finds unique issues | The perspective exposes an absent quality outcome | It supplies focus for evaluating existing outcomes |
| A technique improves detection | It changes what can reasonably be assessed | It provides one useful inspection method |
| Reports are inconsistent | Criterion wording causes different judgments | Response anchors or report fields are unclear |
| An item attracts noise | The desired state is immaterial or mis-scoped | One aid or proxy is causing false conclusions |

Never treat a scanner warning, metric threshold, file presence, model
explanation, or absence of contrary evidence as sufficient proof unless that
relationship has been established for the declared context.

## Maintain the collection

1. **Capture the trigger.** Record the source change, disagreement, escaped
   defect, false finding, omission, tool change, or field observation that
   motivates revision.
2. **Locate the owning layer.** Decide whether the evidence challenges the
   quality outcome, criterion wording, an aid, or the shared assessment
   protocol.
3. **Preserve stable meaning.** Prefer changing the narrowest layer that
   explains the evidence. Do not rewrite a criterion merely because a new tool
   offers another way to inspect it.
4. **Reconcile the pillar set.** Check overlap, gaps, applicability, and
   terminology within the pillar and across neighboring pillars. Keep one
   canonical owner for a concern and cross-reference its consequences.
5. **Run a design review.** Challenge ambiguous interpretation, false
   completion, ritual use, wrong-lens selection, expert-judgment suppression,
   inaccessible evidence, and displacement of a stronger automated control.
6. **Update provenance and discovery.** Refresh sources and generation time,
   update the enclosing index when its preview changes, and record the revision
   rationale in the bundle log.
7. **Validate at the claimed level.** Structural and source review can support
   a candidate; representative comparative use is required before claiming
   review effectiveness.

Analytic, topic-specific criteria and calibrated examples can improve judgment
agreement, but an assessment instrument does not create validity by itself.[^rubrics]
Empirical checklist development also shows that pilot feedback can force major
wording and objectivity revisions.[^checklist-evaluation]

## Assess every criterion without losing uncertainty

The shared protocol in [Reviewing a codebase](reviewing-a-codebase.md) owns the
response states. Maintain these distinctions:

- `Meets`, `Partially meets`, and `Does not meet` are evidence-backed judgments
  about the declared scope.
- `Not applicable` requires a scope reason.
- `Indeterminate` means available evidence is insufficient, inaccessible,
  materially conflicting, or unable to support a judgment.
- `Not assessed` means the bounded review ended before the criterion was
  investigated.

Do not silently convert `Indeterminate` or `Not assessed` into a pass or a
failure. Keep criterion state separate from finding severity, remediation
priority, and any contextual risk decision. Do not publish an aggregate quality
score without an externally justified weighting and missing-data model.

## Validate the design comparatively

Compare the complete [product-quality criteria](criteria/) and any selected
[supporting checklist](supporting/) with an unconstrained review, credible
alternative quality models, and—when useful—variants that expose evidence or
method aids differently. Do not treat the synthetic [framework design
review](framework-design-review.md) as observed effectiveness evidence.

Bind every comparison to the repository revision, review scope, reviewer or
exact model and configuration, tool access, prompt, and criterion version.
Use representative libraries, applications, services, and multi-package
repositories, including intentional exceptions and previously adjudicated or
seeded defects.

Measure:

- valid material findings, omissions, overlap, and unique findings;
- unsupported findings, false acceptance, and false rejection;
- criterion-level agreement and incompatible interpretations;
- evidence quality and diagnostic-cause accuracy separately from verdicts;
- review coverage, time, and token or tool cost;
- use of `Indeterminate`, `Not applicable`, and `Not assessed`; and
- material findings discovered beyond the criteria.

Evidence against the design includes reduced material-issue coverage,
increased unsupported conclusions, persistent ambiguity, ritual completion,
important issues missed across reviewers, or a feasible alternative that
performs the intended job more reliably. Do not reinterpret adverse or null
results as success by narrowing the original claim after the fact.

## Current design-review evidence

The 2026-09-01 [Codebase-review framework design
review](framework-design-review.md) challenged all ten pillars, the supporting
test-suite assessment, cross-cutting relationships, and method separation
against six synthetic product forms and seven boundary cases. It caused
material revisions: binary checkbox presentation was removed, several
contributor-shaped or umbrella criteria were replaced, compound questions were
narrowed, and source scope was corrected.

That record supports only candidate design coherence. No actual repository or
reviewer comparison has yet established material-issue coverage,
unsupported-finding rate, agreement, decision validity, or cost.

## Lifecycle

The package's declared owner controls publication and versioning. An
accountable field-validation owner, representative repository population, and
acceptance thresholds are not yet declared, so the collection remains
`status: draft`.

Review affected criteria or aids when:

- their sources, supported software practices, or terminology change;
- recurring reviews produce disagreements, false findings, or escaped issues;
- repository structures, tools, model capabilities, or available evidence
  change materially;
- `Not applicable`, `Indeterminate`, or `Not assessed` results become
  disproportionate; or
- an automated control, narrower checklist, rubric, or other aid performs the
  job with less omission or false assurance.

Replace, merge, or retire a criterion when it no longer represents a material
distinct outcome, cannot be assessed consistently, or displaces a stronger
control. Preserve the revision rationale and inbound discovery when doing so.

[^iso-quality]: ISO, [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html).
[^iso-review]: ISO, [ISO/IEC 20246:2017](https://www.iso.org/standard/67407.html).
[^nasa-requirements]: NASA, [How to Write a Good Requirement](https://www.nasa.gov/reference/appendix-c-how-to-write-a-good-requirement/).
[^goals]: van Lamsweerde, [Goal-Oriented Requirements Engineering: A Guided Tour](https://webperso.info.ucl.ac.be/~avl/files/RE01.pdf).
[^nasa-inspections]: NASA, [Software Formal Inspections Standard](https://standards.nasa.gov/sites/default/files/standards/NASA/Baseline/1/nasa-std-87399_with_change_1.pdf).
[^scenarios]: Porter, Votta, and Basili, [An Experiment to Assess Different Defect Detection Methods for Software Requirements Inspections](https://doi.org/10.1109/32.391380).
[^scenario-replication]: Fusaro, Lanubile, and Visaggio, [A Replicated Experiment to Assess Requirements Inspection Techniques](https://doi.org/10.1023/A:1009742216007).
[^security-perspective]: Braz et al., [Do Explicit Security Perspectives Help Software Developers Find Security Defects?](https://doi.org/10.1145/3510003.3511560).
[^prompting]: Pornprasit and Tantithamthavorn, [Fine-tuning and prompt engineering for large language models-based code review automation](https://doi.org/10.1016/j.infsof.2024.107523).
[^verification]: Jin and Chen, [Are We Asking the Right Questions? Counterfactual Verification for Reliable LLM Code Review](https://doi.org/10.1007/s10515-026-00638-5).
[^rubrics]: Jönsson and Svingby, [The use of scoring rubrics](https://doi.org/10.1016/j.edurev.2007.05.002).
[^checklist-evaluation]: Molléri, Petersen, and Mendes, [An empirically evaluated checklist for surveys in software engineering](https://doi.org/10.1016/j.infsof.2019.106240).
