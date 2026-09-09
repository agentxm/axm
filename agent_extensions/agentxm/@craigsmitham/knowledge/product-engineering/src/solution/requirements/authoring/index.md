# Authoring requirements

These concepts specify the portable semantic contract and offer forms suited
to different requirement risks and structures.

- [Requirement content contract](requirement-content-contract.md) - Defines the
  minimum semantic content needed for a durable, reviewable, assessable
  requirement.
- [Classifying requirements](classifying-requirements.md) - Uses project
  taxonomy when available and supplies a non-exclusive fallback lens for
  requirement analysis.
- [Selecting a requirement specification method](selecting-a-specification-method.md) -
  Selects a specification form proportional to ambiguity, consequence,
  interaction complexity, and assurance need. Use when prose is leaving an
  obligation ambiguous, or when choosing among structured syntax, examples,
  models, and formal notation.
- [Authoring requirements](authoring-requirements.md) - Provides general
  guidance for writing singular, bounded, necessary, feasible, and assessable
  requirements. Use when drafting or rewriting a requirement that has no
  special quantitative, constraint, or stateful character.
- [Authoring quantitative and quality requirements](authoring-quantitative-and-quality-requirements.md) -
  Specifies measurable quality obligations without inventing targets or
  omitting assessment context. Use when a requirement asserts a quality such as
  performance, reliability, or availability, or rests on an adjective with no
  measure, condition, or target.
- [Authoring constraints and external conformance requirements](authoring-constraints-and-external-conformance.md) -
  States genuine restrictions and applicable external obligations with explicit
  scope, version, and evidence. Use when a requirement restricts the solution
  space or invokes a law, standard, contract, or interface obligation.
- [Authoring invariants and stateful behavior](authoring-invariants-and-stateful-behavior.md) -
  Specifies rules that must hold across states, transitions, concurrency, and
  failure conditions. Use when an obligation must hold continuously rather than
  at a single trigger, or when retry, ordering, rollback, or partial failure
  could falsify it.
- [Requirement template](requirement-template.md) - Provides a compact Markdown
  fallback for requirements when native host fields cannot preserve the content
  contract.
