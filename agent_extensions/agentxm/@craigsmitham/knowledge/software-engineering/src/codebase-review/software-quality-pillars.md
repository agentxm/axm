---
type: Explainer
title: Software quality pillars
description: Research-grounded candidate taxonomy of ten singular software-product quality outcomes for codebase review, with explicit boundaries from design principles, engineering-system capabilities, assurance mechanisms, and evidence.
tags: [codebase-review, software-quality, quality-model, taxonomy, outcomes, research, maintenance]
status: draft
sources:
  - id: mccall
    resource: https://www.scribd.com/document/418348872/Factors-in-Software-Quality-Concept-and-Definitions-of-Software-Quality-Jim-A-McCall-Paul-K-Richard-Gene-F-Walters
    title: Factors in Software Quality — Volume I, Concept and Definitions of Software Quality
  - id: iso-25010
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
  - id: iso-25010-preview
    resource: https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf
    title: ISO/IEC 25010:2023 public preview
  - id: iso-9126
    resource: https://www.iso.org/standard/22749.html
    title: ISO/IEC 9126-1:2001 Software engineering — Product quality — Part 1, Quality model
  - id: boehm
    resource: https://citeseerx.ist.psu.edu/document?doi=b79adbdb51a0be5f9d9fdbf731bc31d1ff43747d&repid=rep1&type=pdf
    title: Quantitative Evaluation of Software Quality
  - id: furps
    resource: https://public.dhe.ibm.com/software/rational/docs/v2003/unix_solutions/pdf/reqpro/reqpro_user.pdf
    title: IBM Rational RequisitePro User's Guide
  - id: dromey
    resource: https://research-repository.griffith.edu.au/bitstream/10072/15682/1/3476.pdf
    title: A Model for Software Product Quality
  - id: dijkstra
    resource: https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html
    title: Notes on Structured Programming
  - id: hoare
    resource: https://sites.cs.ucsb.edu/~kemm/courses/cs266/acmhoare69.pdf
    title: An Axiomatic Basis for Computer Programming
  - id: parnas
    resource: https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html
    title: On the Criteria To Be Used in Decomposing Systems into Modules
  - id: liskov-wing
    resource: https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf
    title: A Behavioral Notion of Subtyping
  - id: brooks
    resource: https://soloway.pbworks.com/f/The.Mythical.Man.Month.F.Brooks.pdf
    title: The Mythical Man-Month — Essays on Software Engineering, Anniversary Edition
  - id: lehman
    resource: https://users.ece.utexas.edu/~perry/education/SE-Intro/lehman.pdf
    title: Programs, Life Cycles, and Laws of Software Evolution
  - id: dependability
    resource: https://www.landwehr.org/2004-aviz-laprie-randell.pdf
    title: Basic Concepts and Taxonomy of Dependable and Secure Computing
  - id: protection
    resource: https://web.cs.wpi.edu/~cs557/f14/papers/saltzer1975_alt.html
    title: The Protection of Information in Computer Systems
  - id: testing-theory
    resource: https://archiv.infsec.ethz.ch/intranet_secured/Y/w/GG75.pdf
    title: Toward a Theory of Test Data Selection
  - id: reproducible-builds
    resource: https://reproducible-builds.org/docs/definition/
    title: Reproducible Builds — Definitions
  - id: slsa
    resource: https://slsa.dev/spec/v1.2/
    title: SLSA specification 1.2
  - id: nist-ssdf
    resource: https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-218.pdf
    title: NIST SP 800-218 Secure Software Development Framework 1.1
  - id: dora
    resource: https://dora.dev/guides/dora-metrics/
    title: DORA software delivery performance metrics
  - id: google-sre
    resource: https://sre.google/sre-book/effective-troubleshooting/
    title: Google SRE — Effective Troubleshooting
  - id: test-desiderata
    resource: https://testdesiderata.com/
    title: Test Desiderata
  - id: pstack
    resource: https://github.com/cursor/plugins/tree/main/pstack
    title: Cursor plugins — pstack
  - id: pstack-review
    resource: https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/references/code-quality-review.md
    title: pstack — Code Quality Review
  - id: pstack-rubric
    resource: https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/references/rubric.md
    title: pstack — Review Rubric
  - id: pstack-tdd
    resource: https://github.com/cursor/plugins/blob/main/pstack/skills/tdd/SKILL.md
    title: pstack — TDD Bug Fix
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Software quality pillars

This concept proposes ten foundational quality outcomes for codebase review.
It is a research-grounded candidate taxonomy, not a universal model, scorecard,
or claim that software quality naturally has ten dimensions.

The design prioritizes conceptual coherence, peer-level boundaries, durable
meaning, and source support over familiar repository-review groupings.

## Decision in brief

Use the repository as an **evidence surface** for judging the quality of a
software product. Keep the ten pillars at the **quality-outcome layer**:

| ID | Pillar | Core question |
| --- | --- | --- |
| `SQ-01` | Suitability | Does the product provide a complete and appropriate capability set for its intended needs and operating context? |
| `SQ-02` | Correctness | Does the product's behavior conform to its applicable contracts and preserve its declared invariants? |
| `SQ-03` | Reliability | Does required service remain dependable over time, faults, load, interruption, and recovery? |
| `SQ-04` | Security | Does the product preserve authorized protection of information, authority, identity, and operation against relevant threats? |
| `SQ-05` | Safety | Does the product keep the risk of unacceptable harm within its declared tolerances across use, misuse, failure, and integration? |
| `SQ-06` | Efficiency | Does required behavior meet its time, capacity, resource, and cost constraints for representative workloads? |
| `SQ-07` | Usability | Can intended users understand and operate the product to accomplish relevant goals with acceptable effort and error risk? |
| `SQ-08` | Compatibility | Does the product coexist and exchange meaning with required systems and environments without unacceptable interference? |
| `SQ-09` | Evolvability | Can the product accommodate required change over its lifetime without disproportionate risk, delay, or cost? |
| `SQ-10` | Intelligibility | Can qualified maintainers form an accurate, coherent, appropriately bounded mental model of the product? |

The names are singular semantic heads. Each can contain multiple subordinate
dimensions without becoming a compound pillar. The list order is for stable
reference, not priority.

## Assessment universe

The assessed entity is the **software product**, including its source,
configuration, data definitions, generated elements, and externally observable
behavior where they are in scope. The **repository** is the principal evidence
surface. It can expose internal product properties, intended contracts,
engineering history, and the systems used to construct and verify the product.

That distinction prevents three common overclaims:

- repository evidence can support but cannot alone establish every runtime or
  quality-in-use outcome;
- the presence of a test, scan, pipeline, metric, or document does not prove
  the quality it is intended to support; and
- a quality of the development or delivery system is not automatically a
  quality of the product.

If a future collection needs to assess the engineering system itself, give it
a separately named outcome model. Do not silently mix product qualities,
delivery performance, evidence quality, and development practices in one flat
set of ten.

## Why this is a synthesis, not a vote

Influential models repeatedly recognize behavioral fitness, dependability,
resource efficiency, human interaction, environmental fit, protection, and
change capacity. They do not agree on assessment subject, hierarchy, or the
status of testing, portability, security, and constraints.

| Model | Organizing idea | Category lesson for this taxonomy |
| --- | --- | --- |
| McCall | Product operation, revision, and transition | A lifecycle grouping does not prove that every named factor is an independent peer.[^mccall] |
| Boehm | General utility decomposed through present use, maintenance, and portability | A hierarchy helps relate qualities but does not validate weights or an aggregate score.[^boehm] |
| FURPS/FURPS+ | Requirements classes plus design, implementation, interface, and physical constraints | Required behavior, qualities, and imposed constraints must not be flattened into one quality list.[^furps] |
| Dromey | Concrete product properties carry or contribute to higher-level qualities | Reviewable structures should be related to outcomes rather than mistaken for them.[^dromey] |
| ISO/IEC 9126 | Six product characteristics plus a separate quality-in-use model | Security, safety, testability, and portability have changed level across generations of the model.[^iso-9126] |
| ISO/IEC 25010:2023 | Nine product characteristics with subordinate characteristics | A current reference model is a strong anchor, but it remains tailorable and does not establish that nine is the natural number.[^iso-25010][^iso-25010-preview] |

The candidate starts from ISO/IEC 25010:2023's product-quality scope, then
makes three source-supported changes:

1. It separates **suitability** from **correctness**. A product can implement a
   stated contract correctly while the contract is incomplete or inappropriate
   for the intended need. Hoare explicitly distinguishes satisfying a formal
   specification from accomplishing the user's intention.[^hoare]
2. It groups maintainability and flexibility beneath **evolvability**, the
   singular capacity to accommodate change over the product's lifetime.
   Lehman's work makes continuing change intrinsic for software coupled to a
   changing environment.[^lehman]
3. It recognizes **intelligibility** separately from change capacity. Dijkstra,
   Parnas, and Brooks treat manageable structure, comprehensibility, and
   conceptual integrity as direct goods rather than only as proxies for the
   cost of a future edit.[^dijkstra][^parnas][^brooks]

These are design judgments informed by the sources. They are not categories
asserted by ISO or a consensus result from counting appearances in historical
models.

## Pillar boundaries

Every pillar owns one desired product quality, not a review method or a bundle
of unrelated concerns.

### `SQ-01` — Suitability

**Desired outcome:** the product's capability set is complete and appropriate
for the intended stakeholders, goals, and operating context.

It includes missing, unnecessary, and ill-fitted capabilities. It excludes
whether implemented behavior faithfully conforms to an already accepted
contract; that belongs to correctness. Repository evidence may be insufficient
when stakeholder needs or real usage are unavailable.

### `SQ-02` — Correctness

**Desired outcome:** observable behavior conforms to applicable contracts, and
defined invariants hold across applicable conditions and state transitions.

It includes computations, control flow, data meaning, boundary behavior,
state, concurrency, and error semantics. It excludes whether the governing
contract is the right one. Proofs, tests, type checks, and review are evidence
mechanisms, not correctness itself. Dijkstra and Hoare ground correctness in
specification, assumptions, and reasoning rather than successful samples
alone.[^dijkstra][^hoare]

### `SQ-03` — Reliability

**Desired outcome:** the product delivers required service with acceptable
continuity and predictability across time, demand, faults, interruption, and
recovery.

It includes faultlessness, availability, tolerance, recoverability, and
bounded degradation. It excludes protection against adversaries and avoidance
of unacceptable harm as primary judgments. Dependability research is
especially useful here because it separates attributes, threats, and means
such as fault prevention, tolerance, removal, and forecasting.[^dependability]

### `SQ-04` — Security

**Desired outcome:** the product resists unauthorized or malicious action while
preserving the authorized confidentiality, integrity, authenticity,
accountability, and availability of relevant assets and operations.

It includes protection across trust boundaries and can include source-to-
artifact integrity when that chain is in product scope. Least privilege,
fail-safe defaults, complete mediation, signatures, scans, and provenance are
principles or evidence—not the outcome itself.[^protection][^slsa][^nist-ssdf]

### `SQ-05` — Safety

**Desired outcome:** product behavior keeps the risk of unacceptable harm
within declared tolerances.

It includes harm arising from intended use, reasonably foreseeable misuse,
failure, and integration. Safety can conflict with availability: stopping
service may be the safe result. It is context-dependent and may legitimately
be `Not applicable`, but hiding it inside reliability or security would erase
that distinct consequence.

### `SQ-06` — Efficiency

**Desired outcome:** the product delivers required behavior within justified
time, capacity, resource, and economic constraints.

It includes latency, throughput, capacity, computational work, memory,
storage, network use, and cost per useful result. A benchmark, profile, or
complexity metric is evidence about a bounded property, not efficiency as a
whole.

### `SQ-07` — Usability

**Desired outcome:** intended users can recognize, learn, control, and use the
product to achieve their relevant goals with acceptable effort and error risk.

It includes operability, learnability, inclusivity, assistance, and protection
from user error. It concerns the product's intended users, not maintainer
comprehension of source; the latter belongs to intelligibility. Its
applicability and evidence differ for an internal library, command-line tool,
public interface, and autonomous service.

### `SQ-08` — Compatibility

**Desired outcome:** the product coexists and exchanges meaning with required
systems and environments without unacceptable interference.

It includes interoperability, protocol and data agreement, coexistence, and
behavioral substitutability at shared boundaries. It excludes the future
capacity to adapt to a new environment, which belongs to evolvability. Static
type compatibility alone does not establish behavioral substitution.[^liskov-wing]

### `SQ-09` — Evolvability

**Desired outcome:** the product can accommodate required internal and
environmental change over its lifetime at sustainable risk, delay, and cost.

It includes modifiability, adaptability, installability, replaceability,
scalability, migration capacity, and sustainable dependency evolution.
Modular boundaries and information hiding are design contributors, while
change history and representative change exercises are evidence. Parnas shows
why the number of modules or a visually layered structure is not itself the
outcome.[^parnas]

### `SQ-10` — Intelligibility

**Desired outcome:** qualified maintainers can form an accurate, coherent, and
appropriately bounded mental model of the product's concepts, responsibilities,
behavior, and structure.

It includes conceptual integrity, comprehensibility, localized meaning, and
controlled accidental complexity. Naming, abstraction, documentation, and
module design are contributors. A small file, low cyclomatic-complexity value,
or absence of duplication is not sufficient evidence of intelligibility.

## High-risk boundary tests

Use these distinctions when a concern appears to fit more than one pillar.
Record cross-pillar consequences, but give the underlying condition one
canonical owner.

| Neighbors | Canonical distinction |
| --- | --- |
| Suitability / correctness | Suitability asks whether the accepted capability set addresses the right need; correctness asks whether behavior conforms to the accepted contract. |
| Correctness / reliability | Correctness is contract conformance for applicable behavior; reliability concerns continuity and recovery over time and faults. A consistently wrong result can be reliable. |
| Reliability / safety | Reliability favors continued required service; safety favors bounded harm and may require service to stop. |
| Reliability / security | Reliability includes accidental faults and service continuity; security includes adversarial action and authorization. Availability can be relevant to both, but the threat and claim differ. |
| Security / safety | Security protects authorized assets and operation against threats; safety bounds unacceptable harm regardless of whether its cause is malicious. |
| Efficiency / reliability | Efficiency owns resource and timing constraints; reliability owns continuity and recovery. Resource exhaustion can create a linked finding in both. |
| Suitability / usability | Suitability asks whether the product provides the needed capability; usability asks whether intended users can successfully operate it. |
| Usability / intelligibility | Usability concerns intended product users; intelligibility concerns qualified maintainers reasoning about the product. |
| Compatibility / correctness | Correctness owns conformance to the product's declared behavior; compatibility owns successful coexistence and exchange across an external relationship. |
| Compatibility / evolvability | Compatibility is fit with required present environments; evolvability is capacity to accommodate future change. |
| Evolvability / intelligibility | Evolvability is sustainable change capacity; intelligibility is accurate comprehension. Each contributes to the other but neither guarantees it. |

The pillars are related rather than statistically independent. Record
`contributes-to`, `evidences`, `threatens`, and `trades-off-with` relationships
instead of forcing every observation into a single causal story.

## Keep supporting layers outside the ten

The review collection still needs more than ten documents. It should organize
supporting knowledge by role rather than promote every useful topic to a
quality pillar. [Cross-cutting concerns for software
quality](cross-cutting-concerns.md) is the canonical model for classifying
those subjects and roles, deciding whether they genuinely cross the pillar
decomposition, and recording their conditional relationships. The table below
is a summary of the boundary established there.

| Layer | Question answered | Examples |
| --- | --- | --- |
| Quality outcome | What desirable state should the product possess? | The ten pillars in this concept |
| Subquality | Which narrower dimension constitutes an outcome? | Availability, recoverability, authenticity, learnability, modifiability |
| Supporting-artifact quality | What desirable state should a specification, test suite, model, or other supporting artifact possess? | Test-suite value, specification clarity, model consistency |
| Design principle | What rule tends to create or preserve qualities? | Abstraction, information hiding, behavioral substitutability, least privilege |
| Engineering-system capability | What durable ability helps construct, change, deliver, operate, or learn from the product? | Dependency control, deterministic builds, task graphs, delivery automation, telemetry instrumentation |
| Assurance mechanism | What produces grounds for believing a quality claim? | Tests, proofs, reviews, static analysis, benchmarks, monitoring, attestations |
| Evidence property | What makes those grounds usable for this judgment? | Relevance, validity, provenance, freshness, scope binding, integrity, sufficient completeness |

This separation is not a demotion of testing, modular design, build coherence,
or observability. It lets each support every quality it actually informs
without pretending to be the quality outcome itself. Testing theory, for
example, treats test selection and adequacy as grounds for claims; it does not
make “tests exist” a product-quality result.[^testing-theory]

The test suite is also an artifact that can have quality outcomes of its own.
Test Desiderata names isolated, composable, deterministic, fast, writable,
readable, behavioral, structure-insensitive, automated, specific, predictive,
and confidence-inspiring tests, and makes the tradeoffs among them explicit.[^test-desiderata]
Those are valuable inputs to a **test-suite quality** checklist. They do not
turn testing into a product-quality pillar, and they should not be collapsed
into product testability. The distinction is:

```text
product testability    = how readily product qualities can be investigated
test-suite quality     = how valuable and sustainable the tests are as evidence
product quality        = what the resulting evidence is intended to justify
```

No single desideratum is sufficient. A fast, deterministic test can be
irrelevant; a predictive test can be too slow or expensive for frequent use.
The separate [Test-suite quality
criteria](supporting/test-suite-quality.md) preserves those tradeoffs rather
than scoring all properties as though they could be maximized simultaneously.

Modern repository concerns fit the same model:

- **construction reproducibility** is an outcome of the construction system
  and an assurance aid when independently rebuilt artifacts are compared; it
  does not prove that the source is benign;[^reproducible-builds]
- **supply-chain provenance** and attestations can support security claims, but
  their existence does not establish authorized, untampered construction;[^slsa][^nist-ssdf]
- **delivery performance** is an engineering-system outcome measured at an
  application or service scope, not a product-quality pillar;[^dora]
- **telemetry instrumentation** enables runtime evidence, while diagnosability
  contributes to reliability and evolvability without being synonymous with
  either;[^google-sre] and
- **evidence quality** is a cross-cutting evidence property unless the
  evidence system itself is the declared object of review.

## Practitioner-source check

The pstack plugin is a useful contemporary practitioner datapoint because it
bundles a review rubric, code-quality lens, design principles, verification
methods, and operating playbooks in one public artifact.[^pstack][^pstack-review][^pstack-rubric]
Its content reinforces the need for typed layers more than it argues for a
different product-quality taxonomy:

| pstack concern | Classification here | Candidate destination |
| --- | --- | --- |
| Correctness and security findings | Product-quality outcomes | Correctness and security pillars |
| User experience | Desired product result and decision perspective | Suitability and usability pillars |
| Reader load and structural simplicity | Product property plus design heuristics | Intelligibility, with evolvability consequences |
| Domain modeling, boundary discipline, type discipline, idempotency, and deletion | Design principles | Contributor guidance linked to correctness, reliability, evolvability, and intelligibility |
| Root-cause analysis and TDD | Inspection or change methods | Optional method aids, selected when their preconditions hold[^pstack-tdd] |
| Direct artifact checks and regression evidence | Assurance mechanisms and evidence practice | Shared assurance layer |
| Multi-model adversarial review and lead synthesis | Review protocol | Assessment method, not a quality criterion |
| File-size, indirection, and diff-size thresholds | Contextual heuristics or proxies | Evidence aids requiring calibration, never sufficient proof |

pstack is an authored operating system for agent-assisted engineering, not a
formal or empirically validated software-quality model. Its strongest value to
this work is practitioner coverage and concrete examples of principles,
methods, and proxies that should remain discoverable after they leave the
pillar layer. Its use of a line-count threshold and intentionally forceful
review posture also demonstrates why contextual heuristics should not become
timeless outcome criteria.

## Alternatives deliberately not selected

| Alternative | Strength | Reason not selected for the candidate |
| --- | --- | --- |
| Adopt ISO/IEC 25010:2023 unchanged | Current, recognized, and already hierarchical | It does not make the need-versus-contract distinction explicit, and its treatment of comprehension remains subordinate to maintainability. |
| Use dependability as an umbrella | Compact treatment of reliability, safety, integrity, availability, and maintainability | It is too broad beside the other proposed pillars and would create parent-child overlap with security and reliability.[^dependability] |
| Make testability or verifiability a pillar | Keeps assurance highly visible | It mixes an assurance affordance with the desired product qualities that assurance supports. |
| Make reproducibility a pillar | Makes modern repository construction risk explicit | It changes the assessed subject from the software product to the construction system and still does not establish authenticity or correctness. |
| Make delivery capability a pillar | Recognizes that repository changes must reach use safely | It is a quality of the delivery system and combines throughput with instability unless carefully decomposed.[^dora] |
| Make observability a pillar | Reflects distributed operational practice | Instrumentation is an enabler; diagnosability is a narrower contributor to reliability and evolvability. |
| Organize around repository topics | Retains familiar review lenses | The topics mix outcomes, principles, enablers, mechanisms, and compound subjects. |

These alternatives can become separate engineering-system, assurance, or
domain-extension collections. Their exclusion from the ten is a boundary
decision, not a judgment that they are unimportant.

## Applicability and use

Apply all ten as candidate questions, but allow `Not applicable`,
`Indeterminate`, and `Not assessed` as defined in
[Reviewing a codebase](reviewing-a-codebase.md). A reusable library, interactive
application, embedded controller, data pipeline, and network service will
produce different applicability and evidence profiles.

Do not publish a summed quality score. The pillars have no justified universal
weights, can conflict, and can have veto-like importance in particular
contexts. Record scope, stakeholder, scenario, evidence, uncertainty, and
cross-pillar tradeoffs with each judgment.

## Current disposition

The framework refactor proceeded after its synthetic design review addressed
these conditions:

- accepted the product-versus-engineering-system boundary;
- confirmed that each pillar can receive one meaningful judgment without
  depending on another pillar's verdict;
- challenged the definitions with representative library, service,
  interactive, data-processing, safety-relevant, and multi-package scenarios;
- classified a sample of findings without persistent overlap or missing
  outcome families;
- agreed that supporting principles, enablers, mechanisms, and evidence remain
  discoverable after leaving the top-level ten;
- accepted or revised the typed cross-cutting-concern model used to preserve
  those relationships without creating additional product pillars;
- confirmed that Test Desiderata and pstack concerns can be routed without
  promoting test artifacts, workflow rules, or code-shape heuristics into
  product-quality pillars; and
- recorded unresolved tradeoffs and domain-specific extensions rather than
  hiding them in compound criteria.

The [Codebase-review framework design
review](framework-design-review.md) records the scenario and boundary trials,
revisions, and unresolved risks. It supports candidate design coherence only;
comparative repository and reviewer trials remain required before claims of
effectiveness or stability.

## Research limits and lifecycle

This synthesis used influential historical models, foundational primary works,
and current authoritative engineering-system sources. Public access to the
full normative ISO texts and the original FURPS publication was unavailable;
the detailed ISO category review used a public preview, and FURPS used IBM's
Rational descendant documentation. Similar labels across sources were not
treated as proof of equivalent meaning.

No located source establishes that these ten pillars are independent,
collectively exhaustive, or optimal for repository review. The cardinality of
ten is an editorial constraint. The candidate remains `status: draft` until
classification trials establish that its boundaries improve review coverage
and agreement without concealing material concerns.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25010-preview]: ISO/IEC, [ISO/IEC 25010:2023 public preview](https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf).
[^iso-9126]: ISO, [ISO/IEC 9126-1:2001 lifecycle page](https://www.iso.org/standard/22749.html).
[^mccall]: McCall, Richards, and Walters, [Factors in Software Quality, Volume I](https://www.scribd.com/document/418348872/Factors-in-Software-Quality-Concept-and-Definitions-of-Software-Quality-Jim-A-McCall-Paul-K-Richard-Gene-F-Walters).
[^boehm]: Boehm, Brown, and Lipow, [Quantitative Evaluation of Software Quality](https://citeseerx.ist.psu.edu/document?doi=b79adbdb51a0be5f9d9fdbf731bc31d1ff43747d&repid=rep1&type=pdf).
[^furps]: IBM Rational, [RequisitePro User's Guide](https://public.dhe.ibm.com/software/rational/docs/v2003/unix_solutions/pdf/reqpro/reqpro_user.pdf).
[^dromey]: Dromey, [A Model for Software Product Quality](https://research-repository.griffith.edu.au/bitstream/10072/15682/1/3476.pdf).
[^dijkstra]: Dijkstra, [Notes on Structured Programming](https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html).
[^hoare]: Hoare, [An Axiomatic Basis for Computer Programming](https://sites.cs.ucsb.edu/~kemm/courses/cs266/acmhoare69.pdf).
[^parnas]: Parnas, [On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html).
[^liskov-wing]: Liskov and Wing, [A Behavioral Notion of Subtyping](https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf).
[^brooks]: Brooks, [The Mythical Man-Month, anniversary edition](https://soloway.pbworks.com/f/The.Mythical.Man.Month.F.Brooks.pdf).
[^lehman]: Lehman, [Programs, Life Cycles, and Laws of Software Evolution](https://users.ece.utexas.edu/~perry/education/SE-Intro/lehman.pdf).
[^dependability]: Avizienis, Laprie, Randell, and Landwehr, [Basic Concepts and Taxonomy of Dependable and Secure Computing](https://www.landwehr.org/2004-aviz-laprie-randell.pdf).
[^protection]: Saltzer and Schroeder, [The Protection of Information in Computer Systems](https://web.cs.wpi.edu/~cs557/f14/papers/saltzer1975_alt.html).
[^testing-theory]: Goodenough and Gerhart, [Toward a Theory of Test Data Selection](https://archiv.infsec.ethz.ch/intranet_secured/Y/w/GG75.pdf).
[^reproducible-builds]: Reproducible Builds, [Definitions](https://reproducible-builds.org/docs/definition/).
[^slsa]: SLSA, [Specification 1.2](https://slsa.dev/spec/v1.2/).
[^nist-ssdf]: NIST, [Secure Software Development Framework 1.1](https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-218.pdf).
[^dora]: DORA, [Software delivery performance metrics](https://dora.dev/guides/dora-metrics/).
[^google-sre]: Google, [Effective Troubleshooting](https://sre.google/sre-book/effective-troubleshooting/).
[^test-desiderata]: Beck and Sutton, [Test Desiderata](https://testdesiderata.com/).
[^pstack]: Cursor, [pstack](https://github.com/cursor/plugins/tree/main/pstack).
[^pstack-review]: pstack, [Code Quality Review](https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/references/code-quality-review.md).
[^pstack-rubric]: pstack, [Review Rubric](https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/references/rubric.md).
[^pstack-tdd]: pstack, [TDD Bug Fix](https://github.com/cursor/plugins/blob/main/pstack/skills/tdd/SKILL.md).
