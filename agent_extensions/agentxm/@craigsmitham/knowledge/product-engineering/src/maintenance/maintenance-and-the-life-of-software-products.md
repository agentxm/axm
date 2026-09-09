---
type: Explanation
title: Maintenance and the life of software products
description: How maintenance connects care, continuity, situated understanding, intervention, and responsibility for the software products people depend on.
tags: [product-engineering, pe-maintenance, maintenance, software-maintenance, care, craft, software-aging, program-comprehension, legacy-systems, deprecation]
status: draft
generated:
  by: codex/gpt-6
  at: 2026-09-09T02:19:37Z
sources:
  - id: care-introduction
    resource: https://crdia.org/les-cahiers-du-crdia/cahier-25-document-3/
    title: Denis and Pontille — Le soin des choses, authorized introductory excerpts
  - id: care-attention
    resource: https://crdia.org/wp-content/uploads/2023/09/C26D3.pdf
    title: Denis and Pontille — Le soin des choses, authorized excerpts on care and attention
  - id: care-interview
    resource: https://lejournal.cnrs.fr/articles/prendre-soin-des-choses-un-nouvel-horizon-pour-la-societe
    title: Denis and Pontille — CNRS interview on The Care of Things
  - id: care-city
    resource: https://lumieresdelaville.net/entretien-avec-jerome-denis-et-david-pontille-la-maintenance-prendre-soin-des-choses-cest-aussi-prendre-soin-des-humains/
    title: Denis and Pontille — Interview in Lumières de la Ville
  - id: material-ordering
    resource: https://www.csi.minesparis.psl.eu/working-papers/WP/WP_CSI_034.pdf
    title: Denis and Pontille — Material Ordering and the Care of Things (2013 working paper)
  - id: ukeles
    resource: https://queensmuseum.org/wp-content/uploads/2016/04/Ukeles-Manifesto-for-Maintenance-Art-1969.pdf
    title: Mierle Laderman Ukeles — Manifesto for Maintenance Art (1969)
  - id: mol
    resource: https://cup.columbia.edu/book/care-in-practice/9783837614473/
    title: Mol, Moser, and Pols — Care in Practice (2010), publisher account
  - id: puig
    resource: https://www.upress.umn.edu/9781452953472/matters-of-care/
    title: María Puig de la Bellacasa — Matters of Care (2017), publisher account
  - id: caye
    resource: https://lapenseeecologique.com/la-place-de-la-maintenance-et-du-travail-dans-le-systeme-productif-contemporain-et-dans-ses-necessaires-transformations/
    title: Pierre Caye — La place de la maintenance et du travail
  - id: morris
    resource: https://www.spab.org.uk/about-us/spab-manifesto
    title: Morris, Webb, and fellow founders — SPAB Manifesto (1877)
  - id: desilvey
    resource: https://www.upress.umn.edu/9780816694365/curated-decay/
    title: Caitlin DeSilvey — Curated Decay (2017), publisher account
  - id: closure
    resource: https://www.editionsdivergences.com/livre/heritage-et-fermeture
    title: Bonnet, Landivar, and Monnin — Héritage et fermeture (2021), publisher account
  - id: jackson
    resource: https://academic.oup.com/mit-press-scholarship-online/book/14976/chapter-abstract/169335302
    title: Steven J. Jackson — Rethinking Repair (2014), chapter abstract
  - id: parnas
    resource: https://cse.msu.edu/~chengb/RE-491/Papers/software-aging-parnas.pdf
    title: David Parnas — Software Aging (1994)
  - id: naur
    resource: https://pages.cs.wisc.edu/~remzi/Naur.pdf
    title: Peter Naur — Programming as Theory Building (1985)
  - id: ensmenger
    resource: https://homes.luddy.indiana.edu/nensmeng/posts/2016/04/05/maintainers/
    title: Nathan Ensmenger — The Art of Software Maintenance (2016)
  - id: eghbal
    resource: https://www.fordfoundation.org/learning/library/research-reports/roads-and-bridges-the-unseen-labor-behind-our-digital-infrastructure/
    title: Nadia Eghbal — Roads and Bridges (2016), report overview
  - id: deprecation
    resource: https://abseil.io/resources/swe-book/html/ch15.html
    title: Software Engineering at Google — Deprecation (2020)
---

# Maintenance and the life of software products

Much of the world we inhabit reaches us already made. We enter buildings, use
tools, and depend on arrangements whose histories and upkeep we only partly
understand. Software products join that world: people organize work around
them, accumulate information in them, and come to rely on their behavior.
Maintenance begins by attending to what makes their continuation possible.

What does it mean to care for a software product over time? This explanation
introduces maintenance through continuity, skilled attention, intervention,
and responsibility. Its perspective is informed by Jérôme Denis and David
Pontille's *The Care of Things* (*Le soin des choses*), care ethics, maintenance
art, and software scholarship. The connections between these traditions are
this document's synthesis; they do not constitute a single method endorsed by
all the authors.

The discussion asks what a maintainer learns to notice, what changes when the
object of care is a product people depend on, and why keeping something in
existence is a judgment rather than an unconditional good.

## Maintenance makes continuity possible

Denis and Pontille direct attention to ordinary work before and after dramatic
events. Celebrating a repair can obscure maintenance when the rescue captures
all the attention and the repeated care around it disappears. Maintenance
makes duration itself a subject of inquiry.[^care-introduction]

Their study of Paris Métro signs describes a useful relationship. Passengers
encounter a stable system of directions. Maintainers encounter particular
signs, their deterioration, and their repair needs. The dependable system
experienced by passengers depends on workers recognizing and responding to
those vulnerabilities.[^material-ordering]

Mierle Laderman Ukeles makes sustaining work visible through art. Her 1969
manifesto brings washing, cleaning, renewing, and supporting into the space of
artistic work. It questions the relationship between maintenance, freedom, and
the status of the person doing the work.[^ukeles] This introduces a question
that a purely functional definition misses: whose activity disappears from
view when we describe a thing as simply working?

In software, a familiar interface can conceal changes to dependencies,
infrastructure, support practices, and organizational knowledge. Consider an
illustrative invoice service used for many years. Customers still receive the
same recognizable documents while engineers update its runtime and support
staff interpret unusual invoices. Its apparent sameness does not tell us how
much work sustains it.

Maintenance, repair, and creation therefore overlap without becoming identical.
Repair responds to something judged broken. Maintenance includes attention to
what continues to function. Creation introduces new possibilities and new
dependencies; subsequent maintenance may itself involve invention. Jackson's
account of repair explicitly connects sustaining work with creativity,
knowledge, and power.[^jackson]

## What is being maintained?

A software product can be considered at several scopes: its implementation,
its behavior, the service people receive, or the arrangements through which
that service remains available. These scopes make different continuities
visible. Keeping a program unchanged may preserve its outputs while its fit
with users' circumstances deteriorates. Replacing a component may change the
implementation while sustaining a familiar service.

The analogy with physical things has a limit. Software does not wear out like
a bearing. Parnas distinguishes aging through failure to adapt to changing
needs from degradation caused by modifications made without understanding the
design. Both affect a product's viability. Elapsed time alone is an inadequate
explanation of its condition.[^parnas]

The invoice service makes the distinction concrete. Its export file may remain
byte-for-byte identical while customers move to accounting systems that cannot
read it. Here, implementation continuity no longer secures continuity of use.
Conversely, a rewritten exporter that preserves the required exchange may
support customers better without preserving the original code.

Care ethics broadens the object of attention. In discussing Fisher and Tronto,
Denis and Pontille connect care for things with the relationships and activities
they sustain.[^care-city] Applied to product engineering, this invites attention
to data, learned practices, integrations, expectations, and obligations, as
well as code. This application does not make every existing expectation binding:
it makes the consequences of changing one available for examination.

These distinctions explain why maintaining a product cannot be reduced to
maximizing the lifetime of every component. A particular implementation, a
customer commitment, and the capacity to provide a service may have different
futures. The scope chosen for analysis affects what counts as continuity or
loss.

## Attention, understanding, and the knowledge of particulars

Maintenance expertise includes learning to perceive what an unfamiliar
observer misses. Denis and Pontille describe inspection as active and
multisensory, drawing on Julian Orr's observations of repair work and Carlo
Ginzburg's account of interpreting clues. Even standardized objects acquire
particular conditions and histories.[^care-attention]

Software offers different evidence: behavior, dependencies, records of change,
data, and people's accounts of use. Our connection to skilled attention is
that these become meaningful through interpretation. A test can reveal a
rounding difference without establishing whether it is a defect. A support
conversation can reveal why a customer depends on it without showing whether
every customer does.

Naur's theory-building account treats programming as developing an
understanding of how a program addresses affairs in the world. His discussion
of modification explains why possession of program text and documentation may
not convey the understanding needed to change it.[^naur] This places knowledge
among the things whose continuity matters.

Suppose the invoice service rounds two classes of charge differently. One
interpretation is careless inconsistency. Another is that the difference
implements a customer agreement. Discovering that agreement changes the
meaning of the code and the consequences of simplifying it. In a contrasting
case, the same discrepancy originated in an accidental conversion error.
Historical persistence supplies evidence of existence, not sufficient reason
for preservation.

The craft is in connecting observations to an account that explains the
particular situation. Tests and documentation support that account; discussion
and investigation can expose its gaps. None independently determines which
behavior remains desirable. Product understanding and implementation
understanding meet here because the significance of a technical difference
depends on what it does in people's work.

## Intervention, restraint, and change

Care involves responsiveness to the thing encountered. Denis and Pontille
describe graffiti removers feeling paint and walls to judge an intervention
that will remove a mark without damaging the surface. They describe this
engagement as material diplomacy.[^care-interview] Mol, Moser, and Pols's
*Care in Practice* similarly foregrounds persistent tinkering with changing,
sometimes surprising technologies.[^mol]

The engineering connection is a tension between intended improvement and the
disturbance introduced by intervention. Refactoring can clarify a structure;
a replacement can remove a constraint; either can unsettle behavior that
others rely on. The size of a textual edit does not establish the size of its
consequences. Parnas's account of change-induced aging makes the danger of
poorly understood intervention explicit.[^parnas]

Restraint also has a history. The SPAB manifesto, written by Morris, Webb, and
fellow founders, favors daily protection and preservation of historical fabric
over restoration that erases it.[^morris] Its commitment is specific to built
heritage. Software's original implementation need not carry the same value as
an original wall or carving. What transfers is the question of what an
intervention might erase; the answer depends on the object and its setting.

For the invoice service, retaining an old export may protect a customer's
working integration. Once that customer has moved away, the same export may
preserve only avoidable complexity. An unchanged technical artifact can thus
call for a different judgment when its relationships change.

Care neither guarantees minimal change nor selects a particular replacement
strategy. It directs attention to the conditions and consequences of action.
The judgment concerns which intervention fits the situation, including what
is known, what remains uncertain, and whose continuity is at stake.

## The people and institutions that sustain products

An account centered only on a perceptive craftsperson would leave out the
conditions that make their work possible. Ensmenger places software maintenance
within a history of necessary, difficult work whose status has often been
low.[^ensmenger] Eghbal's research brings attention to the labor and support
behind widely used open-source infrastructure.[^eghbal]

Caye offers a broader economic argument: production depends on sustaining its
conditions of possibility, including infrastructure, natural resources, and
institutions such as education. Production can exhaust those conditions even
while producing more output.[^caye] This helps frame maintenance as part of
what makes productive activity possible.

In product engineering, that perspective brings available attention, retained
knowledge, upstream support, and authority into the account of maintainability.
A clear codebase still needs people with the time and means to respond. A
product's dependencies can distribute that responsibility beyond its immediate
team without distributing the resources needed to carry it.

If only one engineer understands the invoice service's agreements, their
departure changes its maintenance conditions even when the repository is
untouched. If that engineer has continually absorbed unexplained exceptions
through personal effort, apparent reliability may conceal a fragile working
arrangement. Describing this as their individual diligence misses the
institutional dependence.

Care ethics also raises questions of asymmetry. Denis and Pontille emphasize
that dependence and care can sustain unequal relationships; care is not
automatically benign.[^care-interview] The corresponding engineering questions
concern who receives continuity, who bears its costs, and who can challenge the
arrangements. Those questions qualify the claim that a product is healthy
merely because it remains available.

## What deserves to continue?

Maintenance gives existing arrangements a future. That includes their benefits
and their harms. Puig de la Bellacasa's *Matters of Care* places care within
ethical and political relations extending beyond humans.[^puig] Such a
perspective makes the choice of what receives attention part of the subject.

Related traditions offer different accounts of endings. DeSilvey's *Curated
Decay* examines heritage care that accommodates deterioration and
transformation.[^desilvey] Bonnet, Landivar, and Monnin's *Héritage et fermeture*
addresses inherited infrastructures that sustain present life while damaging
its future conditions. Closure and dismantling become matters of collective
responsibility and justice.[^closure] These arguments differ in their objects
and aims; neither establishes a general rule for retiring software.

They help make an engineering distinction intelligible: care for people
dependent on a product does not require preserving that product indefinitely.
Google's deprecation account describes removal as engineering work and explains
why consumer migration costs matter. It distinguishes age from obsolescence
and recognizes that badly executed deprecation can outweigh the benefits of
removal.[^deprecation]

Retiring the invoice service's last export format may simplify its
implementation while abruptly transferring work to customers. Continuing it
indefinitely may consume capacity needed elsewhere. The relevant question is
what obligations persist, what alternatives people have, and how the burdens
of continuation or withdrawal are distributed. A technical account of unused
code cannot resolve that question when the feature is still used outside the
team's field of view.

The landscape therefore includes preservation, adaptation, replacement, and
ending. The art of maintenance lies partly in recognizing which continuity
matters and developing a defensible understanding of what sustaining it asks
of people, technology, and their surroundings.

## Reading further and connections within product engineering

The sources offer several routes into this landscape:

- **Care and attention:** Denis and Pontille connect observation of maintenance
  work with care ethics. The authorized excerpts support this account of their
  book; interviews and the earlier paper supply additional context. Ukeles
  opens the artistic and political question of whose sustaining work is seen.
- **Understanding software over time:** Parnas examines aging and the effects
  of intervention; Naur examines the knowledge involved in programming and
  modification. Their accounts illuminate different parts of the problem.
- **Labor and the conditions of continuation:** Ensmenger and Eghbal connect
  software to maintenance history and infrastructure labor; Caye offers an
  argument about the conditions on which production depends.
- **Preservation and endings:** Morris, DeSilvey, and Bonnet and colleagues
  represent different commitments concerning heritage, transformation, and
  closure. Google's deprecation chapter develops a software-specific account.

This explanation belongs to the [maintenance section](index.md), whose
perspective applies throughout a product's life. [Foundations](../foundations/)
connects it to other ways of understanding products and their domains.
[Problem framing](../problem/) examines what matters to users;
[solution and requirements](../solution/) express commitments;
[engineering](../engineering/) develops and verifies implementations;
[delivery](../delivery/) moves changes toward release; and
[operations](../operations/) addresses the running service, including its
shutdown. These are complementary responsibilities rather than a sequence
ending in a maintenance handoff.

[^care-introduction]: Denis and Pontille, [authorized introductory excerpts](https://crdia.org/les-cahiers-du-crdia/cahier-25-document-3/), French edition; endnotes omitted by the excerpt publisher.
[^care-attention]: Denis and Pontille, [authorized excerpts on care and attention](https://crdia.org/wp-content/uploads/2023/09/C26D3.pdf), French edition; endnotes omitted by the excerpt publisher.
[^care-interview]: Denis and Pontille, [CNRS interview](https://lejournal.cnrs.fr/articles/prendre-soin-des-choses-un-nouvel-horizon-pour-la-societe).
[^care-city]: Denis and Pontille, [interview in Lumières de la Ville](https://lumieresdelaville.net/entretien-avec-jerome-denis-et-david-pontille-la-maintenance-prendre-soin-des-choses-cest-aussi-prendre-soin-des-humains/); Fisher and Tronto attribution is indirect through this discussion.
[^material-ordering]: Denis and Pontille, [Material Ordering and the Care of Things](https://www.csi.minesparis.psl.eu/working-papers/WP/WP_CSI_034.pdf).
[^ukeles]: Ukeles, [Manifesto for Maintenance Art](https://queensmuseum.org/wp-content/uploads/2016/04/Ukeles-Manifesto-for-Maintenance-Art-1969.pdf).
[^mol]: Mol, Moser, and Pols, [Care in Practice](https://cup.columbia.edu/book/care-in-practice/9783837614473/), publisher account.
[^puig]: Puig de la Bellacasa, [Matters of Care](https://www.upress.umn.edu/9781452953472/matters-of-care/), publisher account.
[^caye]: Caye, [La place de la maintenance et du travail](https://lapenseeecologique.com/la-place-de-la-maintenance-et-du-travail-dans-le-systeme-productif-contemporain-et-dans-ses-necessaires-transformations/).
[^morris]: Morris, Webb, and fellow founders, [SPAB Manifesto](https://www.spab.org.uk/about-us/spab-manifesto).
[^desilvey]: DeSilvey, [Curated Decay](https://www.upress.umn.edu/9780816694365/curated-decay/), publisher account.
[^closure]: Bonnet, Landivar, and Monnin, [Héritage et fermeture](https://www.editionsdivergences.com/livre/heritage-et-fermeture), publisher account.
[^jackson]: Jackson, [Rethinking Repair](https://academic.oup.com/mit-press-scholarship-online/book/14976/chapter-abstract/169335302), chapter abstract.
[^parnas]: Parnas, [Software Aging](https://cse.msu.edu/~chengb/RE-491/Papers/software-aging-parnas.pdf).
[^naur]: Naur, [Programming as Theory Building](https://pages.cs.wisc.edu/~remzi/Naur.pdf).
[^ensmenger]: Ensmenger, [The Art of Software Maintenance](https://homes.luddy.indiana.edu/nensmeng/posts/2016/04/05/maintainers/).
[^eghbal]: Eghbal, [Roads and Bridges](https://www.fordfoundation.org/learning/library/research-reports/roads-and-bridges-the-unseen-labor-behind-our-digital-infrastructure/), report overview.
[^deprecation]: [Software Engineering at Google, Deprecation](https://abseil.io/resources/swe-book/html/ch15.html).
