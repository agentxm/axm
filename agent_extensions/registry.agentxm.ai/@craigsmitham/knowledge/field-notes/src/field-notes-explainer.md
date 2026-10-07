---
type: Explanation
title: Field notes
description: How field notes preserve one occurrence of agent-session friction with observed facts, cost or impact, outcome, and safe evidence without adding analysis.
tags: [field-notes, observation, continuous-improvement, resilience-engineering, explanation]
status: draft
sources:
  - id: hollnagel-safety-ii
    resource: https://www.england.nhs.uk/signuptosafety/wp-content/uploads/sites/16/2015/10/safety-1-safety-2-whte-papr.pdf
    title: Erik Hollnagel — From Safety-I to Safety-II (white paper)
  - id: flanagan-cit
    resource: https://www.apa.org/pubs/databases/psycinfo/cit-article.pdf
    title: J.C. Flanagan — The Critical Incident Technique (Psychological Bulletin, 1954)
  - id: esm-survey
    resource: https://dl.acm.org/doi/10.1145/3123988
    title: The Experience Sampling Method on Mobile Devices (ACM Computing Surveys)
  - id: who-minimal-information
    resource: https://qualityhealthservices.who.int/quality-toolkit/qt-catalog-item/minimal-information-model-for-patient-safety-incident-reporting-and-learning-systems-user-guide
    title: WHO — Minimal Information Model for Patient Safety Incident Reporting and Learning Systems
generated:
  by: codex/gpt-5
  at: 2026-09-21T16:30:00Z
---

# Field notes

A **field note** is a record of one specific occurrence of friction, written
while the agent session that encountered it is still active.

## Preserve work as it happened

Instructions, documentation, and runbooks describe work as imagined. Actual
work meets conditions they did not anticipate.[^hollnagel-safety-ii] A command
fails unexpectedly, guidance conflicts, a capability is missing, or progress
requires an undocumented workaround. This evidence is cheap at the moment it
appears and difficult to reconstruct later.

Successful adaptations matter too. A workaround that restored progress records
friction the system still imposed, even when the overall task succeeded.

## Incidents, not impressions

Field notes describe specific observed incidents with behavioral detail rather
than general opinions.[^flanagan-cit] “The CLI is confusing” is an impression.
“The command exited successfully without creating the named file, so the agent
read the help and repeated the step with another flag” is an occurrence.

A small common structure makes records comparable while retaining the account
of what happened.[^who-minimal-information] A note records:

- the task context and relevant conditions already known;
- the friction encountered;
- observed cost or impact;
- the outcome and any recovery already performed; and
- the minimum safe evidence already available.

No predefined subject or classification is required. A free-text area helps
later readers orient themselves without asking the capturing agent to develop a
taxonomy.

## Record observed cost or impact

Useful cost evidence includes retries, extra tool calls, repeated reads, manual
steps, delay, compute, user intervention, rework, degraded output, blocked or
incomplete work, and remaining uncertainty. Include only dimensions that
actually changed and measurements already available. Distinguish overhead
caused by the friction from work the task inherently required.

Impact is evidence about the occurrence, not a severity score. Do not estimate
unmeasured cost, project future harm, or infer how often the friction occurs.

## Capture in the session

Recording at the moment of occurrence preserves details that retrospective
accounts lose or reshape.[^esm-survey] An agent session also has a hard memory
boundary: information not written during the session may disappear completely.

Capture must therefore remain cheap. Write one concise file after the immediate
outcome is known, combine its retries and recovery, and continue the original
task. Routine work, expected diagnostic failures, isolated typing mistakes, and
speculative concerns do not qualify.

## Use only what is already known

Capture is evidence preservation, not analysis. Do not investigate, interpret,
diagnose, call another tool, rerun an operation, or develop recommendations to
enrich a note. Missing information stays missing.

Sometimes the task has already established a related constraint, explanation,
occurrence, or possible remedy. The note may retain that as optional existing
context if it preserves the uncertainty already present. It must not generate a
hypothesis or recommendation to fill the section.

Structured results may already expose useful evidence such as an error class,
response status, file reference, version, or recovery command. Preserve only
the minimum safe portion needed to understand or verify the occurrence. Never
record credentials, authorization material, opaque response bodies, or
unreviewed values that may contain sensitive data.

Recording a note does not authorize remediation, broader investigation,
external communication, or any other new side effect.

[^hollnagel-safety-ii]: Hollnagel, *From Safety-I to Safety-II*.
[^flanagan-cit]: Flanagan, *The Critical Incident Technique*, 1954.
[^esm-survey]: *The Experience Sampling Method on Mobile Devices*.
[^who-minimal-information]: WHO, *Minimal Information Model for Patient Safety Incident Reporting and Learning Systems*.
