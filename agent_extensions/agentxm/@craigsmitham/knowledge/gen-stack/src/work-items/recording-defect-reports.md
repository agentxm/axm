---
type: Guide
title: Recording defect reports
description: Use when an observation may violate an accepted expectation and needs a safe, traceable record; preserve the discrepancy and evidence at intake, then maintain decisions and verification without inventing diagnosis or priority.
tags: [defect-report, bug-report, anomaly, expected-behavior, actual-behavior, reproduction, static-analysis, environment, provenance, severity, verification, issue-template]
status: draft
sources:
  - id: defect-explainer
    resource: failures-defects-and-defect-reports.md
    title: Failures, defects, and defect reports
  - id: requirement-change-guide
    resource: specifying-requirement-changes.md
    title: Specifying Requirement changes
  - id: istqb-foundation
    resource: https://www.istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf
    title: ISTQB Certified Tester Foundation Level Syllabus v4.0.1
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO — ISO/IEC/IEEE 29148:2018 Requirements engineering
  - id: bettenburg-good-reports
    resource: https://www.st.cs.uni-saarland.de/publications/details/bettenburg-tr-2008/
    title: Bettenburg et al. — What Makes a Good Bug Report?
  - id: soltani-report-elements
    resource: https://link.springer.com/article/10.1007/s10664-020-09882-z
    title: Soltani, Hermans, and Bäck — The significance of bug report elements
  - id: breu-information-needs
    resource: https://thomas-zimmermann.com/publications/files/breu-cscw-2010.pdf
    title: Breu et al. — Information Needs in Bug Reports
  - id: mozilla-bug-writing
    resource: https://bugzilla.mozilla.org/page.cgi?id=bug-writing.html
    title: Mozilla — Bug Writing Guidelines
  - id: azure-bug
    resource: https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/manage-bugs
    title: Microsoft Azure Boards — Define, capture, triage, and manage bugs
  - id: github-private-vulnerability
    resource: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately
    title: GitHub Docs — Privately reporting a security vulnerability
  - id: agent-bug-reports
    resource: https://arxiv.org/abs/2607.07593
    title: Khatib et al. — What Makes a Good Bug Report for an AI Agent?
generated:
  by: codex/gpt-5
  at: 2026-08-27T21:55:00Z
---

# Recording defect reports

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when an observation, review, analysis, or test indicates that a
software work product may violate an accepted expectation. Record the
discrepancy without requiring the reporter to prove or locate the defect.

For why a report can begin before diagnosis and how its lifecycle differs from
a failure, fix, or incident, read
[Failures, defects, and defect reports](failures-defects-and-defect-reports.md).

## Goal

Another person can recover what was observed and expected, judge the impact,
reproduce or investigate the discrepancy under relevant conditions, and
follow later decisions and verification without first interviewing the
reporter or mistaking a hypothesis for a confirmed cause.

## Representation

Use exact native tracker fields for identity, type, workflow state, severity or
priority, assignment, and relationships when their semantics match. Present
residual body content in this preferred order: summary, originating source,
expected and observed behavior, conditions and evidence, impact and workaround,
cross-stack gaps, then investigation, decisions, resolution, and verification
only as evidence matures. The [compact body
fallback](#compact-body-fallback) is optional; omit inapplicable sections and
never repeat native field values as body metadata.

## Shared concerns

This guide owns the discrepancy, expectation, evidence path, impact, and
Defect Report maturity. Apply the [common work-item
guides](index.md#apply-the-common-concerns) for evidence and authority,
identity and lifecycle, tracker metadata, and the derived brief.

## Guardrails

- **Observation is not diagnosis.** Keep facts, measurements, inferences, and
  hypotheses distinguishable; do not require or imply a confirmed cause.
- **Unknown is better than invented.** Do not manufacture evidence,
  expectations, reproduction steps, severity, priority, or authority.
- **Evidence must be safe.** Keep credentials, personal information, private
  customer content, confidential commercial data, restricted links, and
  exploitable security details out of public reports.
- **The report preserves the case.** Keep it as the provenance-bearing record;
  link a later Change, established Defect, incident, or Requirement correction
  rather than retitling the report as corrective work.

## Create the minimum report

### 1. Choose the record and channel

Ask what needs to be preserved:

- If current or imminent service impact meets the local response threshold,
  create an [operational incident record](recording-operational-incidents.md)
  and link any defect report that follows.
- If no accepted expectation exists and a bounded system or Architecture
  change is being proposed, write a [Change
  Specification](writing-change-specifications.md). Retain an unbounded
  request as a Signal or source record.
- If only uncertainty reduction has been authorized, apply [Investigating
  possible defects](investigating-possible-defects.md) within the current
  Defect Report or other least-durable adequate surface.
- If a security vulnerability may be present, follow the organization's
  private vulnerability-disclosure process instead of publishing exploit
  details in an ordinary issue.[^github-private-vulnerability]
- Otherwise, continue with a defect report.

Apply the shared identity guide to decide whether the observation belongs on an
existing report. Preserve a new occurrence independently until a duplicate or
merge decision is supported; never let consolidation erase its provenance.

For public reports, use a safe synopsis and an approved controlled evidence
location when the underlying material cannot be shared.

### 2. Establish the discrepancy

Apply the shared evidence guide and record only source details the host does
not already preserve reliably:

- observation or discovery time and activity;
- stable source or occurrence identifier and controlled-access URL;
- relevant project or environment and safe correlation identifiers;
- reporter or issuing role when relevant; and
- whether consequential statements were observed, reported, measured,
  inferred, or hypothesized.

Keep each material occurrence individually traceable. Mark an important
applicable source or field unavailable when it cannot be recovered; omit
inapplicable source-specific fields instead of filling the report with `not
applicable`. Typical defect-report contents include the date, author or
issuing organization, test object, environment, context, status, and related
references.[^istqb-foundation]

State the expected result and its basis: a Requirement, acceptance criterion,
specification, contract, domain rule, quality threshold, invariant, test
oracle, or previously accepted behavior. Then state the smallest observable
difference separately. For a quality defect, include known measures,
conditions, and thresholds.

If the expectation is disputed, incomplete, or inferred, say so. Requirement
qualities such as clarity, completeness, consistency, feasibility, and
verifiability are diagnostic prompts, not intake gates.[^iso-29148] Preserve a
defective or indeterminate basis and link its correction rather than silently
repairing it in the report.

### 3. Surface material cross-stack gaps

Assess whether the observation exposes missing, underdeveloped, misplaced,
disputed, or contradicted Requirements, Surfaces, C4 structure, or evaluation
meaning. Use [Analyzing Requirement
impact](../control-loop/analyzing-requirement-impact.md) and, when needed, the
shared [candidate Architecture and Requirements
guide](../architecture/developing-candidate-architecture-and-requirements.md).

Raise each material gap with its evidence, impact, candidate options or
correction, recommendation, applicable authority, and blocking status. A gap
does not need to block report creation: the report can preserve an inferred or
indeterminate expectation while identifying the decision or evidence needed.
Do not silently invent the missing Requirement or Architecture, and do not
classify missing documentation itself as a Defect without an applicable
expectation or intended use.

Stop the Defect Report at impact analysis. If the evidence supports an actual
candidate Requirement addition, revision, retirement, replacement, split, or
merge, link a separately authorized Change whose Change Specification applies
[Specifying Requirement changes](specifying-requirement-changes.md). Do not
turn the provenance-bearing report into the change entry.

### 4. Make the evidence actionable

Choose the evidence path that matches discovery:

- **Dynamic failure or occurrence:** record the starting state, preconditions,
  relevant data, actions or event sequence, observation point, actual result,
  and known frequency or intermittency.
- **Static finding:** record the work product and revision, precise location,
  applicable rule or expectation, observed content or structure, and the
  review, inspection, analysis, or tool evidence.

Do not manufacture runtime reproduction for a static finding. When a dynamic
observation is not yet reproducible, preserve available timestamps,
correlation identifiers, affected records, logs, screenshots, recordings,
crash information, or a minimal example. Reproduction steps, tests, stack
traces, and crash descriptions are useful when available, but their absence
does not erase a valuable occurrence.[^bettenburg-good-reports][^soltani-report-elements]

Add only conditions that can change interpretation: version or revision,
platform or environment, dependencies, configuration, permissions, locale,
workload, timing, and data shape. Include known affected and tested unaffected
conditions. If a change introduced the behavior, record the narrowest known
regression window without guessing.[^mozilla-bug-writing]

Attach or link the smallest useful, safely redacted evidence. Prefer a stable
controlled-access source link over copying sensitive or unrelated raw data.

### 5. Describe impact and workaround

State who or what is affected, how often, and to what known extent. Record any
workaround or mitigation and its limitations; reduced impact does not remove
the underlying discrepancy.

Use impact evidence to support a local severity decision. The shared metadata
guide owns the separation and authorized mutation of severity, priority,
assignment, and delivery timing.

### 6. Derive the title and summary

After the body is accurate, title the report with the affected behavior or
artifact, observed result, and discriminating condition:

> Invoice export omits zero-value lines when tax details are included

For a static finding:

> Retry policy permits unbounded attempts when the upstream timeout is absent

Avoid vague titles, presumed causes, code locations without behavior, and
preferred fixes. Add a one- or two-sentence summary of the discrepancy,
impact, and material uncertainty. Do not repeat the artifact type when the
tracker already shows it. See
[Titling and summarizing work items](titling-and-summarizing-work-items.md).

## Compact body fallback

Use this only for facts the tracker cannot represent. Add investigation and
lifecycle content only when evidence or a decision supports it; add the shared
completion fallback only when native fields cannot carry it.

```markdown
# <Affected behavior or artifact> <actual result> when <condition>

## Summary

What differs from the expectation, why it matters, and any material uncertainty.

## Discrepancy and evidence

- Source occurrences and safe links:
- Expected behavior and authority or uncertainty:
- Observed behavior or static finding:
- Relevant conditions, revision, and affected or tested-unaffected scope:
- Reproduction or analysis evidence and limitations:
- Impact, workaround, and material cross-stack gaps:

## Maturing record

- Findings, hypotheses, identified Bugs, and confidence:
- Disposition, authority, rationale, and relationships:
- Verification conditions, strategy, result, and evidence when applicable:
- Residual risk, review or reopening trigger, and closure reason:
```

## Enrich when evidence supports it

Do not delay intake for optional completeness. Add these when they materially
improve investigation or decision-making:

- a minimal reproducer, runnable command, failing test, exact repository
  revision, and required environment;
- stable headings and fenced logs or code with the expected assertion;
- relevant paths or symbols, labeled as evidence or hypotheses rather than
  confirmed fault locations;
- finer affected and unaffected scope or a regression window; and
- attempted diagnostics, eliminated conditions, findings, confidence, and
  attributed proposals or technical context.

Executable reproduction, repository context, expected behavior, and preserved
document structure can help authorized repair agents; report length alone does
not.[^agent-bug-reports] Treat executable evidence as enrichment, not a
universal intake gate.

If investigation contains proposals, constraints, code or architecture
sketches, tradeoffs, or open questions, preserve an attributed synopsis or
link their authoritative home. See
[Preserving technical context in software work items](preserving-technical-context.md).
When investigation establishes a Defect and remediation is authorized, create
and link a separate [Change classified as
Bugfix](addressing-defects-through-changes.md).

## Maintain the report through its lifecycle

Apply the shared identity and lifecycle guide. Append evidence and preserve
earlier authority states rather than rewriting history. Defect reports support
continuing questions between reporters and investigators; record new answers
with their source and time.[^breu-information-needs]

Maintain, as applicable:

- current status, classification, decision, authority, and rationale;
- relationships to occurrences, duplicates, incidents, Requirements, tests,
  established Defects, Changes classified as Bugfix, regressions, and other corrective work;
- selected resolution and the version or build containing a correction;
- verification conditions, testing strategy, result, evidence, verifier, and
  time; and
- residual risk, workaround, reopening condition, and closure reason.

The shared lifecycle guide owns the general distinction among resolution,
verification conditions, strategy, result, and closure. For a Defect report,
keep these specialized records visible:

| State | What it records |
| --- | --- |
| Resolution | The selected disposition or correction |
| Verification conditions | The observable evidence that must hold |
| Testing strategy | How that evidence will be gathered |
| Verification result | What the gathered evidence established |

A proposed implementation is not a verification condition unless the
mechanism is itself an authoritative constraint. A merge is not verification.
Host workflows may distinguish resolved work from verified close and retain
specific closure reasons.[^azure-bug]

Follow the host's rule for reopening or filing a linked regression. Preserve
the relationship and new evidence either way.

## Completion criteria

### Complete for the next authorized action

The originating occurrences, expectation or uncertainty, observable
discrepancy, relevant conditions, safe evidence, impact, current
classification, and next route are recoverable enough for triage,
investigation, or an authorized disposition.

### Complete for verified closure

An authorized disposition, rationale, evidence boundary, residual risk, and
review or reopening trigger are recorded. When the disposition claims a
correction, the verification result is bound to the identified revision and
conditions. Source occurrences and linked Changes remain preserved.

### Does not require

A Defect Report may close as expected behavior, duplicate, external cause,
accepted risk, deferred, or unsupported within the bounded evidence. It does
not universally require reproduction, root cause, an established Defect,
implementation, or remediation verification.

## Authoring check

- Can another person recover the observation, expectation, and material source
  evidence?
- Is the discrepancy clear without asserting an unconfirmed cause or invented
  authority?
- Are material cross-stack gaps visible with evidence, impact, a recommendation,
  authority, and blocking status rather than silently repaired?
- Can another person judge impact and reproduce or investigate it under the
  relevant conditions without first interviewing the reporter?
- Are unknowns, hypotheses, authority, and sensitive evidence handled
  honestly and safely?
- Can later classification, resolution, relationships, verification, closure,
  or reopening be followed without rewriting the original case?

[^agent-bug-reports]: Khatib et al., “What Makes a Good Bug Report for an AI Agent?”, arXiv preprint, 2026.
[^azure-bug]: Microsoft Azure Boards, “Define, capture, triage, and manage bugs.”
[^bettenburg-good-reports]: Bettenburg et al., “What Makes a Good Bug Report?”, 2008.
[^breu-information-needs]: Breu et al., “Information Needs in Bug Reports,” 2010.
[^github-private-vulnerability]: GitHub Docs, “Privately reporting a security vulnerability.”
[^iso-29148]: ISO/IEC/IEEE 29148:2018, requirements-engineering processes and requirements information items.
[^istqb-foundation]: ISTQB Certified Tester Foundation Level Syllabus v4.0.1, defect-management workflow and typical defect-report contents.
[^mozilla-bug-writing]: Mozilla, “Bug Writing Guidelines.”
[^soltani-report-elements]: Soltani, Hermans, and Bäck, “The significance of bug report elements,” 2020.
