---
type: Guide
title: How to design a verification checklist
description: When someone must check completed work, write a checklist that ties each conclusion to evidence from the finished item and sends discrepancies for correction and recheck.
tags: [docs, verification-checklist, authoring, verification, comparison, discrepancy]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T02:02:34Z }
sources:
  - id: bagit
    resource: https://www.rfc-editor.org/rfc/rfc8493.html
    title: RFC 8493 — The BagIt File Packaging Format (V1.0)
---

# How to design a verification checklist

Take the finished item, a criterion for accepting it, and an example of
something that went wrong. Find an observation, measurement, or test
result that would reveal that discrepancy on this item.

Suppose an archive receives concerts packaged using BagIt. Staff already
run a validator, but a report for yesterday’s delivery could be attached
to today’s accession record. Put the prompts
in that record so the receiver checks which delivery the result belongs to.

## 1. Define the claim and find evidence that could disprove it

Replace “delivery OK” with the claim the receiver can actually establish.
For a BagIt delivery, validity requires both completeness and successful
verification of all manifest checksums. If the bag supplies a
`Payload-Oxum`, the receiver can quickly compare total payload bytes and
file count. Matching totals leave same-length changes undetected. Find
where the validator reports that full validation finished.[^bagit]

If the archive also needs to identify the performance, locate the agreed
accession record and a way to check what was recorded. Give that claim its
own check. Restrict the checksum result to the comparison it performed.

## 2. Write the comparisons and the response to a discrepancy

Write what the reviewer will compare, how to identify the item the
evidence belongs to, and who can resolve a missing or failed check.
In this example the archive gives each received copy a delivery ID and
keeps the copy unchanged during intake. Its validation tool records that
ID on the report. The receiving team resolves identification problems
locally and asks the sender for a replacement when the files fail
validation. The prompts reflect the agreements at that receiving desk.

| At receipt | Evidence and response |
| --- | --- |
| Which copy are we checking? | Match the received copy’s delivery ID to the accession record. If they differ, pause intake and have the receiving team establish which copy belongs to the record. |
| Does the report establish validity for that copy? | Match the report’s delivery ID to the confirmed copy and inspect the result. For a missing or mismatched report, retrieve the full report for this copy or rerun validation on it. If checks were skipped or only totals were compared, run full validation. |
| What did full validation find? | On success, attach the report to the accession record. On a missing required file or checksum mismatch, record the failing path, hold the copy, and request a replacement. Check the replacement under its own delivery ID before closing the hold. |

Where a tool already makes a comparison, ask the reviewer to check which
item it tested and what it found. When translating criteria
into prompts staff will use, follow the shared [checklist design guide](designing-a-checklist.md)
for item wording and the use protocol.

## 3. Try a correct case and cases that look correct

Try an item that meets the criterion, then one with a discrepancy the
check should catch. For the archive, prepare two test deliveries from a
known-good package. Leave one intact.
In the other, change one payload byte without altering its length or
the manifest. Receive each under its own ID and run full validation.
The damaged copy should trigger a replacement request even
though its filenames and sizes look right. With the good copy, try three
other cases. Supply another delivery’s report, then a report with only
matching totals. Can the reviewer obtain full validation for the good
copy in both cases? Finally, give them an accession record for a different
copy. They should resolve which delivery they have before running a check.

If a reader can pass a damaged delivery by ticking “report present,” revise
the item to ask which comparison ran and what it found. Record the cases
tried. The test addresses those discrepancies. Production use can reveal
failures the test copies did not contain.

For this archive, record which validator output the receiver inspected and
whether a damaged package was accepted. For a reusable candidate, include the
[maintainer note](designing-a-checklist.md#decide-what-would-justify-keeping-it)
with the checklist and identify any open ownership or evidence questions.

[^bagit]: [RFC 8493](https://www.rfc-editor.org/rfc/rfc8493.html), §§2.2.2 and 3.
