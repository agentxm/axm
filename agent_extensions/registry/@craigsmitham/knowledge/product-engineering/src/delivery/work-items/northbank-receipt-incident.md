---
type: Explanation
title: "Northbank receipts: incident, defect, and corrective change"
description: A fictional receipt-worker failure shows how operational impact, uncertain diagnosis, corrective work, verification, and closure remain connected without collapsing into one record or status.
tags: [northbank, worked-example, incident, defect-report, change, evidence, maintenance, pe-delivery]
status: draft
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Northbank receipts: incident, defect, and corrective change

In [Northbank's episode F](../../northbank-equipment.md#related-episodes-not-one-oversized-project),
receipt jobs persist until completion. Rendering uses committed Billing data
and cannot initiate a charge. Spare workers normally preserve service when
one worker fails. A new workload exhausts capacity across workers and makes
receipt delays an operational concern. The following records and evidence are
invented to illustrate the [work-item taxonomy](software-work-item-taxonomy.md).

The baseline receipt can arrive after the rental transaction; immediate receipt
availability is not required for collection. A contrasting maintenance example
changes that premise explicitly. Do not silently import it into this incident.

## Keep the occurrence and the interpretation separate

| Illustrative time | What is known | What is not established |
| --- | --- | --- |
| 09:05 | Support reports delayed receipts; queue age is rising | Cause, scope of every customer impact, or lost financial records |
| 09:12 | Similar large jobs correlate with growing worker memory; spare capacity is insufficient | A leak or a reliable remaining-lifetime forecast |
| 09:20 | An assigned coordinator records response ownership across booking, depot integration, and platform groups | Permanent correction or authority to change receipt obligations |
| 09:40 | Bounded workload handling and worker replacement restore processing; queued jobs remain recoverable | Removal of the underlying defect |
| Later assessment | Representative replay demonstrates unreleased resources after completed jobs | That every receipt delay has this cause |

The response uses Northbank's declared local incident policy. This example does
not invent a portable severity threshold or prescribe a general response
procedure; the [operations section](../../operations/index.md) owns that craft.

## The linked records have different jobs

| Record | Content that belongs here | Independent next action |
| --- | --- | --- |
| `NB-INC-12` Operational Incident Record | Observed receipt delay, current impact, coordinator and transfers, response chronology, restoration evidence, unresolved effects, follow-up links | The local response authority decides whether response can close on the recovery evidence |
| `NB-DEF-07` Defect Report | Resource-retention observation, affected worker revision/workload, applicable processing expectation, diagnostic artifacts, alternatives, later established deficiency | Decide whether the evidence establishes a defect and which correction or compensation to pursue |
| `NB-CHG-19` Change, classified Bugfix after diagnosis | Bounded resource-management correction, constraints, implementation plan, verification, rollout, relationship to the defect | Implement and assess the accepted correction; record delivery independently of verification |
| `NB-CHG-20` proposed Change | Consider replacing custom worker-lifecycle plumbing, with a capability comparison and retirement condition | Evaluate the proposal; the incident does not authorize a broader replacement |

`NB-INC-12` is related to `NB-DEF-07`; `NB-CHG-19` corrects the established
defect. Do not overwrite the occurrence report with the implementation plan,
or require every maintenance proposal to claim a defect. A concern found before
operational impact could start as a Defect Report without an incident.

## Preserve authority and evidence

The financial replay obligation `NB-RECEIPT-01` belongs to the
[requirement specimen](../../solution/requirements/authoring/northbank-commitment-requirements.md).
The Bugfix references it; a tracker checkbox cannot weaken it. If a proposal
would change when receipts are needed for collection, that is a separate
behavioral decision and impact analysis.

The Defect Report records source, time, worker revision, safe job-shape
description, observations, and competing explanations. Actual customer
documents, credentials, and private payloads are unnecessary for the public
specimen. A measured resource trend, an inference of retention, and a confirmed
diagnostic result remain distinct claims.

Native trackers can represent these records with issue types, labels, and
typed links, or stable IDs and labeled relationships. The portable identity
does not change when an issue moves projects or changes title. A single
`Done` state must not erase whether response ended, correction shipped,
verification passed, or residual work remains.

## Define correction evidence before closing it

For `NB-CHG-19`, the assessment plan covers representative large and ordinary
receipt workloads, interrupted processing, durable replay, and the financial
boundary. A useful result would identify:

- the exact corrected revision and runtime configuration;
- the input/workload and observation interval;
- resource behavior after comparable completed jobs and idle periods;
- recovered job outcomes and evidence that replay caused no new charge;
- remaining unassessed provider or production conditions.

Those are required fields for the example's evidence, not claims that a real
test has passed. A clean build is insufficient. A unit test can examine a
resource-release path; runtime accumulation and job recovery require a world
that preserves those failure mechanisms. [Defining verification](common/defining-verification.md)
and [cross-boundary tests](../../engineering/designing-cross-boundary-and-end-to-end-tests.md)
develop the continuation.

Restoration can end the immediate response while the Defect Report and Change
remain active. Conversely, a merged correction can leave deployment or
production observation incomplete. Each closure records its authority,
evidence, scope, and follow-up.

## Return to maintenance and customer progress

If isolated worker failures remain cheap and service continues, a deliberate
run-to-failure policy may remain appropriate. If repeated accumulation is
understood, scheduled intervention may help; variable workloads may favor
observed headroom, and forecasts need enough warning to act. These alternatives
come from [maintenance strategies](../../foundations/maintenance-strategies.md),
not from the issue's status.

Conflicting response instructions can also motivate a different inquiry. The
engineering manager may want confidence that incidents no longer require
personal intervention; responders need an effective coordination arrangement.
Training, role clarity, staffing, a managed service, and software remain
alternatives. [Jobs to Be Done](../../foundations/jobs-to-be-done.md) examines
that progress without assuming that another dashboard is the answer.
