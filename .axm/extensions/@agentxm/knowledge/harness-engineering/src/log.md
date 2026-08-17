# Bundle update log

## 2026-08-15

- **Human interaction surfaces**: Added the harness surface that renders
  questions, choices, and approvals to a person, its structured and plain-text
  forms, harness-owned label rendering, and surface selection as behavioral
  policy owned by the agent or skill layer.
- **Usage**: Replaced retired `axm knowledge open` examples with exact
  `axm knowledge concepts get` references.
- **Trust semantics**: Clarified lifecycle, machine-provenance, machine-
  confirmation, and human-review signals; removed three verification events
  that predated their current generated content.
- **Source traceability**: Connected two previously unused source notes to the
  claims they support.
- **Discovery naming**: Renamed the active glossary, context boundary, and
  instruction-file boundary to context-free concept IDs while preserving their
  former IDs as deprecated routes.
- **Compatibility navigation**: Made guide-route retirement explicit and
  aligned section links with their canonical titles.

## 2026-08-14

- **Ownership**: Forked the bundle to the first-party
  `@agentxm/knowledge/harness-engineering` identity.
- **Agent boundary**: Assigned goals, planning, capability selection, memory
  policy, recovery choice, delegation, coordination, and termination behavior
  to agent engineering while retaining their implementation and structural
  enforcement in the harness.
- **Classification**: Added independent axes for application domain,
  adaptation locus, ownership scope, interaction, execution, continuity,
  coordination, authority, and evaluation role so category names do not mix
  unrelated dimensions.
- **Coding and repository harnesses**: Established coding harness as the
  software-engineering domain profile and repository harness as a first-class
  environment-side, repository-owned adaptation profile; documented how they
  compose in one coding-agent system.
- **System composition**: Distinguished the agent, harness core, adapted
  environment, runtime substrate, orchestration plane, governance/control
  plane, agent platform, and evaluation harness by responsibility.
- **Market terminology**: Treated assistants, copilots, digital workers,
  frameworks, platforms, scaffolds, and “AI OS” labels as product claims to map
  onto explicit axes rather than canonical architectural categories.
- **Evaluation boundary**: Assigned generic evaluation design and governance to
  evaluation engineering while retaining runtime identity, environment
  fidelity, trace capture, isolation, and responsible-surface attribution here.
- **Discipline boundary**: Extracted detailed context selection, routing,
  memory, instruction-file, gardening, and specification-authority doctrine to
  the context-engineering discipline while preserving former concept IDs as
  deprecated compatibility routes.
- **System scope**: Added first-class concepts for action and observation
  interfaces, runtimes and environments, state and continuity, feedback and
  verification, authority and containment, and whole-system evaluation.
- **Prompt boundary**: Defined prompt engineering as the owner of reusable
  model-facing instruction, template, example, presentation, and evaluation
  practices rather than treating prompts as skill-only guidance.
- **Skill boundary**: Retained the [Agent skills](elements/agent-skills.md)
  harness-element model while retiring the detailed skill-authoring guide to a
  compatibility route so specialized lifecycle guidance has one owner.

## 2026-08-09

- **Trust**: Machine-confirmed all 16 stable concepts against their cited
  sources with `codex/gpt-5.6` and set a six-month freshness review date;
  human review remains a distinct, unclaimed trust signal.
- **Ownership**: Made knowledge concepts authoritative for context-gardening
  and repository-instruction finding classes so skills can focus on control
  flow without duplicating doctrine.
- **Specification practice**: Added
  [spec-driven development](domains/software-engineering/practices/spec-driven-development.md)
  as the umbrella software-engineering practice, separating its shared
  development loop from repository-specific authority and mutation choices.
- **Specification patterns**: Added [spec-first](domains/software-engineering/patterns/spec-first.md),
  [spec-anchored](domains/software-engineering/patterns/spec-anchored.md), and
  [spec-as-source](domains/software-engineering/patterns/spec-as-source.md) as
  distinct models for specification persistence, human code editing, and
  durable change.
- **Pattern**: Added [progressive disclosure](patterns/progressive-disclosure.md)
  as the reusable structure for advertising small routes and loading deeper
  context only when relevant.
- **Practice**: Added [context gardening](practices/context-gardening.md) as the
  evidence-led maintenance cycle for repairing discovery, pruning noise, and
  promoting knowledge to the right harness element.
- **Vocabulary**: Added agent experience (AX) to the
  [glossary](harness-engineering-glossary.md) as an emerging lens distinct from harness engineering.
- **Foundation**: Added [agent legibility](foundations/agent-legibility.md) as
  the cross-domain quality of making task-relevant intent, state, capabilities,
  constraints, and feedback usable by an agent.
- **Organization**: Reorganized concepts by subject into
  [foundations](foundations/), [application domains](domains/), and
  [elements](elements/), while retaining deprecated compatibility routes for
  earlier concept IDs.
- **Software engineering**: Promoted [software engineering](domains/software-engineering/)
  to the first application domain and retained “coding harness” as a glossary
  term for [software engineering harnesses](domains/software-engineering/harnesses.md).
- **Instruction split**: Separated general [instruction files](elements/instruction-files-as-harness-elements.md)
  from [repository instruction files](domains/software-engineering/repository-instruction-files.md)
  and moved the existing workflow to
  [How to design repository instruction files](domains/software-engineering/guides/repository-instruction-files.md).
- **Guide scope**: Kept [How to design an agent skill](guides/agent-skills.md)
  domain-independent because its workflow does not require repository-specific
  assumptions.
- **Scope**: Expanded the bundle from coding-agent concerns to harness
  engineering as a general discipline, with context engineering as a core
  responsibility and coding harnesses as a software-engineering domain profile.
- **Foundations**: Added explainers for [harness engineering](explainers/harness-engineering.md),
  [context engineering](explainers/context-engineering.md), and
  [coding harnesses](explainers/coding-harnesses.md).
- **Reference**: Added the [harness engineering glossary](harness-engineering-glossary.md) to keep
  application domains, runtime topologies, working environments, and elements
  distinct.
- **Expansion**: Added explainer and guide sections with paired concepts for
  [agent skills](elements/agent-skills.md) and
  [instruction files](elements/instruction-files-as-harness-elements.md).
- **Structure**: Added placeholder indexes for [patterns](patterns/) and
  [practices](practices/), and retained the original `instruction-files`
  concept ID as a deprecated compatibility route.
- **Migration**: Moved the bundle to the `@craigsmitham` namespace and paired
  it with the migrated `improve-instructions` skill.

## 2026-08-07

- **Creation**: Established the harness-engineering bundle with
  [instruction files](instruction-files.md).
