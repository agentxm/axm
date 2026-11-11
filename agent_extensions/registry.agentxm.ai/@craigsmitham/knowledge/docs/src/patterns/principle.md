---
type: Pattern
title: Principle document
description: When recurring decisions need durable direction, document the good sought, its warrant, scope, and practical implications so readers can exercise situated judgment.
tags:
- docs
- principle
- normative
- judgment
- practical-reason
- explainer
- documentation-pattern
- pattern
- authoring
status: draft
sources:
- id: frame-christian-life
  resource: https://frame-poythress.org/wp-content/uploads/2014/04/John-Frame-Doctrine-of-the-Christian-Life-Excerpt.pdf
  title: John Frame — The Doctrine of the Christian Life (excerpt)
- id: frame-perspectivalism
  resource: https://frame-poythress.org/a-primer-on-perspectivalism-revised-2008/
  title: John Frame — A Primer on Perspectivalism
- id: poythress-biblical-problems
  resource: https://frame-poythress.org/approaching-biblical-problems/
  title: Vern Poythress — Approaching Biblical Problems
- id: poythress-redeeming-reason
  resource: https://frame-poythress.org/wp-content/uploads/2024/06/PoythressVernRedeemingReason.pdf
  title: Vern Poythress — Redeeming Reason
- id: odonovan-created-order
  resource: https://globalfacultyinitiative.net/content_item/320
  title: Oliver O'Donovan — Created Order / Theology
- id: odonovan-love
  resource: https://globalfacultyinitiative.net/fi_pdf/get_document.php?id=1607
  title: Oliver O'Donovan — The Sovereignty of Love
- id: odonovan-virtue
  resource: https://globalfacultyinitiative.net/fi_pdf/get_document.php?id=462
  title: Oliver O'Donovan — The Place of Virtue Theory in Christian Ethics
- id: odonovan-judgment
  resource: https://firstthings.com/government-as-judgment/
  title: Oliver O'Donovan — Government as Judgment
- id: agile-principles
  resource: https://agilemanifesto.org/principles.html
  title: Principles behind the Agile Manifesto
- id: zen-python
  resource: https://peps.python.org/pep-0020/
  title: PEP 20 — The Zen of Python
generated: { by: codex/gpt-6, at: 2026-11-11T19:52:17Z }
---

# Principle document

A **principle document** makes a durable direction for judgment understandable
and usable. This pattern concerns how to communicate a principle; the principle
itself remains a normative claim, not a documentation pattern.

## Design problem and context

People face recurring decisions whose circumstances vary too much for one
procedure. They need a shared direction and a reason to trust it. A memorable
maxim can travel well but lose its warrant and limits; an exhaustive rule set
can obscure the good it was meant to serve.

Use this pattern when there is a defensible good or commitment to articulate
and a recurring field of judgment. If a specific obligation or procedure is
needed, document its actual authority or execution requirements directly.

## Design response and tradeoffs

Give the principle a recognizable name and concise statement, then connect it
to the good sought, sources and authority, scope, practical implications, and
tensions. Use contrasting judgment cases to show how circumstances affect its
application. Keep supporting rules and procedures separately maintainable.

- **Memorability versus qualification:** preserve a clear direction while
  making exceptions and competing goods discoverable.
- **Durability versus applicability:** express what carries across situations
  and show enough concrete cases to guide present decisions.
- **Shared direction versus local judgment:** state the claim's force without
  implying that a name or citation settles every application.

The document supplies reasons people can discuss and apply consistently.
Maintaining those reasons and cases costs more than publishing a slogan.
Unclear authority can turn advice into an accidental mandate.

## The principle being communicated

A **principle** is a sourced, action-directing articulation of a recognized
good. It gives durable orientation to judgment without pretending to determine
every situation mechanically.

The principle names more than a preference: it identifies what should guide a
class of decisions and why. Its authority, scope, and strength must remain
visible. A professional principle may be defeasible and open to revision; a
policy or moral obligation may carry different force. Calling each of them a
principle does not make their claims equivalent.

## Orientation

| | |
| --- | --- |
| **Reader need** | Understand and use a durable direction for judgment |
| **Success** | The reader can explain the good served, recognize relevant situations, deliberate among tensions, and reach a defensible local judgment |
| **Voice** | Normative but reason-giving: *prefer, preserve, avoid, separate, depend on* — followed by why and within what scope |
| **Typical prompt** | *What should guide this kind of decision, and how do I apply it without turning it into a slogan?* |
| **Title cue** | A stable name or maxim for the direction, not one implementation or outcome |

## From good to action

A principle sits within a larger movement of practical reasoning:

```text
recognized good or order ──→ principle ──────────┐
                                                 ├─→ situated judgment ─→ action
experience and knowledge of the situation ──────┘
```

The **good** is what deserves pursuit, protection, truthful representation, or
appropriate ordering. The **principle** expresses a general direction that
serves it. A **judgment** determines what that direction requires in one actual
situation. An **action** embodies the judgment. Practical experience informs
judgment without determining every future decision.

O'Donovan distinguishes goods from principles by their practical direction:
goods and objective order are prior, while principles direct action. He also
warns that norms alone do not yield effective agency without a worthwhile end.
Adapted beyond his explicitly Christian moral theology, the documentation
lesson is that a principle should state the good it serves rather than float as
an unexplained imperative.[^odonovan-created-order][^odonovan-love]

## Norm, situation, and practitioner

Frame describes judgment as applying a norm to a situation by a person.
Poythress likewise treats normative, situational, and existential perspectives
as interdependent: proper attention to a norm includes the world in which it
applies and the people whose action, motives, and character are
implicated.[^frame-christian-life][^frame-perspectivalism][^poythress-biblical-problems][^poythress-redeeming-reason]

Used as documentation lenses rather than a mandatory theological framework:

| Lens | A principle document must answer |
| --- | --- |
| **Normative** | What direction is claimed, what good warrants it, and how much force does it carry? |
| **Situational** | Which facts, purposes, constraints, consequences, and competing goods affect its application? |
| **Practitioner** | What perception, competence, motive, restraint, or disposition does sound use require? |

These are perspectives on one act of judgment, not three ceremonial sections.
A principle without situations and practitioners is a slogan. A principle
without a stable normative claim is merely a collection of cases.

## Canonical anatomy

No page template is universal, but a sound principle normally makes this
semantic core discoverable:

| Element | Question it answers |
| --- | --- |
| **Name and formulation** | What durable direction does this name stand for? |
| **Good sought or protected** | What worthwhile quality, relationship, or order makes the direction matter? |
| **Warrant and provenance** | Why trust this claim, and where did its wording and authority come from? |
| **Normative strength** | Is it an aspiration, default, professional principle, organizational commitment, or binding rule? |
| **Scope and field** | Which decisions, actors, systems, and conditions bring it into play? |
| **Practical implications** | Toward what choices does it ordinarily direct judgment? |
| **Tensions and limits** | Which other goods, principles, or conditions qualify its application? |
| **Practitioner demands** | What judgment, knowledge, motive, or disposition does faithful use require? |
| **Cases** | How does it illuminate contrasting situations without becoming a case-specific rule? |
| **Misreadings** | How is the maxim commonly narrowed, absolutized, or detached from its good? |
| **Relationships** | Which principles, practices, rules, and decisions interpret or enact it? |

The formulation and good form the minimum conceptual spine. Scope, tensions,
and cases make application responsible. Provenance prevents a popular slogan
from silently replacing its source. Practitioner demands expose why correct
words can still produce poor judgment.[^odonovan-virtue]

## Normative strength and authority

Do not imply more authority than the source supplies. State both **who or what
authorizes the claim** and **what kind of claim it is**.

| Form | Distinctive force |
| --- | --- |
| **Good or value** | Identifies what is worthy of pursuit or protection; does not by itself specify action |
| **Principle** | Gives a general direction for judgment in service of a good |
| **Heuristic** | Supplies a useful default or shortcut under uncertainty; expects exceptions |
| **Rule or policy** | Requires or prohibits specified conduct within an authority and scope |
| **Standard** | [Establishes a recognized basis for judgment or coordination](../explainers/standard.md), often through criteria, requirements, and a conformance process |

A familiar maxim can operate differently in different hosts. One team may use
it as a conversational heuristic; another may encode a narrow implication as a
review policy. Preserve that distinction rather than allowing the memorable
name to smuggle in enforcement.

## Neighboring artifacts

| Artifact | Difference from a principle |
| --- | --- |
| **Value statement** | Names what matters but may not direct a class of decisions |
| **Rule or policy** | Makes a determinate demand under an authority; may operationalize one implication of a principle |
| **Standard** | Supplies a recognized basis for assessing or coordinating a defined field; may embody several principles without replacing their goods and rationale |
| **Practice** | [Socially sustained structure of meaningful participation](../explainers/practice.md); may embody, interpret, ignore, or contradict a principle, but is not reducible to its explicit principles |
| **How-to guide** | Directs actions toward one concrete outcome in a real situation |
| **Decision record** | Preserves one judgment and its context; several records may reveal how a principle is interpreted |
| **Aphorism or maxim** | Is a concise linguistic form; without warrant, scope, and judgment it may be only a slogan |
| **Collection** | Groups related principles; a named acronym may be a collection rather than one indivisible principle |

## Principles and particular judgment

O'Donovan presents moral reasoning as movement from attention and reflection
through deliberation to action. His account of judgment also distinguishes a
generic principle from the particular judgment in which it is interpreted,
while requiring judgment to be both truthful and practically
effective.[^odonovan-judgment]

For portable professional guidance, that means examples should demonstrate
**reasoning**, not merely compliance. Use at least two cases in which different
facts or competing goods lead the same principle to different actions. The
principle has done useful work when the reader can explain both outcomes
without treating either as an exception invented after the fact.

## Quality signals

- The principle can be stated briefly without the brief statement carrying the
  whole burden of explanation.
- The good served is more specific than “quality,” “best practice,” or “doing
  things right.”
- The source, development, and present authority of the formulation are clear.
- Its normative force is explicit; advice does not masquerade as policy.
- Scope and contraindications let a reader reject an application confidently.
- Tensions name legitimate competing goods instead of framing disagreement as
  ignorance or bad faith.
- Contrasting cases expose the work of judgment rather than reward mechanical
  keyword matching.
- Practitioner demands include perception and competence, not only motives.
- Linked examples and practices are examples of enactment, not substitutes for
  the principle's rationale.

## Failure modes

- **Slogan preservation** — the maxim is repeated while its good, meaning, and
  source remain unexplained.
- **Authority laundering** — preference is presented as obligation because a
  respected name or acronym is attached.
- **Rule collapse** — a general direction is treated as an algorithm that
  settles every case.
- **Good omission** — readers are told what to prefer but not what worthwhile
  reality the preference serves.
- **Single-good vision** — one legitimate good crowds out every other concern.
- **Context-free cases** — examples show approved answers without the facts or
  reasoning that made them appropriate.
- **Virtue substitution** — admirable character language replaces a practical
  direction, or the principle ignores what sound action demands of the agent.
- **Example substitution** — one favored realization is mistaken for the
  principle itself.
- **Historical flattening** — later shorthand silently replaces the original
  claim or merges a collection into one principle.

## Authoring steps

1. **Classify the claim before naming it.** Determine whether the material is
   a good, principle, heuristic, rule, standard, practice, or one
   decision. Do not promote advice to a principle merely because it is concise
   or widely repeated.

2. **Recover provenance.** Find the earliest reliable formulation you can,
   important later refinements, and current authoritative uses. Distinguish an
   originator's claim from popular shorthand. Record disputes when the name is
   shared but the meanings differ.

3. **Identify the good.** State the worthwhile quality, relationship, or order
   the principle seeks to protect or realize. Ask what would be damaged if the
   direction were ignored and what would be distorted if it were absolutized.
   Replace empty answers such as “quality” or “best practice” with the actual
   good.[^odonovan-created-order]

4. **Write the action-directing formulation.** Use a short imperative or
   preference that names the durable direction without pretending to settle
   implementation. Preserve established wording when accuracy and recognition
   warrant it; otherwise separate an original quotation from your clarifying
   restatement.

5. **State normative strength and authority.** Say whether the claim is an
   aspiration, default, heuristic, professional principle, organizational
   commitment, or binding rule. Name who accepts or enforces it. A portable
   principle should not silently inherit the authority of one host's policy.

6. **Define the field of application.** Identify the decisions, actors,
   systems, timescales, and preconditions for which the principle is relevant.
   State obvious non-goals. A reader should be able to recognize when the
   principle has no claim on the decision.

7. **Surface tensions among goods.** Name legitimate concerns that can pull in
   another direction. Explain what facts make one concern more salient and
   which consequences must be considered. Do not reduce every disagreement to
   a violation of the featured principle.

8. **Check norm, situation, and practitioner.** Confirm that the draft states
   the direction and warrant, describes the field in which it is judged, and
   identifies the perception, competence, motive, or disposition responsible
   use demands. Use these as interlocking review lenses rather than mandatory
   headings.[^frame-christian-life][^poythress-redeeming-reason][^odonovan-virtue]

9. **Write contrasting judgment cases.** Include at least two cases where the
   principle is relevant but different circumstances lead to different
   actions. Show the facts, competing goods, deliberation, and conclusion. Add
   a counterexample that looks compliant while betraying the principle's
   good.[^odonovan-judgment]

10. **Separate the principle from its enactments.** Link examples that embody
    it, practices that cultivate it, rules that operationalize a narrow
    implication, and decision records that show application. Do not let one
    example, tool, or architecture become the definition.

11. **Document misreadings and overapplication.** Test the maxim against its
    most common literal, narrow, and absolutized readings. Explain why each
    distortion is attractive and how returning to the good, field, or
    competing concerns corrects it.

12. **Write for recognition and depth.** Make the name, formulation, good, and
    normative strength scannable. Put scope and decision prompts next. Keep
    provenance, cases, relationships, and deeper rationale discoverable
    without forcing a library browser through the full argument.

13. **Review the judgment, not only the prose.** Ask a domain practitioner to
    challenge the good, warrant, field, and cases. Ask a less-familiar reader
    to classify the claim and apply it to a fresh scenario. Revise when either
    reader can only repeat the slogan or copy an example.

14. **Assign ownership and revisit the claim.** Preserve stable identity while
    evidence, terminology, technology, or institutional authority changes.
    Deprecate a superseded principle with its replacement and rationale rather
    than silently rewriting history.

## Draft shape

Use the host's conventions. This is a drafting aid, not a required schema:

```markdown
# Principle name

Concise action-directing formulation.

## Good sought or protected
## Warrant and provenance
## Normative strength
## Scope
## Practical implications
## Tensions and limits
## Demands on the practitioner
## Judgment cases
## Misreadings
## Related principles, practices, and rules
```

Combine sections when the argument reads more clearly, but keep the good,
direction, strength, and field easy to locate.

## Writing judgment cases

Use a parallel shape so cases reveal reasoning rather than merely approved
answers:

| Case element | What to show |
| --- | --- |
| **Decision** | The concrete choice the practitioner faces |
| **Relevant facts** | Conditions that materially affect application |
| **Goods and tensions** | What the principle protects and what else matters |
| **Practitioner demands** | Knowledge, perception, competence, or restraint required |
| **Judgment** | The chosen direction and why it fits this case |
| **Enactment** | The resulting action, rule, practice, or chosen approach |

Prefer diverse cases over repeated descendants of one canonical example. A
case may be synthetic for teaching, but label it honestly and never present it
as evidence of historical origin or effectiveness.

## Review checks

- Can the principle be distinguished from the good it serves and the rules or
  examples that enact it?
- Does provenance support the wording and attributed authority?
- Is the normative strength explicit and proportionate?
- Can a reader recognize both applicability and non-applicability?
- Are competing goods and liabilities treated as real rather than as excuses?
- Do cases expose the work of judgment and permit different sound outcomes?
- Does the document identify what responsible use requires of the
  practitioner?
- Are common slogans and historical restatements separated from the source?
- Do relationships say whether another artifact supports, qualifies,
  operationalizes, exemplifies, or conflicts with the principle?

## Done when

The entry can be recognized, sourced, interpreted, applied, and challenged; it
connects a worthwhile good to practical direction; its authority and strength
are honest; contrasting cases demonstrate judgment rather than rote
compliance; enactments remain distinct; and a named owner can revise or
deprecate it as understanding changes.

## Before writing

- A recurring class of decisions for which durable direction would help
- A plausible source, tradition, body of evidence, or accountable authority
  for the normative claim
- Enough domain knowledge to distinguish the good served from one favored
  implementation
- Cases that can test scope, tensions, and application
- A host location with lifecycle and ownership conventions when the principle
  will join a maintained collection

## Authoring pitfalls

- **Maxim first** — polishing memorable words before recovering the good and
  claim they are meant to carry.
- **Definition by implementation** — allowing one example or code idiom to
  become the principle.
- **Policy leakage** — presenting local enforcement as portable normative
  authority.
- **Exception lists** — accumulating arbitrary carve-outs instead of naming
  the competing goods and facts that guide judgment.
- **Case verdicts** — showing right answers without enough reasoning to
  transfer to a new case.
- **Citation decoration** — naming respected authors without tracing which
  formulation, interpretation, or authority the source supports.
- **Collection collapse** — documenting an acronym or school as one principle
  when its members make distinct claims.
- **Mechanical review** — checking headings while leaving the normative claim,
  field, and judgment incoherent.

## Example and evidence

An illustrative principle document, **Keep one authority for each maintained
fact**, would explain the good of consistency, identify its warrant and scope,
and distinguish copying for convenience from generated views with a maintained
source. Judgment cases would expose the costs of central ownership and the
limits of the direction. This is an example, not an adopted policy.

The [Agile Manifesto principles](https://agilemanifesto.org/principles.html)
connect directions for software work to valued outcomes.
[The Zen of Python](https://peps.python.org/pep-0020/) presents memorable design
directions with tensions and qualifications; its PEP is explicitly
informational. Both demonstrate communication of durable direction in compact
form, rather than this page's fuller proposed treatment.

This pattern description is a draft synthesis. The philosophical sources
below inform its account of judgment, and the public examples show principle
articulation. They do not establish recurrence or effectiveness of every
element of the proposed document design.

## Related

- [Explanation](explanation.md) — develops supporting concepts and reasoning
  when they need a separate treatment.
- [Playbook](playbook.md) — applies directions for judgment to assessment and
  response in a recurring family of situations.
- [How-to guide](how-to.md) — documents a particular implementation or task
  without narrowing the principle to that one realization.
- [Documentation craft](../explainers/documentation-craft.md) — selecting and combining documentation patterns.
- [Writing a document](../explainers/documentation-craft.md) — the shared authoring process.

[^frame-christian-life]: John Frame — *The Doctrine of the Christian Life* (excerpt)

[^frame-perspectivalism]: John Frame — *A Primer on Perspectivalism*

[^poythress-biblical-problems]: Vern Poythress — *Approaching Biblical Problems*

[^poythress-redeeming-reason]: Vern Poythress — *Redeeming Reason*

[^odonovan-created-order]: Oliver O'Donovan — *Created Order / Theology*

[^odonovan-love]: Oliver O'Donovan — *The Sovereignty of Love*

[^odonovan-virtue]: Oliver O'Donovan — *The Place of Virtue Theory in Christian Ethics*

[^odonovan-judgment]: Oliver O'Donovan — *Government as Judgment*
