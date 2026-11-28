---
type: Explanation
title: Drucker's five most important questions
description: How Peter Drucker's self-assessment questions of mission, customer, customer value, results, and plan connect why an organization exists to whom it serves, how it recognizes results, and what it commits to, and how they can organize the intent behind a software product.
tags: [drucker, five-questions, mission, customer, customer-value, results, planning, self-assessment, business-analysis]
status: draft
sources:
  - id: five-questions
    resource: https://www.shared-impact.com/wp-content/uploads/2020/09/5.-Most-Important-Questions-You-will-ever-ask-about-your-organization.pdf
    title: Audio-Tech Business Book Summaries — The Five Most Important Questions You Will Ever Ask About Your Organization, by Peter F. Drucker with Jim Collins, Philip Kotler, James Kouzes, Judith Rodin, V. Kasturi Rangan, and Frances Hesselbein (Jossey-Bass, 2008)
  - id: managing-for-results
    resource: https://archive.org/details/managingforresul00pete
    title: Peter F. Drucker — Managing for Results, 1964
  - id: results
    resource: https://drucker.institute/wp-content/uploads/2018/08/Reading-Drucker-on-Results.pdf
    title: Drucker Institute — What Are Our Results?, adapted from The Five Most Important Questions and What Business Can Learn from Nonprofits
  - id: customer-centric
    resource: https://drucker.institute/wp-content/uploads/2018/08/Reading_Drucker-on-Being-Customer-Centric.pdf
    title: Drucker Institute — Reading Drucker on Being Customer-Centric
generated: { by: codex/gpt-6, at: 2026-11-22T01:48:42Z }
---

# Drucker's five most important questions

A team can specify a product precisely and still be unable to say whom it is
for, what they value, or how anyone will know it worked. Which questions should
an account of a product's intent answer before its behavior is specified?

Peter Drucker used five questions for organizational self-assessment.
Consider their application at Northbank, a fictional equipment-rental company.
Its team can tell whether the booking software sent a confirmation. The
people who depend on it can tell whether the equipment arrived in time for
work. Which result matters depends on whom the company exists to serve.[^five-questions]

## The five questions

| Question | What Drucker asks for | Northbank illustration |
| --- | --- | --- |
| What is our mission? | Why the organization does what it does, not how, matched to its opportunities, competencies, and commitment | Keep contractors' crews working through dependable equipment access |
| Who is our customer? | One primary customer whose life the work changes, and the supporting customers who must also be satisfied | Small contractors coordinating equipment with a job start; depot staff, repair suppliers, and partner depots as supporting customers |
| What does the customer value? | What satisfies customers' needs, wants, and aspirations, as customers themselves say | A trustworthy promise that the equipment will be there when the crew starts |
| What are our results? | The changes the work brings about outside the organization, recognized by qualitative and quantitative measures together | Fewer lost crew days, and what contractors report about relying on a confirmation |
| What is our plan? | Mission, vision, goals, objectives, action steps, budget, and appraisal, beginning with what to abandon | Which service commitments to make, which to stop, and how progress will be appraised |

### Mission starts outside

Drucker says an effective mission is short, states why rather than how, and
starts from the outside environment. An organization that starts from its
resources and looks for places to use them will, he warns, focus on
yesterday.[^five-questions] In *Managing for Results* he makes a related point about
effort: "Results are obtained by exploiting opportunities, not by solving
problems."[^managing-for-results] His distinction matters when the team
decides where to put its next hour. Restoring the booking system can preserve
today's service. Discovering that an earlier handover would let crews start a
second job raises a new question about what the service could offer.

For a product team, this separates the mission from the software. Northbank's
contribution is dependable access for contractors; a reservation system is one
way to make it.

### Primary and supporting customers

Writing about social-sector organizations, Drucker identifies one primary
customer, the person whose life the work changes. The primary
customer is never the only customer: supporting customers, such as
volunteers, members, partners, funders, referral sources, and employees, must
also be satisfied.[^customer-centric] They can say no, and satisfying one
customer without the others is no performance.[^five-questions] The
distinction is whose life changes and who must be satisfied, not who uses
what the organization offers.

In a product this separates people the product serves from people it must
satisfy, whether or not either group uses the product. A contractor's supervisor is served by a dependable confirmation. A
repair supplier who never uses the portal is still a supporting customer,
because Northbank cannot keep its promise if the supplier rejects the
arrangement.

### Value is what customers say

Drucker calls *What does the customer value?* the most important question and
the one least often asked. Organizations assume they know what they deliver;
he recommends starting from what the organization believes customers value
and comparing it with what customers actually say.[^five-questions] This is
the same discipline that [Jobs to Be Done](jobs-to-be-done.md) applies to customer progress: value is
established by evidence, not by the offering's description of itself.

### Results are qualitative and quantitative

Drucker asks social-sector organizations to look for changes in the lives of
the people they serve. A count can establish how often a change occurs.
An account from a participant can show what that change meant. He treats
both kinds of evidence as necessary. For businesses, he recognizes profit
as a condition for survival while leaving open how well it measures the
whole result.[^results]

At Northbank, shorter waits for confirmations might coexist with just as
many lost crew days. A supervisor might explain that a prompt confirmation
still leaves the crew waiting when the machine arrives late. The supervisor's
account gives the lost days a possible cause that the software's response
time alone could never reveal.

### A plan begins with abandonment

The plan converts intentions into action. Goals are few and long-range;
objectives are specific and measurable levels of achievement that move the
organization toward its goals; action steps and budgets follow. Drucker lists
abandonment first among the elements of an effective plan: "If we were not
committed to this today, would we go into it?"[^five-questions]

For a product team, abandonment concerns an existing commitment. Suppose
Northbank still maintains an overnight report for a depot that now uses live
records. Finding out who still relies on the report lets the team decide
whether retiring it would free staff to work on late handovers.
[Drucker's four disciplines of organizational renewal](drucker-organizational-renewal.md)
develop abandonment alongside improvement, exploiting success, and innovation.

## Using the questions to organize product intent

The questions can arrange the intent behind a product so that a reader sees
what the business cares about, and which of those concerns nobody has
answered. In this bundle's interpretation:

| Question | Product intent it organizes |
| --- | --- |
| What is our mission? | Mission, vision, and principles; the opportunity that makes the product worth building now |
| Who is our customer? | The jobs of the people served, the product's users, and the stakeholders who must be satisfied or can say no |
| What does the customer value? | Evidence for those jobs and needs, and what each stakeholder values |
| What are our results? | Objectives, each a change outside the product with quantitative and qualitative indicators |
| What is our plan? | Strategy, the few things concentrated on now and what is set aside; and Scope, what the product takes on and what it deliberately leaves out |

Drucker asks an organization to concentrate its effort and reconsider old
commitments. The table applies those ideas to product scope. A release plan
would still need to say when and how the team will deliver on those choices.

A gap under one question is informative. A product with detailed requirements
but no stated results cannot tell whether it succeeded; one with objectives but
no evidence of customer value may be measuring the wrong change.

## Connections across product engineering

- [Drucker's theory of the business](drucker-theory-of-the-business.md)
  examines the assumptions about environment, mission, and competencies that
  the first two questions make explicit.

- [Strategy perspectives and their relationships](strategy-perspectives.md)
  compares Drucker's perspective with other accounts of strategic choice.

[^five-questions]: [Audio-Tech Business Book Summaries, The Five Most Important Questions You Will Ever Ask About Your Organization](https://www.shared-impact.com/wp-content/uploads/2020/09/5.-Most-Important-Questions-You-will-ever-ask-about-your-organization.pdf), summarized by arrangement with Jossey-Bass from Peter F. Drucker et al., 2008.
[^managing-for-results]: [Peter F. Drucker, Managing for Results](https://archive.org/details/managingforresul00pete), 1964.
[^results]: [Drucker Institute, What Are Our Results?](https://drucker.institute/wp-content/uploads/2018/08/Reading-Drucker-on-Results.pdf), adapted from *The Five Most Important Questions* and *What Business Can Learn from Nonprofits*.
[^customer-centric]: [Drucker Institute, Reading Drucker on Being Customer-Centric](https://drucker.institute/wp-content/uploads/2018/08/Reading_Drucker-on-Being-Customer-Centric.pdf).
