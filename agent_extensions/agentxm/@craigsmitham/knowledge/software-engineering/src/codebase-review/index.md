# Codebase review

An outcome-centered, evidence-aware framework for reviewing a software product
through its repository and other available evidence. The ten pillar lists state
desired product qualities. Cross-cutting records preserve context,
specification, structure, lifecycle integrity, risk, assurance, feedback, and
evidence without turning methods or supporting artifacts into extra pillars.

The collection is a source-reviewed and design-reviewed candidate. It supports
bounded assessment and reporting; it does not certify product quality, release
readiness, security, safety, compliance, or fitness.

## Framework and use

- [Reviewing a codebase](reviewing-a-codebase.md) - Use when a repository needs a bounded quality review; frame product claims, assess applicable pillar criteria, apply relevant cross-cutting concerns, and preserve evidence and uncertainty without treating checklist completion as assurance.
- [Maintaining codebase-review criteria](maintaining-codebase-review-criteria.md) - Use when adding, revising, evaluating, or retiring codebase-review criteria; preserve stable quality outcomes while evolving evidence aids, perspectives, and inspection methods independently.
- [Software quality pillars](software-quality-pillars.md) - Research-grounded candidate taxonomy of ten singular software-product quality outcomes for codebase review, with explicit boundaries from design principles, engineering-system capabilities, assurance mechanisms, and evidence.
- [Cross-cutting concerns for software quality](cross-cutting-concerns.md) - Research-grounded model of eight typed cross-cutting concern records and their conditional relationships to the ten software-product quality pillars.
- [Codebase-review framework design review](framework-design-review.md) - Synthetic scenario and structural review of the ten-pillar outcome framework, its cross-cutting relationships, supporting test-suite assessment, and separation of criteria from review methods.

## Product-quality criteria

These ten `reporting-review` lists own product-quality judgments. Their order is
stable reference, not priority or weighting.

- [Suitability quality criteria](criteria/suitability.md) - Use when assessing whether the product's capability set is complete and appropriate for its intended stakeholder needs and operating context.
- [Correctness quality criteria](criteria/correctness.md) - Use when assessing whether product behavior conforms to applicable contracts and preserves declared invariants across relevant conditions and transitions.
- [Reliability quality criteria](criteria/reliability.md) - Use when assessing whether required service remains dependable through time, demand, faults, interruption, degradation, and recovery.
- [Security quality criteria](criteria/security.md) - Use when assessing whether the product preserves authorized protection of information, identity, authority, and operation against relevant threats.
- [Safety quality criteria](criteria/safety.md) - Use when assessing whether the product keeps the risk of unacceptable harm within declared tolerances across use, misuse, failure, and integration.
- [Efficiency quality criteria](criteria/efficiency.md) - Use when assessing whether required behavior meets applicable time, capacity, resource, and cost constraints under representative workloads.
- [Usability quality criteria](criteria/usability.md) - Use when assessing whether intended users can understand and operate the product to accomplish relevant goals with acceptable effort and error risk.
- [Compatibility quality criteria](criteria/compatibility.md) - Use when assessing whether the product can coexist and exchange meaning with required systems and environments without unacceptable interference.
- [Evolvability quality criteria](criteria/evolvability.md) - Use when assessing whether the product can accommodate required change over its lifetime without disproportionate risk, delay, or cost.
- [Intelligibility quality criteria](criteria/intelligibility.md) - Use when assessing whether qualified maintainers can form an accurate, coherent, and appropriately bounded mental model of the product.

## Supporting quality criteria

- [Test-suite quality criteria](supporting/test-suite-quality.md) - Use when assessing automated tests as supporting artifacts; evaluate whether the suite provides valuable, sustainable, and appropriately bounded evidence for applicable product-quality claims.

## Review aids

These guides contain optional evidence and inspection methods. They do not add
quality criteria or prescribe one universal review sequence.

- [Repository evidence](review-aids/repository-evidence.md) - Use when locating and interpreting evidence across source, configuration, history, generated artifacts, and dependency relationships without treating proxies as findings.
- [Scenario analysis](review-aids/scenario-analysis.md) - Use when challenging product-quality claims with concrete stakeholder, workload, failure, threat, hazard, integration, and change scenarios.
- [Verification evidence](review-aids/verification-evidence.md) - Use when selecting and interpreting tests, analysis, proofs, scans, measurements, and reviews as evidence rather than product outcomes.
- [Runtime investigation](review-aids/runtime-investigation.md) - Use when a product-quality claim depends on execution, operational signals, representative workloads, degradation, interruption, or recovery.
- [Model-assisted review](review-aids/model-assisted-review.md) - Use when one or more frontier models assist a codebase review; preserve bounded claims, attributable evidence, counterevidence, uncertainty, and human decision authority.
