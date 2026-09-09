# Codebase review

An outcome-centered, evidence-aware framework for reviewing a software product
through its repository and other available evidence. Ten pillars state the
desired product qualities. Eight cross-cutting records preserve context,
specification, structure, lifecycle integrity, risk, assurance, feedback, and
evidence without turning methods or supporting artifacts into extra pillars.

The framework is a source-reviewed candidate. It supports bounded assessment
and reporting; it does not certify product quality, release readiness,
security, safety, compliance, or fitness.

## Run a review

- [Reviewing a codebase](reviewing-a-codebase.md) - Use when a repository needs a bounded quality review; frame product claims, assess the applicable quality pillars, apply relevant cross-cutting concerns, choose evidence methods, and preserve uncertainty without treating completion as assurance.

## The quality model

- [Software quality pillars](software-quality-pillars.md) - Defines the ten candidate product-quality outcomes used by codebase review — suitability through intelligibility — with each pillar's desired outcome, inclusions, exclusions, nearest-neighbor boundary tests, the supporting layers deliberately kept outside the ten, and the split between judging a product and sustaining one.
- [Cross-cutting concerns for software quality](cross-cutting-concerns.md) - Defines what makes a concern cross-cutting rather than an eleventh quality pillar, defines the eight canonical records with their inclusions and exclusions, supplies the seven typed edges that reach the quality pillars, and gives the subject, role, and admission tests every candidate record must pass.

## Supporting quality criteria

- [Supporting quality criteria](supporting/) - Checklists for subjects that can
  support a product-quality claim without being the software product, and the
  rule that a supporting verdict never substitutes for an applicable
  product-quality judgment. Holds
  [Test-suite quality criteria](supporting/test-suite-quality.md), the one
  supporting subject written so far.
