---
type: Checklist
title: Security quality criteria
description: Use when assessing whether the product preserves authorized protection of information, identity, authority, and operation against relevant threats.
tags: [codebase-review, software-quality, security, authorization, trust, threat, reporting-review]
status: draft
sources:
- id: iso-25010
  resource: https://www.iso.org/standard/78176.html
  title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
- id: dependability
  resource: https://www.landwehr.org/2004-aviz-laprie-randell.pdf
  title: Basic Concepts and Taxonomy of Dependable and Secure Computing
- id: protection
  resource: https://web.mit.edu/Saltzer/www/publications/protection/Basic.html
  title: The Protection of Information in Computer Systems
- id: owasp-asvs
  resource: https://owasp.org/www-project-application-security-verification-standard/
  title: OWASP Application Security Verification Standard
- id: nist-verification
  resource: https://nvlpubs.nist.gov/nistpubs/ir/2021/NIST.IR.8397.pdf
  title: NIST IR 8397 Guidelines on Minimum Standards for Developer Verification of Software
- id: nist-ssdf
  resource: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf
  title: NIST SP 800-218 Secure Software Development Framework
- id: slsa
  resource: https://slsa.dev/spec/v1.2/
  title: SLSA specification 1.2
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Security quality criteria

Use this list to judge whether the product preserves authorized protection of
information, identity, authority, and operation against declared threats.
Threats, protection principles, controls, scans, provenance, and verification
activities can inform the judgment; none is itself the security outcome.
Foundational protection work emphasizes the policy and authorized access being
preserved, not the mere presence of mechanisms.[^protection]

This is a candidate `reporting-review` checklist, not a security certification,
threat-model substitute, or authorization to make a high-consequence decision
without appropriate specialists. Apply the shared assessment states and
evidence rules in [Reviewing a codebase](../reviewing-a-codebase.md). The pillar
definition and neighbor boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion through assets, actors,
authorities, trust domains, threats, environments, and tolerated consequences.
`XC-08` Evidence must qualify every judgment. Unless a criterion says
otherwise, these list-level defaults apply:

| Concern | Default relationship to Security |
| --- | --- |
| `XC-02` Specification | `EN·EV` — supplies protection policy, identity, authority, asset, and failure obligations. |
| `XC-03` Structure | `CTR·TR` — trust boundaries, mediation, isolation, and authority placement can preserve or weaken protection. |
| `XC-04` Lifecycle integrity | `EN·EV·TH` — component identity, construction, provenance, configuration, and release state condition claims. |
| `XC-05` Risk | `TH·CS·TR` — adversaries, misuse, exposure, consequence, and tradeoffs determine required protection. |
| `XC-06` Assurance | `EN·EV` — complementary security verification can support bounded claims. |
| `XC-07` Feedback | `EN·EV·TH` — security-relevant signals can support detection and accountability while creating disclosure risk. |

## Criteria

### SEC-01 — Confidentiality

**Outcome question:** Is protected information disclosed only
to authorized recipients under the declared policy?[^iso-25010][^dependability]

**Why it matters:** unauthorized observation is a distinct loss even when the
information remains accurate and available.

**Applicability:** identify information, actors, purposes, contexts, channels,
and disclosure rules. Lack of a declared classification can make a broad
product verdict `Indeterminate`.

**Boundary:** this criterion owns unauthorized disclosure. Privacy also
governs legitimate collection and use and may require a separate domain
assessment.

### SEC-02 — Integrity

**Outcome question:** Do protected information and product state remain free
from unauthorized modification or destruction?[^iso-25010][^dependability]

**Why it matters:** unauthorized modification or destruction can compromise
product decisions, assets, and trust even when the resulting value appears
plausible.

**Applicability:** identify the protected subject and authority policy.
Ordinary accidental corruption may also support a Correctness or Reliability
finding.

**Boundary:** this criterion owns preservation of protected information and
state. `SEC-04` owns whether a requested sensitive action may take effect;
Correctness owns whether an authorized change is behaviorally right.

### SEC-03 — Authenticity

**Outcome question:** Are security-relevant claims of identity and
origin genuine to the required confidence?[^iso-25010][^owasp-asvs]

**Why it matters:** authorization and trust cannot be sound when an actor,
message, component, or artifact can be impersonated.

**Applicability:** identify the subject, relying party, trust model, and
confidence required. Artifact origin belongs here only when construction is
in product scope.[^slsa]

**Boundary:** this criterion owns genuineness of presented identity or origin.
`SEC-05` owns attribution of actions; Lifecycle integrity owns the engineering
system's provenance capability.

### SEC-04 — Authorization

**Outcome question:** Does every security-sensitive effect remain
within the actor's current granted authority?[^protection][^owasp-asvs]

**Why it matters:** establishing identity does not make every requested
action permissible.

**Applicability:** apply to function, object, field, tenant, workflow,
delegated capability, and administration decisions that exist in the policy.

**Boundary:** this criterion owns prevention of unauthorized effect.
Correctness can judge conformance to an accepted policy; Authenticity owns
whether the identity used in the decision is genuine.

### SEC-05 — Accountability

**Outcome question:** Can each security-relevant action be
attributed to the accountable actor and context with the required
confidence?[^iso-25010][^owasp-asvs]

**Why it matters:** unattributable actions impair investigation, deterrence,
dispute handling, and enforcement.

**Applicability:** identify which actions require attribution and the
justified retention and confidence. This does not require logging every event
or retaining data without limit.

**Boundary:** this criterion owns the product's attributable action outcome.
`XC-07` Feedback supplies signals and `XC-08` Evidence judges their fitness.

### SEC-06 — Nonrepudiation

**Outcome question:** Where dispute resistance is required, can the relevant
origin, receipt, or action be established against later denial within the
declared trust model?[^iso-25010]

**Why it matters:** some exchanges require stronger evidence against later
denial than ordinary operational attribution provides.

**Applicability:** often legitimately `Not applicable`; identify the disputed
act, relying party, adversary, and evidentiary strength before judging it.

**Boundary:** this criterion owns resistance to later denial. Accountability
owns attribution without necessarily satisfying that stronger claim.

### SEC-07 — Isolation

**Outcome question:** Can information, effects, or authority cross a
declared security-domain boundary only through an authorized
relationship?[^protection][^owasp-asvs]

**Why it matters:** shared infrastructure must not erase separation among
tenants, principals, processes, privilege levels, or trust domains.

**Applicability:** apply only where distinct security domains and permitted
crossings are defined.

**Boundary:** this criterion owns unauthorized cross-domain influence.
Reliability containment owns accidental failure propagation; `XC-03`
Structure owns boundary design.

### SEC-08 — Interpretation integrity

**Outcome question:** Can untrusted content acquire
control meaning only where the governing grammar and authority explicitly
permit it?[^owasp-asvs][^nist-verification]

**Why it matters:** injection occurs when data gains unintended command,
query, path, template, configuration, or code semantics.

**Applicability:** apply where untrusted content reaches an interpreter,
parser, renderer, loader, or dynamically selected operation.

**Boundary:** this criterion owns adversarial control of interpretation.
Correctness owns ordinary rejection of invalid values and representation
fidelity.

### SEC-09 — Adversarial availability

**Outcome question:** Under each in-scope malicious
disruption, does authorized access to required service remain within declared
bounds?[^dependability][^owasp-asvs]

**Why it matters:** availability is a security outcome when denial is an
intended attack rather than merely an accidental failure.

**Applicability:** the threat model must identify the attacker capability,
protected service, resource envelope, and tolerated degradation.

**Boundary:** this criterion owns malicious denial. Reliability owns
accidental interruption; Efficiency owns ordinary resource and capacity
limits.

### SEC-10 — Failure closure

**Outcome question:** Does an ambiguous or failed security
decision leave the product without any additional unauthorized authority or
effect?[^protection][^owasp-asvs]

**Why it matters:** control failure must not silently convert uncertainty,
outage, or error into permission.

**Applicability:** apply to authentication, authorization, mediation,
validation, policy, key, and security-service failure paths. The safe state
remains context-specific.

**Boundary:** this criterion owns authorization closure on control failure.
Reliability may favor continued service; Safety may require a different
harm-minimizing state.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
Completion is not certification, and security-critical or regulated contexts
can require domain standards, threat analysis, independent assurance, and
specialist authority beyond this portable list.[^nist-ssdf]

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^dependability]: Avizienis, Laprie, Randell, and Landwehr, [Basic Concepts and Taxonomy of Dependable and Secure Computing](https://www.landwehr.org/2004-aviz-laprie-randell.pdf).
[^protection]: Saltzer and Schroeder, [The Protection of Information in Computer Systems](https://web.mit.edu/Saltzer/www/publications/protection/Basic.html).
[^owasp-asvs]: OWASP, [Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/).
[^nist-verification]: NIST, [IR 8397 Guidelines on Minimum Standards for Developer Verification of Software](https://nvlpubs.nist.gov/nistpubs/ir/2021/NIST.IR.8397.pdf).
[^nist-ssdf]: NIST, [SP 800-218 Secure Software Development Framework](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf).
[^slsa]: SLSA, [Specification 1.2](https://slsa.dev/spec/v1.2/).
