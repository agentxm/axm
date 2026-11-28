---
type: Explanation
title: Defects and Defect Reports
description: Why a reported symptom, an established defect, a delivered correction, and a closed report can each have a different evidence basis.
tags: [defect, defect-report, bug, failure, observation, expectation, diagnosis, correction, verification, software-testing]
generated: { by: codex/gpt-6, at: 2026-11-22T01:50:43Z }
sources:
- id: prior-recording-defect-reports
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/defects/recording-defect-reports.md
  title: Recording Defect Reports
- id: prior-triaging-defect-reports
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/defects/triaging-defect-reports.md
  title: Triaging Defect Reports
- id: prior-linking-defects-to-corrective-changes
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/defects/linking-defects-to-corrective-changes.md
  title: Linking Defects to corrective Changes
---

# Defects and Defect Reports

Suppose two customers report that they received the same receipt twice.
A tester can record both observations immediately. Did the mailer send
two messages, did the account contain two addresses leading to the same
inbox, or did the system charge the customer twice? A Defect Report keeps
the evidence available while those explanations are still open.

An **observation** records something perceived under stated conditions. A
**failure** is an observed inability to perform as required or intended. A
**Defect** is a deficiency in a system or work product relative to an
applicable expectation or intended use. The **Defect Report** is the work
item that carries the evidence and its disposition. A static finding may
establish a Defect without a witnessed runtime failure. One failure may
result from several Defects, and one Defect may produce several
occurrences.[^prior-recording-defect-reports]

## When the symptom becomes a discrepancy

In the first report, suppose the documented promise is one receipt per
order for each delivery address. The order records one address, and the
outgoing mail log shows two messages to that address for the same order.
There is now evidence of a discrepancy. Nothing in those records shows
how many times the customer's account was charged.

The second report came from an account configured with two addresses.
One receipt went to each. Those facts fit the documented rule, even
though the forwarded receipts looked identical to the customer. A tester
who merged the reports on the strength of their titles would lose the
distinction that explains the different outcomes.

Triage records which expectation applies, the version, configuration,
inputs and impact, what evidence supports the discrepancy, and which
questions remain open. An uncertain expectation can be identified as
such. Reproduction steps help when available. A log, static finding,
or measurement can also discriminate between explanations. The
[Defect Report template](../defects/defect-report-template.md) gives
this evidence a recoverable home. Sensitive evidence belongs in a
governed channel. Severity, priority, and authorization to act follow
the applicable local policy.[^prior-recording-defect-reports][^prior-triaging-defect-reports]

## What changes when a fix ships

Suppose investigation of the first report shows that retrying a completed
delivery sends a second message. A Change authorized to correct that
defect can be classified as a Bugfix. The report preserves the original
discrepancy, including the affected version and retry conditions. The
Change records the correction's scope, regression risks, acceptance
conditions, delivery, and verification.[^prior-linking-defects-to-corrective-changes]

Verifying that a retry sends no second message on the corrected version
provides evidence for disposing of the first report. The second report
had a different cause and could already have been closed under local policy
as expected behavior. Likewise, a report closed as a duplicate points
to the report that carries the investigation. The date of that closure
tells a reader where the evidence went. It says nothing about when a fix
became available.[^prior-triaging-defect-reports][^prior-linking-defects-to-corrective-changes]

[^prior-recording-defect-reports]: [Recording Defect Reports](https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/defects/recording-defect-reports.md).
[^prior-triaging-defect-reports]: [Triaging Defect Reports](https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/defects/triaging-defect-reports.md).
[^prior-linking-defects-to-corrective-changes]: [Linking Defects to corrective Changes](https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/software-testing/src/defects/linking-defects-to-corrective-changes.md).
