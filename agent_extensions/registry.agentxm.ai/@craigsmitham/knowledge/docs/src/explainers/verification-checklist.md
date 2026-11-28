---
type: Explainer
title: What a verification checklist establishes
description: How comparing the finished work with an independent criterion can reveal an error even when every production step was recorded as complete.
tags: [docs, verification-checklist, evidence, discrepancy, verification]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T01:49:36Z }
sources:
  - id: bagit
    resource: https://www.rfc-editor.org/rfc/rfc8493.html
    title: RFC 8493 — The BagIt File Packaging Format (V1.0)
  - id: nasa
    resource: https://ntrs.nasa.gov/api/citations/19910017830/downloads/19910017830.pdf
    title: Degani and Wiener — Human Factors of Flight-Deck Checklists
---

# What a verification checklist establishes

How can a verification checklist catch a mistake after every step has been
marked complete? Suppose an archive receives a folder containing a recorded
concert. The sender’s log says that every recording was copied. All the
filenames are present. One of the files has changed by a single byte. Both
reassuring observations can be true while the received recording differs
from the one sent.

A **verification checklist** directs attention to a claim about finished
work and the evidence that would support or contradict it. In the BagIt
packaging format, a manifest lists file paths and their expected checksums.
A checksum is a value calculated from the bytes in a file. Running the
same calculation on the bytes that arrived gives the receiver a value to
compare with the one recorded before transfer. A mismatch exposes a
change that the filenames alone conceal. Presence and agreement are
different checks. RFC 8493 defines a valid bag as a complete bag whose
manifest checksums all verify.[^bagit]

## Where the second observation comes from

Repeating “copied successfully” from the sender’s log would preserve the
same blind spot as the original action. Even asking a second person to
read the log would leave the bytes unexamined. The useful independence
here comes from inspecting the received package. Software can perform
the comparisons. A person using the checklist still needs to establish
that the result belongs to this delivery and decide what to do with a
discrepancy.

In their flight-deck observations, Degani and Wiener describe occasions
when an expected response was spoken without the check of the actual
setting. A familiar answer can be available in memory before anyone
looks. Their account helps explain why the act of answering a prompt
can feel like verification while leaving the state in question
unobserved.[^nasa]

## The boundary of the conclusion

If the manifest and the received bytes agree, the archive has evidence
about the transfer. The files could still be recordings of last week’s
concert. BagIt treats their contents as uninterpreted bytes. Identifying
the performance requires a different criterion and source of evidence.
Similarly, an unavailable manifest leaves the comparison unresolved.
It supplies neither a match nor a mismatch.[^bagit]

For drafting the checks and deciding what the receiver should do with
each result, see [How to design a verification checklist](../guides/designing-a-verification-checklist.md).

[^bagit]: [RFC 8493](https://www.rfc-editor.org/rfc/rfc8493.html), §§1.3, 2.1.2, and 3.
[^nasa]: Asaf Degani and Earl Wiener, [Human Factors of Flight-Deck Checklists](https://ntrs.nasa.gov/api/citations/19910017830/downloads/19910017830.pdf), §5.2.2.
