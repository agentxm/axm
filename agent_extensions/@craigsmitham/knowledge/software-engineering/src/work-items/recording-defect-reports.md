---
type: Guide
title: Recording defect reports
description: How to capture a suspected discrepancy safely, preserve its source and expectation, provide proportional static or dynamic evidence, and maintain classification, resolution, relationships, and verification without inventing diagnosis or priority.
tags:
  [
    defect-report,
    bug-report,
    anomaly,
    expected-behavior,
    actual-behavior,
    reproduction,
    static-analysis,
    environment,
    provenance,
    severity,
    verification,
    issue-template,
  ]
status: draft
sources:
  - id: defect-explainer
    resource: failures-defects-and-defect-reports.md
    title: Failures, defects, and defect reports
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
  at: 2026-08-24T17:13:27Z
---

# Recording defect reports

Use this guide when an observation, review, analysis, or test indicates that a
software work product may violate an accepted expectation. The result is a
safe, traceable record that can support triage, investigation, resolution, and
verification without requiring the reporter to prove or locate the defect.

For why a report can begin before diagnosis and how its lifecycle differs from
a failure, fix, or incident, read
[Failures, defects, and defect reports](failures-defects-and-defect-reports.md).

## Goal

Another person can recover what was observed and expected, judge the impact,
reproduce or investigate the discrepancy under relevant conditions, and
follow later decisions and verification without first interviewing the
reporter or mistaking a hypothesis for a confirmed cause.

## 1. Choose the correct artifact and safe channel

Ask what needs to be preserved:

- If current or imminent service impact meets the local response threshold,
  create an [operational incident record](recording-operational-incidents.md)
  and link any defect report that follows.
- If no accepted expectation exists and the request is for new or changed
  behavior, record a [feature request](recording-feature-requests.md).
- If only uncertainty reduction has been authorized, create an investigation.
- If a security vulnerability may be present, follow the organization's
  private vulnerability-disclosure process instead of publishing exploit
  details in an ordinary issue.[^github-private-vulnerability]
- Otherwise, continue with a defect report.

For any public report, do not include credentials, personal information,
private customer content, confidential commercial data, exploitable security
details, or restricted links. Use a safe synopsis and an access-controlled
evidence location when the underlying material cannot be public.

## 2. Decide whether this is an occurrence or the canonical report

Search for an existing report that describes the same discrepancy. A new
observation may add evidence to one canonical defect report rather than create
another independent diagnosis.

Create a separate report when the evidence represents a distinct discrepancy,
cause, work product, or independently managed lifecycle. Link duplicates,
related occurrences, regressions, and incidents rather than discarding their
source evidence. If uncertain, preserve the new observation for triage instead
of asserting that two reports are identical.

## 3. Preserve source and provenance

Record what the host does not already preserve reliably:

- source system or type and observation or discovery time;
- stable source or occurrence identifier and controlled-access URL;
- reporter or issuing role when relevant;
- discovery activity, such as production use, support, monitoring, dynamic
  test, static analysis, inspection, or review;
- authoritative source or occurrence link; and
- whether each important statement was observed, reported, measured,
  inferred, or hypothesized.

Keep each material occurrence individually traceable when several observations
support one defect report. For monitoring-sourced defects, retain the canonical
occurrence identifier and link, relevant project and environment, and only the
safe correlation identifiers that materially help retrieval. If an important
field or source that applies to the defect cannot be recovered, mark it
unavailable rather than inventing or silently omitting it. Omit fields that do
not apply to the source type instead of adding source-specific "not
applicable" placeholders.

ISTQB's typical defect-report contents include the observation date, author or
issuing organization, test object, environment, context, status, and related
references.[^istqb-foundation] Do not duplicate an identifier, author, date, or
initial status that the tracker already captures correctly.

## 4. Establish the expectation and its basis

State what should hold and identify its authority when available: a
requirement, acceptance criterion, specification, documented contract, domain
rule, quality threshold, invariant, test oracle, or previously accepted
behavior.

If the expectation is disputed, incomplete, or inferred from historical
behavior, say so. An investigation may reveal that the requirement, test,
documentation, or expectation is defective rather than the executing product.
Do not turn an unapproved preference into an authoritative expectation.

Use requirement qualities such as clarity, completeness, consistency,
feasibility, and verifiability as diagnostic prompts, not a mandatory intake
checklist.[^iso-29148] If the cited requirement cannot support a determinate
expected result, preserve that finding and link the appropriate requirement
correction; do not repair the authority silently inside the defect report.

## 5. Title and summarize the discrepancy

Use the affected behavior or artifact, observed result, and discriminating
condition:

> Invoice export omits zero-value lines when tax details are included

For a static finding:

> Retry policy permits unbounded attempts when the upstream timeout is absent

Avoid “Export is broken,” only a presumed code location, or the reporter's
preferred fix. Add a one- or two-sentence summary stating the discrepancy and
why it matters; see
[Titling and summarizing work items](titling-and-summarizing-work-items.md).

## 6. Keep actual and expected results separate

Describe the smallest observable difference between what happened or exists
and what should happen or exist. Separate the two so reviewers can challenge
the evidence and expectation independently.

For a quality defect, include the applicable measure, conditions, and threshold
when they are known—for example, the workload and observation period for a
latency requirement. Do not invent a numeric threshold to make the report look
complete.

## 7. Supply evidence for the discovery path

Choose the branch that fits the source evidence.

### Dynamic failure or occurrence

Give the shortest reliable route to the observation:

1. starting state, preconditions, and relevant data;
2. actions or event sequence;
3. exact observation point and actual result; and
4. frequency, intermittency, or number of observed occurrences.

When deterministic reproduction is unavailable, preserve timestamps,
correlation identifiers, affected records, logs, screenshots, recordings,
crash information, or a minimal example. `Not yet reproducible` is a state of
knowledge, not proof that no defect exists.

### Static finding

Record:

1. the work product, revision, and precise location;
2. the applicable rule, requirement, invariant, or expectation;
3. the observed content or structure; and
4. the review, inspection, analysis, or tool evidence that exposed it.

Do not manufacture runtime reproduction steps for a defect discovered without
execution.

Reproduction steps, test cases, stack traces, and crash descriptions are among
the report elements developers repeatedly identify as useful, but reporters
cannot always supply them.[^bettenburg-good-reports][^soltani-report-elements]
Ask for evidence proportionately instead of rejecting a valuable occurrence
because one preferred artifact is absent.

## 8. Bound affected and unaffected context

Record only context that can change interpretation:

- version, build, revision, or earliest known affected version;
- platform, environment, deployment region, dependency, or integration;
- configuration, permissions, locale, workload, timing, or data shape;
- conditions known to exhibit the discrepancy; and
- comparable conditions tested without the discrepancy.

When a change recently introduced the behavior, record the narrowest known
regression window without guessing. Precise affected and unaffected builds can
distinguish similar symptoms and help localize regressions.[^mozilla-bug-writing]

## 9. Describe impact and any workaround

State who or what is affected, how, how often, and to what known extent.
Preserve a workaround or mitigation and its limitations when one exists. A
workaround changes current impact; it does not remove the underlying defect.

Use impact evidence to support the local severity decision. Assign severity,
priority, ownership, or delivery timing only when the author has that authority
or is faithfully preserving an existing decision. Severity describes impact;
priority expresses a scheduling or attention decision.

## 10. Make evidence safe and usable

Attach or link the smallest useful evidence. Redact secrets, personal data,
private customer content, and unrelated records before sharing. Preserve raw
restricted evidence only in an approved controlled location.

Prefer a stable controlled-access source link over copying raw logs, request
bodies, event content, or other evidence whose sensitivity and relevance are
harder to preserve safely.

When a person or authorized coding agent can execute the evidence, prefer:

- a minimal reproducer, runnable command, or failing test;
- the exact repository revision and required environment;
- stable section headings and fenced logs or code;
- the expected assertion or observable result; and
- relevant paths or symbols, labeled as supplied evidence or hypotheses rather
  than confirmed fault locations.

Early research on repair agents associates executable reproduction,
repository and localization context, expected behavior, and preserved document
structure with better outcomes, while longer reports alone do not help.
Treat this as optional enrichment rather than a universal intake gate.
[^agent-bug-reports]

## 11. Separate facts, hypotheses, findings, and proposals

Label suspected causes, attempted diagnostics, eliminated conditions, and
investigation findings. Record who or what established each consequential
claim and its current confidence or authority.

Do not rewrite the title or actual result around an unconfirmed theory. When
investigation already contains constraints, decisions or proposals,
architecture or code sketches, an implementation sequence, a testing strategy,
tradeoffs, or open questions, preserve that material or link its authoritative
home. See
[Preserving design and delivery context in software work items](preserving-design-and-delivery-context.md).

## 12. Define verification conditions

State the observable evidence that would show the chosen resolution addresses
the discrepancy. Include the original failing or static case and material
adjacent, negative, or regression cases.

Keep three things distinct:

- the **resolution** states which disposition or correction was chosen;
- **verification conditions** state what observable evidence must hold; and
- a **testing strategy** states how that evidence will be gathered across test
  layers, boundaries, fixtures, environments, and negative cases.

Do not make one proposed implementation the verification condition unless the
mechanism is itself an authoritative constraint.

## 13. Preserve lifecycle decisions and verification results

Update the report as triage and investigation progress. Preserve:

- current status and classification;
- the decision, decision authority, and rationale;
- duplicate, occurrence, incident, requirement, test, change, and regression
  relationships;
- the selected resolution and any linked correction or delivery item;
- the version or build containing the correction when known;
- the verification result, evidence, and verifier; and
- residual risk, workaround, reopening condition, or closure reason.

Resolution is not verification, and verification is not merely “code merged.”
Azure's default processes, for example, distinguish resolved work from a
verified close and retain process-specific closure reasons.[^azure-bug]

Follow the host's rule for reopening or filing a new linked regression. Do not
silently rewrite the original occurrence as though its later diagnosis and
resolution had been known at intake. Defect reports also support continuing
questions between reporters and investigators, so preserve new answers and
evidence rather than treating the original form as a one-shot handoff.
[^breu-information-needs]

## Tracker-ready template

Use the minimum intake first. Add conditional enrichment and lifecycle fields
only when the source material, local workflow, or later investigation supports
them. Omit empty sections rather than inventing content.

```markdown
# <Affected behavior or artifact> <actual result> when <condition>

## Minimum intake

### Summary

One or two sentences: what differs from the expectation and why it matters.

### Source and provenance

- Observed or discovered:
- Source system or discovery activity:
- Stable source or occurrence identifier and URL:
- Relevant project or environment:
- Safe correlation identifiers, when materially useful:
- Reporter or issuing role:
- Authoritative occurrence or evidence link:

### Expectation and basis

What should happen or exist? Link its authority, or state why it is uncertain.

### Actual observation or finding

What happened or exists instead?

### Dynamic occurrence or reproduction

Use for executed behavior:

1. Starting state and preconditions:
2. Actions or event sequence:
3. Observation point and result:
4. Frequency or occurrences:

### Static finding

Use for review, inspection, or analysis:

- Work product, revision, and location:
- Applicable rule or expectation:
- Observed content or structure:
- Review or analysis evidence:

### Relevant context

- Version, build, or revision:
- Environment, configuration, and dependencies:
- Relevant data, workload, timing, or permissions:

### Impact

Who or what is affected, how, and to what known extent?

### Safe evidence

Redacted logs, screenshots, recordings, stack traces, minimal examples,
correlation identifiers, or controlled evidence links.

## Conditional enrichment

### Affected and unaffected scope

Known affected conditions, tested unaffected conditions, and regression window.

### Workaround or mitigation

What reduces impact now, and what limitations or residual risk remain?

### Evidence and investigation

Facts, hypotheses, confidence, eliminated conditions, findings, runnable
reproducer or failing test, and relevant paths or symbols.

### Technical design and delivery context

Existing constraints, decision or proposal state, architecture or code
sketches, implementation sequence, tradeoffs, and open questions. Link longer
or independently governed artifacts.

### Verification conditions

What observable evidence would show the selected resolution addresses the discrepancy?

### Testing strategy

Optional supplied plan for gathering that evidence, kept distinct from the
behavioral conditions above.

## Lifecycle

### Status, classification, and decision

- Current status:
- Classification:
- Decision and authority:
- Rationale:

### Relationships

- Occurrences and duplicates:
- Incidents, requirements, and tests:
- Correction or delivery work:
- Regressions and related defects:

### Resolution and verification

- Resolution or disposition:
- Corrected in version or build:
- Verification result and evidence:
- Verified by and at:
- Residual risk or reopening condition:
- Closure reason:
```

## Final check

- The artifact uses the correct public, private, or incident-response channel.
- The report is visibly an occurrence, canonical defect report, duplicate, or
  related regression; source evidence remains traceable.
- For a monitoring-sourced defect, each material occurrence's canonical
  identifier and link are present, or their unavailability is explicit.
- The title and summary say what differs and why it matters without asserting
  an unconfirmed cause.
- The expectation has a stated basis or visible uncertainty.
- Actual observation remains separate from expected behavior.
- Dynamic and static evidence use the appropriate branch; absent reproduction
  was not invented.
- Affected and unaffected context is proportional to what can change the
  interpretation.
- Impact supports any supplied severity; severity, priority, ownership, and
  delivery timing were not invented.
- Public content contains no credentials, personal data, private customer
  material, restricted evidence, or exploitable vulnerability details.
- Facts, hypotheses, findings, and proposals remain distinguishable.
- Existing technical context is preserved or linked with its authority state.
- Resolution, verification conditions, testing strategy, and verification
  result remain distinct.
- Triage decisions, relationships, closure rationale, and conditions for
  revisiting the report remain recoverable.

[^agent-bug-reports]: Khatib et al., “What Makes a Good Bug Report for an AI Agent?”, arXiv preprint, 2026.

[^azure-bug]: Microsoft Azure Boards, “Define, capture, triage, and manage bugs.”

[^bettenburg-good-reports]: Bettenburg et al., “What Makes a Good Bug Report?”, 2008.

[^breu-information-needs]: Breu et al., “Information Needs in Bug Reports,” 2010.

[^github-private-vulnerability]: GitHub Docs, “Privately reporting a security vulnerability.”

[^iso-29148]: ISO/IEC/IEEE 29148:2018, requirements-engineering processes and requirements information items.

[^istqb-foundation]: ISTQB Certified Tester Foundation Level Syllabus v4.0.1, defect-management workflow and typical defect-report contents.

[^mozilla-bug-writing]: Mozilla, “Bug Writing Guidelines.”

[^soltani-report-elements]: Soltani, Hermans, and Bäck, “The significance of bug report elements,” 2020.
