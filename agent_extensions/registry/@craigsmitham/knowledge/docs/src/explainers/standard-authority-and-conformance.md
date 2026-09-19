---
type: Explainer
title: Standard authority and conformance
description: Where a standard's authority comes from and what conformance to it proves — warrant, standing, and application; criteria, evidence, and measurement; and the bounded claim a conformance statement can honestly make.
tags: [docs, standard, conformance, conformity, compliance, authority, warrant, consensus, criteria, evidence, measurement, assessment, judgment, explainer]
status: stable
sources:
  - id: iso-definitions
    resource: https://policy.iso.org/resources.html
    title: ISO — Useful definitions
  - id: iso-directives
    resource: https://www.iso.org/sites/directives/current/consolidated/
    title: ISO/IEC Directives
  - id: ieee-standards-bylaws
    resource: https://standards.ieee.org/about/policies/bylaws/sect1-3/
    title: IEEE Standards Association — Standards Board Bylaws
  - id: w3c-conformance
    resource: https://www.w3.org/WAI/WCAG20/Understanding/conformance.html
    title: W3C — Understanding conformance
  - id: w3c-testable-requirements
    resource: https://www.w3.org/TR/test-methodology/
    title: W3C — A Method for Writing Testable Conformance Requirements
  - id: odonovan-waking
    resource: https://newcollege.unsw.edu.au/downloads/File/pdf/Lectures_Summaries/Waking.pdf
    title: Oliver O'Donovan — Waking
  - id: odonovan-resolving
    resource: https://newcollege.unsw.edu.au/downloads/File/pdf/Lectures_Summaries/Resolving.pdf
    title: Oliver O'Donovan — Resolving
generated: { by: "claude/opus-5", at: 2026-09-08T00:00:00Z }
---

# Standard authority and conformance

A [standard](standard.md) supplies a common basis of expectation. Two further
questions decide whether that basis deserves to govern a case and what
satisfying it actually establishes: where the standard's authority comes from,
and what evidence supports a conformance claim.

This concept covers those two questions. Read [Standard](standard.md) first for
what a standard is, the kinds of expectation standards carry, and how standards
documents relate to practices and reader needs.

## From goods to judgment

A standard occupies one part of a larger practical movement:

```text
recognized goods and realities
             │
             ├── principle ── directs judgment toward the good
             │
             └── standard ─── establishes a common basis of expectation
                                      │
                         criteria + evidence + interpretation
                                      │
                               situated judgment
                                      │
                    decision, action, or conformance claim
```

This is a conceptual relation, not a mandatory production sequence. A standard
may embody several principles, include rules, define measurements, or be
adopted by a policy. The distinctions still matter:

- The **good** is what deserves pursuit, protection, or truthful recognition.
- A **principle** gives durable direction to judgment in service of a good.
- A **standard** supplies a stable basis for judging or coordinating a field.
- **Criteria** identify the features or conditions relevant to that standard.
- **Evidence and measures** disclose how the subject bears upon the criteria.
- A **judgment** determines what the standard and evidence mean in this case.
- A **decision** determines what action or consequence follows.

Skipping these distinctions encourages metric substitution: what can be
measured easily takes the place of the good that made measurement worthwhile.

## Reality, authority, and judgment

O'Donovan's realist account of practical reason supplies an important test for
standards. Normative direction should be answerable to the goods and realities
upon which action bears; it does not become sound merely because it is
directive, inherited, or accepted. A standard may possess social or legal
authority and still describe its subject badly, privilege a distorted purpose,
or demand an unfitting response.

This exposes three distinguishable questions:

1. **Warrant** — is the standard truthful and fitting to the goods and reality
   it claims to order?
2. **Standing** — who is entitled to issue, recognize, adopt, interpret, assess,
   or enforce it?
3. **Application** — does it apply to this subject and situation, and what does
   responsible conformity require here?

Practical judgment joins all three. A standard disciplines judgment by giving
it a public basis, but does not perform the judgment automatically. Conversely,
discretion is not permission to ignore the standard; a departure needs reasons
answerable to the same or weightier goods.

## Sources and degrees of authority

Standards acquire different kinds of standing:

| Source or adoption | Characteristic force |
| --- | --- |
| **Exemplar or inherited practice** | Recognized through trained judgment and tradition; may remain partly tacit |
| **De facto convention** | Coordinates because a field widely uses it, without formal approval |
| **Consensus standard** | Approved through a recognized process that represents materially affected interests |
| **Organizational standard** | Adopted as the common basis within a defined authority and membership |
| **Contractual standard** | Binding because parties incorporated it into an agreement |
| **Regulatory adoption** | Legally required because a competent authority incorporated or referenced it |

The body that develops a standard need not be the body that adopts, assesses,
certifies, or enforces it. Keeping these authorities distinct prevents a
publisher's reputation from silently implying legal obligation or independent
certification.

Consensus means substantial agreement reached through a credible process, not
unanimity and not proof of truth. It strengthens legitimacy by exposing a
proposal to relevant knowledge and affected interests. The resulting standard
remains open to evidence, appeal, revision, and eventual withdrawal.

## Criteria, evidence, and measurement

A standard becomes assessable by connecting its normative claim to evidence:

| Element | Question |
| --- | --- |
| **Subject or class** | What kind of object, process, person, or claim may be assessed? |
| **Scope and conditions** | Where, when, and under which version does the standard apply? |
| **Requirement or expectation** | What must, should, or may be true? |
| **Criterion** | Which property or condition bears on that expectation? |
| **Evidence** | What observation, record, testimony, demonstration, or result supports judgment? |
| **Measurement or test method** | How is evidence produced and uncertainty handled? |
| **Decision rule** | How does evidence support a conformance level, finding, or other conclusion? |
| **Assessor** | Who is competent and authorized to make or verify the judgment? |

Not every valuable standard can be reduced to numerical metrics or automated
tests. Testability is especially important when a technical specification
permits an objective conformance claim: the subject, prerequisites, required
behavior, normative strength, and relevant terms must be clear enough to
evaluate. Human judgment remains legitimate when the standard names what
competence and evidence it requires rather than disguising discretion as
mechanical measurement.

## Conformance and its limits

**Conformance** is satisfaction of the requirements a standard specifies for
the relevant subject and version. A credible conformance claim identifies:

- the standard and exact version;
- the subject and applicable profile or level;
- which provisions are normative;
- allowed options, extensions, exceptions, or exclusions;
- the evidence and method of assessment;
- the assessor and degree of independence; and
- any limits on what the claim establishes.

Vocabulary varies by standards community. ISO commonly speaks of
**conformity** and conformity assessment; W3C commonly speaks of
**conformance**. Use the governing standard's term. Reserve **compliance** for
contexts in which a law, regulation, contract, or policy makes satisfaction an
obligation; a voluntary standard does not become legally binding merely by
publication.

Conformance is intentionally bounded. A conforming system can still be hard to
use; a conforming process can still pursue a poor end; a conforming
professional can still exercise bad judgment in an untested situation. W3C's
accessibility guidance, for example, distinguishes satisfying testable success
criteria from the wider question of usability.

Standards should make their promise neither weaker nor stronger than their
requirements. When excellence matters beyond conformance, preserve space for
examples, qualitative review, outcomes, and practitioner judgment.

## Related

- [Standard](standard.md)
- [Practice](practice.md)
- [Principle explainer](principle.md) · [Principle guide](../guides/principle.md)
- [Documentation quality](documentation-quality.md)
- [Documentation audits](documentation-audits.md)
