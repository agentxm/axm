---
type: Explainer
title: Standard authority and conformance
description: Why adopting a standard, meeting one of its criteria, and making a conformance claim require different grounds, illustrated by an accessibility review.
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
  - id: w3c-testable-requirements
    resource: https://www.w3.org/TR/test-methodology/
    title: W3C — A Method for Writing Testable Conformance Requirements
  - id: odonovan-waking
    resource: https://newcollege.unsw.edu.au/downloads/File/pdf/Lectures_Summaries/Waking.pdf
    title: Oliver O'Donovan — Waking
  - id: odonovan-resolving
    resource: https://newcollege.unsw.edu.au/downloads/File/pdf/Lectures_Summaries/Resolving.pdf
    title: Oliver O'Donovan — Resolving
  - id: wcag22
    resource: https://www.w3.org/TR/WCAG22/
    title: W3C — Web Content Accessibility Guidelines 2.2, §§2.4.2 and 5
  - id: page-titled
    resource: https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html
    title: W3C — Understanding Success Criterion 2.4.2, Page Titled
generated: { by: "codex/gpt-6", at: "2026-11-22T01:49:36Z" }
---

# Standard authority and conformance

When someone says their work meets a [standard](standard.md), there are
two questions worth asking. What gives that standard authority over this
case? What evidence shows the work satisfies its requirements? The
first question concerns which expectations apply. The second concerns
what the evidence warrants saying about the work.

Suppose a library commissions a new catalogue and the agreement calls for
its search and borrowing pages to conform to the Web Content Accessibility
Guidelines (WCAG) 2.2 at Level AA. A vendor reports that every page has a
title. A reader tells the library that with two catalogue tabs open, they
cannot tell which one contains their loan renewals. What would settle
the disagreement?

## How a standard acquires standing

W3C publishes WCAG. In this example the library and vendor gave one
version and level of that standard force for the project by naming it in
their agreement. Another library could adopt the same criteria in an
internal policy. A public authority can also incorporate a standard into
a regulation. The body that develops a standard need not be the body that
adopts, assesses, certifies, or enforces it.[^wcag22][^iso-definitions]

A convention can coordinate work before any organization adopts it. Two
librarians may use the same filing order simply because everyone who
shelves the collection learned it that way. Publication by a consensus
body has a different history. IEEE’s
board looks for substantial agreement among the interests directly
affected and an effort to resolve objections. ISO describes how a committee
judges agreement and handles sustained opposition. Either process can reach
consensus while some participants still disagree. For a different issuing
body, its own approval rules govern.[^ieee-standards-bylaws][^iso-directives]

Why choose the criterion at all? Oliver O’Donovan asks how recognizing a
good gives a person reason to act in a particular situation.[^odonovan-waking][^odonovan-resolving]
Applied to the library, his question brings out three aspects of authority.
The benefit to people trying to find their place gives the title requirement
a **warrant**. The agreement gives it **standing** here. Its **application**
requires a judgment about what titles serve that purpose on the pages in
question. People can agree on who adopted a standard and disagree about
how well it serves its readers.

## What would resolve the title question?

WCAG 2.2 criterion 2.4.2 calls for a title that describes the topic or
purpose of a page. The vendor counted titles. The count would be the same
if the search results and renewals pages were both titled “Library”.
Inspecting each title alongside what its page lets someone do gives the
reviewer evidence the count could never supply. “Search the catalogue”
and “Renew borrowed books” would give the reader a way to choose the
right tab. W3C explains this benefit in guidance accompanying the criterion.
Other titles could serve it just as well.[^wcag22][^page-titled]

A *criterion* tells the reviewer what feature matters. A *test* produces
evidence about it. Counting nonempty titles measures one necessary
condition in the library's pages. The count became misleading when it
stood in for the quality a reader cared about. W3C’s note on writing
testable requirements explains why naming the subject, the applicable
conditions, and the required behavior matters to a test designer. Here
part of the evaluation calls for someone to read and judge a title in
context.[^w3c-testable-requirements][^page-titled]

The reviewer has supplied a finding about the two pages. Acceptance of
the catalogue is another decision. In the library's agreement the vendor
might correct a finding, an independent reviewer might check the repair,
and the library might decide whether to accept the delivery. The strength
of the evidence and the authority to act on it can belong to different
people.

## How far the finding travels

**Conformance** means satisfying the requirements a standard specifies
for the relevant subject and version. In WCAG 2.2 the title criterion
belongs to Level A. It applies at Level AA too. Correcting the two
titles can close this particular finding. Establishing Level AA requires
evaluating all applicable Level A and AA success criteria and the other
conformance requirements, including coverage of complete pages and any
complete processes they belong to. A claim identifies the date, version,
level, pages covered and technologies relied on.[^wcag22]

The claim has a boundary even after all that work. W3C acknowledges that
the guidelines leave some user needs unaddressed. A reader's difficulty
in a borrowing session deserves investigation even if the pages satisfy
the requirements. The library can ask both whether the agreed criteria
were met and what else readers need to borrow a book successfully. Each
question calls for its own evidence.[^wcag22]

[^odonovan-waking]: Oliver O’Donovan, [Waking](https://newcollege.unsw.edu.au/downloads/File/pdf/Lectures_Summaries/Waking.pdf).
[^odonovan-resolving]: Oliver O’Donovan, [Resolving](https://newcollege.unsw.edu.au/downloads/File/pdf/Lectures_Summaries/Resolving.pdf).
[^ieee-standards-bylaws]: IEEE SA Standards Board Bylaws, [§2.1](https://standards.ieee.org/about/policies/bylaws/sect1-3/).
[^iso-directives]: ISO/IEC Directives, [Part 1, §2.5.7](https://www.iso.org/sites/directives/current/consolidated/).
[^iso-definitions]: ISO, [Useful definitions](https://policy.iso.org/resources.html).
[^w3c-testable-requirements]: W3C Working Group Note, [A Method for Writing Testable Conformance Requirements](https://www.w3.org/TR/test-methodology/).
[^wcag22]: [W3C — Web Content Accessibility Guidelines 2.2, §§2.4.2 and 5](https://www.w3.org/TR/WCAG22/).
[^page-titled]: [W3C — Understanding Success Criterion 2.4.2, Page Titled](https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html).
