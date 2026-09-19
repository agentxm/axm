---
type: Explanation
title: Jobs to Be Done
description: How Jobs to Be Done connects customer progress, functional objectives, switching, and unmet needs; how to frame jobs, distinguish interpretations, and connect research evidence to product decisions.
tags: [product-management, jobs-to-be-done, customer-progress, functional-jobs, job-framing, job-maps, desired-outcomes, outcome-driven-innovation, switch-interviews, job-stories, evidence, pe-foundations]
status: draft
sources:
  - id: christensen-theory
    resource: https://www.christenseninstitute.org/theory/jobs-to-be-done/
    title: Christensen Institute — Jobs to Be Done Theory
  - id: strategyn-theory
    resource: https://strategyn.com/jobs-to-be-done/jobs-to-be-done-playbook/what-is-jobs-to-be-done/
    title: Strategyn — What is Jobs-to-be-Done?
  - id: rewired-framework
    resource: https://therewiredgroup.com/learn/complete-guide-jobs-to-be-done/
    title: Re-Wired Group — What is the Jobs To Be Done framework?
  - id: rewired-timeline
    resource: https://therewiredgroup.com/learn/the-six-stages-of-the-buyers-timeline/
    title: Re-Wired Group — The six stages of the buyers’ timeline
  - id: rewired-demand
    resource: https://therewiredgroup.com/learn/demand-side-sales-101-stop-selling-and-help-your-customers-make-progress/
    title: Re-Wired Group — What is Demand-Side Sales?
  - id: rewired-demo
    resource: https://therewiredgroup.com/news/blog-jtbd-interview-live-demonstration/
    title: Re-Wired Group — JTBD Interview — Live Demonstration, public outline
  - id: strategyn-canvas
    resource: https://strategyn.com/jobs-to-be-done-canvas/
    title: Tony Ulwick — The Jobs-to-be-Done Canvas
  - id: strategyn-job-map
    resource: https://strategyn.com/jobs-to-be-done/jobs-to-be-done-playbook/build-your-job-map/
    title: Strategyn — Build Your Job Map
  - id: ulwick-needs
    resource: https://strategyn.com/customer-needs-through-a-jobs-to-be-done-lens/
    title: Tony Ulwick — Customer Needs Through a Jobs-to-be-Done Lens
  - id: strategyn-opportunity
    resource: https://strategyn.com/outcome-driven-innovation/market-opportunity/
    title: Strategyn — Find Hidden Innovation Opportunity In The Market
  - id: strategyn-measurement
    resource: https://strategyn.com/quantify-your-customers-unmet-needs/
    title: Strategyn — Quantify Your Customers’ Unmet Needs
  - id: strategyn-odi
    resource: https://strategyn.com/outcome-driven-innovation-process/
    title: Strategyn — The Innovation Process
  - id: klement-interpretations
    resource: https://medium.com/the-job-to-be-done/know-the-two-very-different-interpretations-of-jobs-to-be-done-5a18b748bd89
    title: Alan Klement — Know the Two — Very — Different Interpretations of Jobs to be Done
  - id: kalbach-synthesis
    resource: https://experiencinginformation.com/2020/10/23/drills-and-milkshakes-say-yes-to-the-mess/
    title: Jim Kalbach — Drills and Milkshakes — Say Yes to the Mess
  - id: intercom-stories
    resource: https://www.intercom.com/blog/accidentally-invented-job-stories/
    title: Paul Adams — How we accidentally invented Job Stories
  - id: klement-design
    resource: https://www.intercom.com/blog/using-job-stories-design-features-ui-ux/
    title: Alan Klement — Designing features using Job Stories
  - id: cohn-stories
    resource: https://www.mountaingoatsoftware.com/agile/short-answers-to-your-big-questions-about-user-stories
    title: Mike Cohn — Short Answers to Your Big Questions about User Stories
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Jobs to Be Done

Jobs to Be Done (JTBD) helps explain what people seek from products and services:
what they want to accomplish, why a change becomes attractive, and where
available solutions fall short. It redirects attention toward the purpose an
offering serves in someone's circumstances.[^christensen-theory][^strategyn-theory]

JTBD is a family of theories and practices with meaningful disagreements. This
explanation develops its central concepts, shows how different interpretations
shape research, and connects findings to product decisions. It is intended for
readers evaluating a customer problem or interpreting JTBD work; it does not
prescribe one tradition as the bundle's required method.

For a compact account of how jobs relate to an offering, audience, need, and
value proposition, read the [Value and demand model](../problem/value-and-demand-model.md).
This explanation develops the customer inquiry behind that vocabulary.

## Foundations: jobs, progress, and customer needs

### Two meanings of a job

In the **progress interpretation**, a job concerns a change someone seeks in
particular circumstances. Christensen's account connects functional, emotional,
and social dimensions to choices: what people can accomplish, how they feel,
and their relationships or standing with others. A person's circumstances can
change the job even when their demographic characteristics remain the same.
[^christensen-theory]

In the **functional-job interpretation**, the anchor is an objective someone
seeks to accomplish. Ulwick's approach separates that objective from the
products and activities currently used to achieve it. It defines a market
around people performing the job and treats the job as a durable focus for
innovation as technologies change.[^strategyn-theory]

These are related questions with different starting points. “Why did this
manager decide to change how incidents are handled?” and “What must responders
accomplish to coordinate an incident?” can both be JTBD inquiries. Neither
answer automatically supplies the other.

### Jobs, needs, outcomes, and hiring

The **hiring metaphor** describes choosing a solution for the purpose it serves.
A person can hire a service, use a workaround, or combine offerings. What looks
like a surprising competitor becomes understandable when viewed through that
purpose.[^christensen-theory]

Vocabulary requires care. In Outcome-Driven Innovation (ODI), a **desired
outcome** expresses how a customer judges successful job execution; these
criteria operationalize customer needs. In progress accounts, *desired outcome*
can describe the preferred situation after change. A job, a need, and an outcome
therefore cannot be declared universally synonymous or universally separate.
[^ulwick-needs][^rewired-framework]

The main contributions provide different starting points for study:

| Contribution | Emphasis |
| --- | --- |
| Christensen and collaborators | Progress sought in circumstances and the choices it helps explain |
| Moesta and the Re-Wired Group | Demand, switching histories, forces of progress, and tradeoffs |
| Ulwick and Strategyn | Functional jobs, measurable success criteria, and ODI |
| Klement | Transformation toward a preferred life situation and criticism of the functional interpretation |
| Kalbach | A practical synthesis across levels of abstraction and methods |
| Intercom and Klement's design work | Job stories that bring situations and motivations into design conversations |

This is an organizing map of contributions, not six equivalent schools or a
settled account of who invented every concept. The compatibility debate is
addressed after the concepts themselves.

### Running example: coordinating a service incident

Consider [Northbank Equipment](../northbank-equipment.md), a fictional rental
company where a receipt-service incident crossed three responsibility groups.
Nobody knew who was coordinating the response; two teams issued conflicting
instructions, and the engineering manager stepped in. After similar incidents,
the manager considers changing the arrangement.

The examples throughout this page are **illustrative hypotheses**, not customer
research findings. They distinguish the manager's possible progress—regaining
confidence that incidents can be handled without personal intervention—from
the responders' functional objective of coordinating a response. Possible
solutions include clearer responsibilities, training, staffing changes, a
managed service, and software. The scenario does not establish which is needed.

## Framing a job: people, circumstances, and scope

### Job performer, buyer, and other participants

The **job performer**, also called the **job executor**, carries out the focal
functional job. The person authorizing a purchase may be someone else.
Strategyn also distinguishes people supporting a product's lifecycle, such as
installers and maintainers, whose work creates additional needs.
[^strategyn-canvas]

In the incident example, responders coordinate work, the manager may sponsor
a change, a procurement team may approve a purchase, and administrators may
configure a tool. Their involvement does not make their purposes identical.
The manager might prioritize reducing escalations; responders might prioritize
reliable handoffs; administrators might need a maintainable roster.

“Customer” is too imprecise if it lets evidence from one participant stand in
for another. A useful account names whose progress or objective is under
investigation and explains how other participants constrain it. An organization
can be the purchasing account while individual people have different reasons
for supporting, resisting, or using the proposed arrangement.

### Circumstances and dimensions of progress

Circumstances make the situation intelligible. For the manager, they might
include repeated coordination failures, distributed teams, limited authority
over staffing, and an approaching period of high service demand. “Engineering
manager at a medium-sized company” supplies much less explanatory detail.

Functional, emotional, and social considerations can coexist. In this example,
consistent instructions would help the response; confidence would reduce the
manager's felt need to intervene; preserving responders' trust could affect
which change the manager is willing to introduce. These remain hypotheses
until the relevant people and events provide evidence.

Circumstances should explain differences that matter. Adding the manager's
favorite hobby to a profile would not strengthen the account unless it bears
on this choice. Conversely, omitting authority or workload because it seems
like a mere personal attribute could remove an essential constraint.

### Scope and levels of abstraction

Kalbach distinguishes aspirations, main functional jobs, and job steps, using
questions about why and how to move between them. This offers a useful way to
examine scope, although his synthesis is not accepted by every JTBD author.
[^kalbach-synthesis]

| Candidate framing in the example | What it reveals or obscures |
| --- | --- |
| “Be a successful leader” | A broad aspiration that leaves the relevant situation and alternatives largely unspecified |
| “Regain confidence that incidents can be handled without my intervention” | A possible progress framing; it still needs the circumstances that make the change meaningful |
| “Coordinate a response to a service incident” | A bounded functional objective that can be examined across different arrangements |
| “Establish who is coordinating the response” | A possible step within that objective |
| “Click the Assign Commander button” | An interaction with one implementation; it assumes a solution and role design |

The broadest statement is not automatically the deepest insight. The narrowest
is not automatically the most actionable job. Scope changes what the research
can discover: a study of response coordination may miss opportunities to avoid
incidents altogether; a study of “successful leadership” may include so many
unrelated choices that comparisons lose meaning.

Boundaries also determine what completion means. Does response coordination
end when service is restored, when responsibility is handed over, or after
follow-up work is assigned? A research scope needs to make that choice visible
and remain open to revision. Moving between the manager's aspiration and the
responders' objective also changes perspective; their relationship needs
evidence, even when both descriptions concern the same incident.

### Framing criteria and their limits

The following criteria are this explainer's synthesis for assessing a framing:

| Criterion | What a useful framing makes clear | Warning sign in the example |
| --- | --- | --- |
| Identifiable subject | Whose progress or accomplishment is at stake | “The business needs confidence” merges several people's concerns |
| Meaningful circumstances | When the inquiry applies and what constrains it | Every incident is assumed to create the same demand |
| Useful boundaries | What counts as accomplishing the objective or reaching the preferred situation | “Improve operations” has no discernible scope |
| Independence from a particular solution | Alternatives remain conceivable | “Adopt an incident dashboard” embeds a product decision |
| Consistent level of abstraction | The statements being compared answer comparable questions | A leadership aspiration is ranked alongside a button interaction |
| Connection to evidence | The account can be investigated in experiences and examples | A polished sentence is treated as proof of a customer need |

A **job statement** names the inquiry's object. A functional statement commonly
uses a verb and object with a contextual qualifier; a progress account needs
enough of the situation and desired change to make its meaning clear. There is
no single sentence template that resolves all disagreements about jobs.

Tasks and activities can contribute to a job, and some authors use those words
in their definitions. The useful distinction is between what someone seeks to
accomplish and the chosen means. In the example, posting a message is an
activity; a dashboard is a solution; an assignment button is a feature.
Establishing coordination is the purpose those means might serve.

## Progress, competition, and switching

### Current arrangements and competing alternatives

A progress inquiry examines the gap between the present situation and the
preferred one. Klement emphasizes that different activities—or eliminating an
activity—can serve a desired transformation. His account therefore widens the
competitive set beyond products offering equivalent functions.
[^klement-interpretations]

For the manager, a new tool competes with appointing a standing coordinator,
training the teams, using an outside service, and continuing to intervene.
Doing nothing new can preserve a familiar arrangement despite its costs.
A product-category comparison would omit several of these options.

**Hiring criteria** concern what an acceptable new arrangement must provide;
**firing criteria** concern why an existing one becomes unacceptable. They are
revealed through decisions and compromises, not just a list of attractive
features.[^rewired-framework]

The manager might accept fewer reporting features in return for a dependable
handoff. Another manager might reject the same arrangement because it requires
a staffing commitment they cannot make. The chosen option expresses a tradeoff;
it does not prove that every need is satisfied or that every rejected feature
is unimportant.

### Forces of progress

Moesta's forces describe influences toward and against change. Push concerns
problems with the present; pull concerns the attraction of a different future;
anxiety concerns the new choice; habit concerns attachment to the existing
arrangement.[^rewired-framework]

| Force | Possible incident example |
| --- | --- |
| Push | Another coordination failure requires the manager to take over |
| Pull | A credible way for teams to manage the response themselves |
| Anxiety | A new process could fail during a serious incident |
| Habit | Teams already know their informal contacts and messaging channels |

The forces are a way to interpret a decision, not measured quantities that
must be inserted into an equation. Their practical consequence is that making
the new option more attractive may leave resistance untouched. A rehearsal
could address uncertainty about a new arrangement more directly than another
feature, if uncertainty is actually what is preventing change.

### Triggers and switching timelines

A **triggering event** is a particular occurrence that changes attention or
commitment. **Circumstances** are the surrounding conditions that give the
event significance. The latest incident might trigger an active search; the
history of escalating interruptions might explain why it matters now.
One event should not be assumed to explain the whole decision.

The Re-Wired Group's buying timeline distinguishes first thought, passive
looking, active looking, deciding, onboarding, and ongoing use. It follows the
buyer's movement through consideration and experience, including the difference
between choosing an offering and continuing to use it.[^rewired-timeline]

```mermaid
flowchart LR
    A[First thought] --> B[Passive looking]
    B --> C[Active looking]
    C --> D[Deciding]
    D --> E[Onboarding]
    E --> F[Ongoing use]
```

This simplified diagram follows that source's stage labels. It is an organizing
model, not evidence that every decision proceeds at the same pace or without
reconsideration. For the manager, noticing alternatives months ago, arranging
a trial after an incident, and approving a purchase are different events.
A trial could also expose a handoff problem that changes the hiring criteria.

The timeline concerns adopting an arrangement. The work of coordinating each
incident is a different process, even when evidence about that work helps
explain the purchase.

## Functional jobs, job maps, and desired outcomes

### Core, related, and consumption jobs

The **core functional job** anchors the analysis. Strategyn distinguishes
**related jobs**, which people also seek to accomplish, and **consumption jobs**,
which arise from obtaining, setting up, using, maintaining, or disposing of a
solution. These may involve different participants.[^strategyn-canvas]

For this inquiry, coordinating a response is the core job. Informing affected
customers could be a related job, depending on the selected scope. Configuring
an escalation roster is work associated with the chosen arrangement. Its
burden might be reduced by a different solution even while the need for
coordination remains.

“Core” here means central to this analysis. It does not mean competitive
differentiation, as it does in DDD's core-subdomain classification. Nor does
labeling something related make it unimportant: customer communication could
be the core objective of a different inquiry.

### Job maps versus journeys and process maps

A **job map** decomposes a functional objective into what must be accomplished,
independent of the current solution. Strategyn's mapping framework uses eight
categories: define, locate, prepare, confirm, execute, monitor, modify, and
conclude. Its detailed guidance allows omitted categories and multiple steps
within a category; the goal is an effective order for accomplishment, not a
literal replay of current behavior.[^strategyn-job-map]

A small illustrative portion of an incident job map might look like this:

| What must be accomplished | Possible current activity | Possible success criterion |
| --- | --- | --- |
| Establish coordination responsibility | Ask in a team channel who is leading | Reduce time to identify the coordinator |
| Establish a shared understanding of the situation | Copy observations into a document | Reduce the likelihood that responders act on outdated information |
| Align response actions | Arrange a group call | Reduce the likelihood of conflicting instructions |
| Transfer coordination responsibility | Send a handoff message | Reduce time until the successor can direct the response |

This is a partial example, not a validated map or an incident-management
procedure. It exposes questions that a map of screens would conceal. A system
could eliminate copying while still supporting shared understanding.

A **journey map** usually follows a person's experience across encounters and
touchpoints. A **process map** can describe the activities, decisions, and
handoffs through which work occurs. A
[**service blueprint**](service-blueprinting.md) adds the visible and invisible
organizational activity delivering those touchpoints. Those maps can reveal
friction in an existing or proposed arrangement. The defining commitment of a
JTBD job map is to represent accomplishment independently of that arrangement.
Names alone do not settle the distinction; examine what the boxes describe.

### Desired outcomes and success criteria

A functional job expresses what is to be accomplished. A **desired outcome**
expresses a criterion for how well it is accomplished. Ulwick structures an
outcome around an improvement direction, a metric, an object of measurement,
and relevant context; interviews and observation help identify these criteria.
[^ulwick-needs]

Consider: “Minimize the time it takes to identify the coordinator when joining
an incident response.” The direction is *minimize*, the metric is *time*, the
object is *identifying the coordinator*, and the context is *joining a response*.
It leaves the solution open. “Show a coordinator badge” selects an interface;
“be more efficient” leaves the criterion ambiguous.

One job can have many outcomes. Faster identification, accurate identification,
and continuity during a handoff are different concerns. A single satisfaction
question about an “incident experience” could conceal which one is poorly
served. Conversely, splitting synonyms into several survey items can count the
same concern repeatedly.

An outcome statement supplies neither a baseline nor an agreed target. “Reduce
time” does not establish today's performance or commit a system to a particular
latency. Research and product decisions must supply those separately. An ODI
customer outcome also differs from a supplier's business outcome, such as
increasing subscription revenue.

### Importance, satisfaction, and unmet needs

ODI assesses how important outcomes are and how satisfactorily current
solutions serve them. An **underserved outcome** is important and poorly
satisfied; an **overserved outcome** is well satisfied relative to its lower
importance. Strategyn connects the former to opportunities for improvement
and the latter to possible cost reduction.[^strategyn-measurement]

Its **opportunity algorithm** combines importance and satisfaction to prioritize
unmet outcomes. The resulting landscape describes opportunities under that
measurement model; it is not a forecast of sales.[^strategyn-opportunity]

Suppose responders report that identifying the coordinator is highly important
and poorly served. That supports investigating the gap. It does not show that
a badge will solve it: perhaps nobody has accepted responsibility, so the
underlying problem is assignment rather than visibility. Likewise, strong
satisfaction with reporting does not justify removing reports if another
participant depends on them. The population and job scope matter.

### Outcome-based segmentation and ODI

**Outcome-based segmentation** looks for groups whose patterns of unmet
outcomes differ. Ulwick describes analyzing survey responses and then
examining what circumstances explain the resulting segments. The grouping
basis is the pattern of needs rather than a demographic label.
[^ulwick-needs]

For example, a study might find a group that struggles mainly with handoffs and
another that struggles with establishing an initial coordinator. A later
investigation might relate this to shift changes or cross-team incidents.
Those are possible findings to test, not segments that follow automatically
from this scenario. A small company and a large one could share a pattern;
two teams within one company could differ.

**Outcome-Driven Innovation** is the larger research and strategy process:
defining the market and job, identifying outcomes, measuring unmet needs,
examining segments, and choosing how to respond. It includes qualitative and
quantitative work and extends beyond a canvas or prioritization score.
[^strategyn-odi]

## Relationships and disagreements between interpretations

### Abstraction and the object of inquiry

The difference between progress and functional-job accounts is not captured by
“emotional versus functional” or “qualitative versus quantitative.” Strategyn
explicitly includes emotional and social considerations around the functional
job. Christensen includes functional dimensions in progress. Both traditions
use qualitative inquiry.[^strategyn-theory][^christensen-theory]

Klement argues that the interpretations are incompatible: he prioritizes a
preferred life situation and challenges approaches anchored in performing an
activity. His label “jobs-as-activities” is a criticism, not a neutral substitute
for Strategyn's own definition of a functional objective.
[^klement-interpretations]

Kalbach instead argues for combining perspectives, distinguishing aspiration,
functional job, and step, as well as the starting point of inquiry. This is a
reasoned synthesis, not consensus that the theoretical disagreement disappears.
[^kalbach-synthesis]

In our example, improving response coordination might support the manager's
confidence. But the connection requires investigation. Fewer incidents or a
change of responsibility might also provide that progress. A functional inquiry
can remain useful within its chosen boundary while a progress inquiry questions
whether that boundary captures the relevant alternatives.

### Combining findings across interpretations

A switching study may explain why a manager sought change without identifying
all the responders' unmet performance needs. An outcome survey may identify
poorly served criteria without explaining why a buyer committed at a particular
moment. These are limits of the questions and evidence, not exclusive uses
assigned to each tradition.

Combining the findings requires an explicit connection between participants,
circumstances, and decisions. A manager's account of wanting fewer interruptions
cannot simply be relabeled as responders' desire for a coordination feature.
Likewise, a survey ranking cannot establish that poor coordination caused a
particular cancellation.

Shared words are especially hazardous here. A job story's “outcome,” a progress
account's preferred future, and an ODI desired-outcome metric can inform each
other while remaining different statements. A useful synthesis preserves those
distinctions so readers can assess the inference being made.

## JTBD research and evidence

### Methods answer different questions

Research begins with a question and a relevant population. The following map
connects characteristic methods to their contribution; it is not a mandatory
sequence or an interview script.

| Inquiry | Relevant evidence and method | Typical contribution |
| --- | --- | --- |
| Why did someone change arrangements? | Switch interviews reconstructing a real decision, its circumstances, alternatives, and tradeoffs | A timeline and an interpretation of demand |
| What does accomplishing the job involve? | Interviews with job performers, observation, and examination of relevant work | A job map and candidate success criteria |
| Which outcomes are poorly served, and for whom? | Surveys of a defined population, with importance and satisfaction measures | Estimated unmet needs and possible segments |
| Does a proposed response help? | Concept evaluation, trials, and observation of use appropriate to the claim | Evidence about a solution and remaining uncertainties |

Moesta's demand-side approach seeks the circumstances and mechanisms behind
buying decisions, rather than taking a stated product preference as an adequate
explanation. Reconstructing what happened gives vague words such as “better”
a specific meaning in the person's experience.[^rewired-demand]

Functional research investigates accomplishment and the criteria for success.
A job map helps organize that inquiry; customer evidence can change the steps
and reveal omissions. An internally completed canvas is a starting hypothesis,
not a substitute for that work.[^strategyn-job-map][^strategyn-canvas]

Outcome surveys ask people to rate defined statements. Strategyn's measurement
account uses proportions in the top response categories for importance and
satisfaction. The details of question wording, scale, aggregation, and sampled
population therefore matter when interpreting a reported score.
[^strategyn-measurement]

### Recruitment, roles, and missing experiences

For the incident example, recent buyers can describe a purchase decision;
responders can describe coordination work; administrators can describe setup
and maintenance. People who considered a change but stayed, abandoned a trial,
or stopped using a solution can expose experiences absent from successful
buyers' accounts. Their histories should be identified rather than pooled as
if everyone completed the same transition.

Recruiting only enthusiastic current customers narrows the conclusions. A
study also needs clarity about which incidents and working arrangements its
participants experienced. A group recruited from one vendor's mailing list is
not automatically representative of everyone coordinating service incidents.
Access to relevant people, careful interviewing, and analysis effort are real
prerequisites; a sentence template removes none of them.

### Accounts, interpretations, and findings

Evidence moves through several transformations. An interview supplies a
participant's account. A researcher interprets that account as a job, force,
or criterion. Analysis across cases can support a recurring finding. A survey
estimates how its respondents answer particular questions. Those statements
carry different kinds of support.

Suppose the manager says, “I wanted my evenings back.” This could concern
unnecessary coordination, staffing, unreliable systems, or authority to delegate.
The quote alone does not determine which. Incident records might corroborate
interruptions; they would not by themselves establish the manager's motivation.
An explanation becomes stronger when it accounts for concrete events and
alternatives, including cases that do not fit the initial interpretation.

As general research limits, retrospective accounts are vulnerable to recall
and rationalization; leading questions can introduce the researcher's theory;
samples can omit relevant experiences; and averages can conceal differences.
A coherent switching narrative alone does not establish causation. A high
opportunity score alone does not establish willingness to pay, successful
adoption, or commercial viability. The methods help reduce uncertainty about
particular questions; their outputs should retain the population, evidence,
and unresolved assumptions needed to judge them.

## A second inquiry: the contractor's progress

The same company presents a different inquiry outside its engineering team.
A contractor arranging equipment before a crew starts may want confidence that
the job can proceed without another expensive interruption. The administrator
placing the booking, the supervisor planning the crew, and the equipment
operator can have different functional needs. “Use the reservation portal”
would assume the solution before examining them.

Owning, borrowing, another provider, rescheduling, or buying an operated
service are candidate alternatives. These are hypotheses for inquiry, not
findings inferred from the fictional story. Interviews about switching and
observation of coordination work answer different questions; a better booking
screen cannot establish either account by itself.

The [value-and-demand example](../problem/value-and-demand-model.md#northbank-one-offering-several-relationships)
connects this inquiry to an offering. For the original incident scenario,
[Northbank's receipt records](../delivery/work-items/northbank-receipt-incident.md)
show what responders preserve; their record obligations do not determine what
progress the manager seeks or whether software is the appropriate response.

## From JTBD understanding to product decisions

### Opportunities and possible responses

JTBD findings can change which problem receives attention and which alternatives
are considered. Strategyn uses outcomes to inform strategy, positioning,
competitive evaluation, and concept testing. Re-Wired's buying timeline connects
the customer's changing concerns to sales, onboarding, and continued use.
[^strategyn-odi][^rewired-timeline]

In the example, evidence of unclear coordination could justify exploring both
an explicit responsibility agreement and supporting software. Evidence of
anxiety about transition might favor a rehearsal or gradual introduction.
Different evidence leads to different responses; “customers have this job” is
not sufficient reasoning for a predetermined feature.

A useful decision account connects the finding to the proposed response and
states what remains uncertain. If the hypothesis is that visible responsibility
reduces conflicting instructions, a trial needs to examine both whether people
understand responsibility and whether conflicting instructions actually decline.
Seeing a badge is a narrower result than improving coordination.

### Job stories and neighboring artifacts

A **job story** connects a situation, motivation, and intended outcome, commonly
in the form “When …, I want to …, so I can ….” Intercom developed this as a
concise way to bring research understanding into design; Adams credits Klement
with naming it.[^intercom-stories]

For example: “When several teams join an incident response, I want to establish
who is coordinating, so that decisions can be made without conflicting
instructions.” This communicates a possible need while leaving several
solutions open. Its wording does not make it a research finding.

Klement's worked design example shows how such a story can focus discussion
about a proposed interface on the situations and motivations it should serve.
That is a design use of JTBD, rather than a complete research method.
[^klement-design]

| Artifact | Main contribution | What it does not establish by itself |
| --- | --- | --- |
| Job statement | Names the progress or functional objective being investigated | That the framing is supported or appropriately scoped |
| Desired-outcome statement | Expresses a criterion for successful job execution in ODI | Its importance, current satisfaction, or a target commitment |
| Job story | Communicates situation, motivation, and intended outcome | That a solution is needed or will work |
| User story | Supports a conversation about a user goal and possible delivery scope | The full research basis or all acceptance details |
| Requirement | Records an accepted commitment about what must be achieved | That satisfying it will produce the hoped-for customer or business result |

Job stories and user stories differ in emphasis, but neither format inherently
prevents research or guarantees it. Cohn describes user stories as pointers to
requirements and conversations; the reason for a goal can help a team discover
a better solution. Criticisms of poorly written user stories should not be
turned into a claim that the technique excludes motivation or context.
[^cohn-stories]

### Need evidence, solution validation, and commitment

The boundary between research insight and a requirement is a decision about
what to commit to. Even a well-supported need leaves choices about who will
be served, which tradeoffs are acceptable, what can be built or operated, and
how success will be evaluated. Those choices belong with the responsible
product and engineering participants.

For the incident example, evidence that responders struggle to identify the
coordinator might justify a trial. A subsequent commitment could specify how
responsibility is recorded and communicated during assignment and handoff.
The supporting need does not itself supply those rules. Conversely, passing
tests for the rules would not demonstrate that people adopt the arrangement
or that it reduces coordination failures.

[Requirements and neighboring artifacts](../solution/requirements/foundations/requirements-and-neighboring-artifacts.md)
develops the distinction between product meaning and an accepted commitment.
Keeping that boundary visible allows research findings to inform delivery
without acquiring authority merely by being written in a template.

## Applicability, tradeoffs, and further reading

### When JTBD is useful

JTBD is useful to consider when an inquiry concerns why people seek change,
what alternatives they consider, what accomplishment they need, or which
success criteria existing arrangements leave poorly served. It can help a team
reconsider the boundaries of a market or the purpose of a familiar feature.

Its costs depend on the question. Detailed decision histories require suitable
participants and skilled interpretation. A defensible outcome study requires
careful job framing, statement development, sampling, and quantitative analysis.
Combining approaches adds the work of connecting their different subjects and
claims. The expected decision value should justify that effort.

Complementary methods remain useful: observation can expose work people omit
from interviews; usability studies can examine interaction problems; experiments
can test particular interventions; operational measures can assess performance;
and strategy work can weigh value against cost and organizational capability.
JTBD does not answer every question about a product merely because the product
serves a job.

### Common misapplications

| Misapplication | Why it weakens the reasoning |
| --- | --- |
| Renaming an existing feature as a job | Preserves the assumed solution while concealing alternatives |
| Choosing a sweeping aspiration without circumstances | Makes the framing hard to investigate or use in a decision |
| Treating a job map as today's click sequence | Confuses the objective with one way of accomplishing it |
| Treating an invented job story as customer evidence | Confuses a communication artifact with a finding |
| Using buyer evidence to assert performer needs | Crosses a participant boundary without support |
| Treating a need score as a product roadmap or sales forecast | Omits solution effectiveness, constraints, costs, and adoption |
| Mixing traditions without identifying changed meanings | Makes apparently coherent conclusions difficult to assess |

### Relationship to product engineering and DDD

[What to solve](../problem/) concerns problem framing, value, demand, and
evidence. JTBD can inform those discussions. [What to build](../solution/)
turns selected opportunities into solution choices and commitments.
Product strategy must still decide which opportunities fit the organization's
objectives and capabilities; a customer job alone does not determine priority.

[Domain-driven design](domain-driven-design.md) addresses another set of
questions: how domain understanding shapes language, models, boundaries, and
software. A JTBD inquiry may reveal important distinctions in incident work
that inform domain modeling. It does not determine the model boundary.
One customer job may involve several subdomains and bounded contexts; one
context may support several jobs. Decomposing a job map is therefore not a
method for mechanically deriving services, aggregates, or bounded contexts.

### Reading routes and source basis

The sources below were selected for direct authorship or stewardship of the
method, substantive explanations, and contrasting perspectives. The draft is
based on the linked public texts, including the public outline of the interview
demonstration; it does not claim a review of that full recording.[^rewired-demo]
The authors explain their own approaches. Their promotional claims do not
establish comparative effectiveness, universal causality, or guaranteed
commercial results.
The framing criteria, incident examples, and connections between methods are
this explainer's synthesis.

| Reader question | Recommended source and reason |
| --- | --- |
| What does progress in circumstances mean? | [Christensen Institute: Jobs to Be Done Theory](https://www.christenseninstitute.org/theory/jobs-to-be-done/) gives the central account and contrasting examples. |
| How do forces and switching histories explain demand? | [Re-Wired's framework](https://therewiredgroup.com/learn/complete-guide-jobs-to-be-done/) explains forces and tradeoffs; [the buyers' timeline](https://therewiredgroup.com/learn/the-six-stages-of-the-buyers-timeline/) separates stages of consideration and use. |
| What does an actual switch interview look like? | [Moesta's live demonstration](https://therewiredgroup.com/news/blog-jtbd-interview-live-demonstration/) is a route to observing the technique; the page identifies the interview and analysis segments. |
| How are functional jobs and their boundaries represented? | [Strategyn's introduction](https://strategyn.com/jobs-to-be-done/jobs-to-be-done-playbook/what-is-jobs-to-be-done/), [canvas](https://strategyn.com/jobs-to-be-done-canvas/), and [job-map chapter](https://strategyn.com/jobs-to-be-done/jobs-to-be-done-playbook/build-your-job-map/) explain objectives, participants, and decomposition. |
| How are customer needs expressed and assessed? | [Ulwick on customer needs](https://strategyn.com/customer-needs-through-a-jobs-to-be-done-lens/) explains outcome statements and segmentation; [Strategyn on measurement](https://strategyn.com/quantify-your-customers-unmet-needs/) makes its rating assumptions explicit. |
| How do these techniques fit into ODI? | [Strategyn's ODI process](https://strategyn.com/outcome-driven-innovation-process/) places research, segmentation, and strategy within the larger approach. |
| Why do JTBD authors disagree? | Read [Klement's two interpretations](https://medium.com/the-job-to-be-done/know-the-two-very-different-interpretations-of-jobs-to-be-done-5a18b748bd89) alongside [Kalbach's Drills and Milkshakes](https://experiencinginformation.com/2020/10/23/drills-and-milkshakes-say-yes-to-the-mess/) for contrasting positions, then compare their characterizations with the method owners' accounts. |
| How can understanding inform software design? | [Adams on job stories](https://www.intercom.com/blog/accidentally-invented-job-stories/) explains their purpose; [Klement's design example](https://www.intercom.com/blog/using-job-stories-design-features-ui-ux/) illustrates their use. [Cohn on user stories](https://www.mountaingoatsoftware.com/agile/short-answers-to-your-big-questions-about-user-stories) helps distinguish neighboring delivery artifacts fairly. |

## Continue exploring

- [Value-based strategy](value-based-strategy.md) adds the economics of value
  creation and sharing once customer progress and alternatives are understood.
- [Use cases](use-cases.md) develops actor goals into success and failure paths
  within a selected system boundary.
- The [value and evidence route](../reading-product-engineering.md#value-and-evidence)
  connects this research perspective to observable product results.

[^christensen-theory]: Christensen Institute, [Jobs to Be Done Theory](https://www.christenseninstitute.org/theory/jobs-to-be-done/).
[^strategyn-theory]: Strategyn, [What is Jobs-to-be-Done?](https://strategyn.com/jobs-to-be-done/jobs-to-be-done-playbook/what-is-jobs-to-be-done/).
[^rewired-framework]: Re-Wired Group, [What is the Jobs To Be Done framework?](https://therewiredgroup.com/learn/complete-guide-jobs-to-be-done/).
[^rewired-timeline]: Re-Wired Group, [The six stages of the buyers' timeline](https://therewiredgroup.com/learn/the-six-stages-of-the-buyers-timeline/).
[^rewired-demand]: Re-Wired Group, [What is Demand-Side Sales?](https://therewiredgroup.com/learn/demand-side-sales-101-stop-selling-and-help-your-customers-make-progress/).
[^rewired-demo]: Re-Wired Group, [JTBD Interview — Live Demonstration](https://therewiredgroup.com/news/blog-jtbd-interview-live-demonstration/); public outline.
[^strategyn-canvas]: Ulwick, [The Jobs-to-be-Done Canvas](https://strategyn.com/jobs-to-be-done-canvas/).
[^strategyn-job-map]: Strategyn, [Build Your Job Map](https://strategyn.com/jobs-to-be-done/jobs-to-be-done-playbook/build-your-job-map/).
[^ulwick-needs]: Ulwick, [Customer Needs Through a Jobs-to-be-Done Lens](https://strategyn.com/customer-needs-through-a-jobs-to-be-done-lens/).
[^strategyn-opportunity]: Strategyn, [Find Hidden Innovation Opportunity In The Market](https://strategyn.com/outcome-driven-innovation/market-opportunity/).
[^strategyn-measurement]: Strategyn, [Quantify Your Customers' Unmet Needs](https://strategyn.com/quantify-your-customers-unmet-needs/).
[^strategyn-odi]: Strategyn, [The Innovation Process](https://strategyn.com/outcome-driven-innovation-process/).
[^klement-interpretations]: Klement, [Know the Two — Very — Different Interpretations of Jobs to be Done](https://medium.com/the-job-to-be-done/know-the-two-very-different-interpretations-of-jobs-to-be-done-5a18b748bd89).
[^kalbach-synthesis]: Kalbach, [Drills and Milkshakes — Say Yes to the Mess](https://experiencinginformation.com/2020/10/23/drills-and-milkshakes-say-yes-to-the-mess/).
[^intercom-stories]: Adams, [How we accidentally invented Job Stories](https://www.intercom.com/blog/accidentally-invented-job-stories/).
[^klement-design]: Klement, [Designing features using Job Stories](https://www.intercom.com/blog/using-job-stories-design-features-ui-ux/).
[^cohn-stories]: Cohn, [Short Answers to Your Big Questions about User Stories](https://www.mountaingoatsoftware.com/agile/short-answers-to-your-big-questions-about-user-stories).
