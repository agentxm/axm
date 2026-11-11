# Documentation craft update log

## 2026-11-11

- **Prune:** Retired duplicate craft/workflow recipes and centralized audit presentation in its report contract; removed arbitrary action and publication sequencing.

- **Checklist patterns**: Migrated the standalone checklist-design skill's
  durable guidance into [Checklist](patterns/checklist.md) and five draft
  specializations: [Execution](patterns/execution-checklist.md),
  [Verification](patterns/verification-checklist.md),
  [Readiness](patterns/readiness-checklist.md),
  [Reporting and review](patterns/reporting-review-checklist.md), and
  [Learning](patterns/learning-checklist.md). Preserved artifact fit, item and
  interaction design, coordination, evidence, validation, and lifecycle guidance.
- **Checklist distinctions**: Separated purpose from read-do, do-confirm, and
  challenge-response interaction choices. Replaced fixed response statuses and
  decision-gate scripting with adaptable authoring guidance. Kept reported
  completion, observed execution, quality, and independent learning distinct.
- **Checklist provenance**: Recorded the original 0.1.10 source revision and
  claim-specific external sources. Added illustrative cases, tradeoffs, and
  evidence limits; the new formulations are drafts, not field-validated aids.
  Corrected the regulated-learning source attribution to Shao and colleagues.
- **Checklist discovery and retirement**: Routed checklist authoring through
  the docs skill, expanded collection and catalog discovery, and removed the
  standalone skill from this repository and its managed projections. Archived
  its registry identity and confirmed the published 0.1.10 entry remains in
  the archived package's history. Docs
  knowledge 0.15.0, skill 0.6.0, and pack 0.9.0 carry the replacement.
- **Pattern collection**: Consolidated explanations and authoring guidance for
  [Tutorial](patterns/tutorial.md), [How-to guide](patterns/how-to.md),
  [Reference](patterns/reference.md), [Explanation](patterns/explanation.md),
  [Principle document](patterns/principle.md), [Playbook](patterns/playbook.md),
  and [Runbook](patterns/runbook.md), and added
  [Pattern description](patterns/pattern-description.md) and
  [Pattern collection](patterns/pattern-collection.md).
- **Canonical guidance**: Moved the temporary standalone patterns skill's
  concepts, mining, evidence, authoring, review, and collection maintenance
  guidance into the two new entries. Preserved the Wirfs-Brock and collaborators
  sources and their claim boundaries. The docs skill routes to this knowledge;
  it also handles pattern descriptions and collections across domains.
- **Design guidance**: Made recurring problems, applicability, design responses,
  tradeoffs, evidence limits, and useful relationships explicit. Preserved the
  detailed authoring guidance. The seven newly formulated descriptions are
  drafts; playbook and runbook retain their established descriptions and status.
- **Evidence and terminology**: Distinguished observed documentation features
  from illustrative examples and reader-outcome evidence. Used pattern collection
  consistently with Wirfs-Brock and Hvatum, and distinguished document designs
  from the principles or design patterns they communicate.
- **Pattern description refinements**: Added memorable names and standalone
  thumbnails, properties and strategies, contrasting realizations and non-fit
  cases, and explicit reader decisions. Distinguished unsuitable conditions,
  costs during appropriate use, and overuse effects. Added a fresh-case authoring
  check without treating it as independent validation.
- **Collection refinements**: Preserved contextual counterbalances, added
  situation, introduction, lookup, and story routes, and kept complementary
  views tied to maintained meanings and evidence. Clarified flexible sequences
  and feedback from application, distinguishing value to authors, practitioners,
  and people affected by designs. These refinements synthesize Cockburn's 2023
  talk and Wirfs-Brock and collaborators' papers; their experience reports do
  not establish universal templates, fixed thresholds, or proven outcomes.
- **Packaging**: Removed the unpublished standalone patterns skill and its
  workspace projections. The docs pack continues to contain only the docs
  skill and knowledge bundle, with no additional dependency.
- **Discovery**: Updated descriptions, indexes, links, and skill routing.
  Retained broader documentation foundations and workflows, including
  [Comparing concepts](guides/comparing-concepts.md).
- **Compatibility**: Docs knowledge 0.14.0 changes concept IDs. The pack README
  records the mappings, including former general pattern concepts; old paths
  are removed rather than retained as duplicate pages. Docs skill 0.5.0 and
  pack 0.8.0 use the new routes.

## 2026-10-30

- **Pattern alignment**: Revised Pattern explainer (removed),
  Pattern guide (removed), and Pattern collection guidance (removed)
  against Rebecca Wirfs-Brock's writings with Christian Kohls and Lise Hvatum.
  Distinguished patterns, descriptions, and instances; clarified degrees of
  generativity and the role of situated judgment; retained evidence and
  candidate-labeling requirements.
- **Authoring and use**: Added reader-informed authoring, review priorities
  informed by pattern smells, collection feedback and value guidance, and an
  illustrative operational-documentation sequence. Added claim-specific source
  attribution, identified the 2026 preprints, and refreshed previews and the
  terminology in [Documentation craft](explainers/documentation-craft.md).

## 2026-09-10

- **Clarification**: Revised [Playbook](patterns/playbook.md) around assessment,
  response choice, adaptation, and coordination, and [Runbook](patterns/runbook.md)
  around repeatable execution of a bounded task. Removed strict linearity and
  automation exclusions; included routine operational work and independent or
  shared use of runbooks.
- **Evidence and examples**: Added claim-specific primary-source citations and
  paired illustrative checkout-response and deployment-rollback examples.
  Refreshed both pattern previews and the terminology in
  [Documentation craft](explainers/documentation-craft.md),
  [Practice](explainers/practice.md), and
  Pattern collection guidance (removed).

## 2026-09-08

- **Explanation craft**: Expanded [Explanation explainer](patterns/explanation.md)
  with principles for conceptual structure, consequential distinctions,
  classification judgment, examples that develop reasoning, fair treatment of
  perspectives, implications and limits, and assessable understanding outcomes.
  These are practical lessons from the DDD and JTBD authoring cases, not a
  universal outline or a claim of evaluated reader comprehension.
- **Authoring**: Revised [Explanation guide](patterns/explanation.md) to apply the
  principles through outcome definition, concept mapping, source comparison,
  outline design, example development, and review. Clarified that practical
  criteria and structured comparisons can serve explanation; refreshed both
  index previews and qualified the matching rule of thumb in
  [Reference explainer](patterns/reference.md).

- **Split**: Divided the oversized [Standard](explainers/standard.md) explainer
  in two. The anchor concept keeps the definition, purposes, the norm/document
  senses, what standards standardize, levels of expectation, standards within
  practices, reader-need presentation, neighboring concepts, and failure modes.
- **Creation**: Added [Standard authority and
  conformance](explainers/standard-authority-and-conformance.md) carrying the
  goods-to-judgment chain, warrant / standing / application, sources and degrees
  of authority, criteria and evidence, and the limits of a conformance claim.
- **Discovery**: Narrowed the Standard description to its retained scope, added
  the new concept to the explainers index with a routing note, and cross-linked
  the two concepts in both directions. No content was dropped in the split.

## 2026-08-26

- **Action-document discovery**: Required Guide descriptions and other
  context-free previews to pair the supported outcome with the observable
  situation, event, symptom, or reader intent that makes the document
  relevant, while keeping selection conditions distinct from preconditions.
- **Guide migration**: Revised all ten Guide descriptions and their index
  entries to demonstrate the routing contract; retained literal event triggers
  for event-driven work rather than forcing them onto every guide.
- **Authoring and audit**: Connected the contract to how-to authoring,
  documentation organization, search discovery, and corpus assessment.

## 2026-08-21

- **Pattern**: Added [Concept boundaries](guides/comparing-concepts.md) for
  giving recurring cross-concept comparisons one substantive authority while
  keeping indexes navigational and individual definitions canonical.
- **Organization**: Connected the concept-boundary pattern to the organizing
  and naming workflow so recurring distinctions are not duplicated across
  concept pages or expanded inside indexes.

## 2026-08-15

- **Update**: Expanded bundle discovery metadata to name documentation naming
  and information architecture explicitly, making the existing organizing and
  naming guidance easier to find before a document exists.
- **Creation**: Added [Documentation
  audits](explainers/documentation-audits.md) and [Documentation audit report contract](guides/auditing-documentation.md) to distinguish corpus-level
  diagnosis from review, linting, verification, and remediation and to define
  evidence, coverage, findings, and handoff.
- **Creation**: Added [Documentation organization and
  discovery](explainers/documentation-organization-and-discovery.md) and
  [Organizing and naming
  documentation](guides/organizing-and-naming-documentation.md) to distinguish
  form-first from subject-first organization, define semantic adjacency, and
  make folders, filenames, titles, metadata, and indexes serve complementary
  discovery roles.
