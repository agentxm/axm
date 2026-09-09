# OKF application profiles

This reference provides provisional guidance for defining and applying producer-owned application
profiles over OKF v0.2. Profiles are an emerging OKF community convention, not currently part of
the OKF specification.

## Meaning

An **application profile** defines repeatable producer requirements beyond base OKF conformance. It
may constrain:

- concept types and their semantics;
- required or recommended frontmatter;
- document body requirements;
- directory, filename, and concept-identity conventions;
- relationship semantics; and
- corpus-wide validation rules.

A profile constrains a producer's use of OKF. It does not create a new OKF version or change the
requirements for OKF conformance.

## When to use one

Create a profile when a current corpus or consumer needs consistent rules that OKF deliberately
leaves producer-defined. Do not create one solely to anticipate future taxonomy, tooling, or
validation needs.

Before defining a profile, check whether the bundle or host repository already declares one. Extend
the existing profile when the new rules belong to the same application and authority boundary.

## Recommended contents

A profile should state:

1. its stable identity and version;
2. the base OKF version;
3. its scope, audience, and exclusions;
4. its exact concept-type vocabulary;
5. type-specific metadata and body requirements;
6. path and concept-identity conventions;
7. relationship semantics;
8. normative and advisory validation rules;
9. representative conforming examples; and
10. its ownership and change policy.

Use MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY consistently when the profile is normative.

## Discovery

OKF v0.2 does not standardize profile discovery. Until it does:

- follow an existing host or repository convention;
- otherwise link the profile from the root `index.md` body; and
- do not describe `okf_profile` or another producer-defined frontmatter key as part of OKF.

A producer may define such a key for a concrete consumer, but must identify it as a producer
extension.

## Human-readable and executable representations

Prefer a human-readable normative profile because profiles include semantics, examples, layout,
and governance that a data schema cannot fully express.

Add executable validation only when justified by a concrete consumer or recurring defect:

- use a frontmatter schema for field forms, required values, enums, and cardinality; and
- use a corpus-aware linter for paths, indexes, links, reciprocal relationships, and other
  cross-document rules.

Do not prescribe JSON Schema, Zod, Dhall, or another representation without a consumer-driven
reason.

When prose and executable rules coexist, declare which is authoritative. Generate the secondary
representation or check it for drift in CI.

## Conformance reporting

Report two independent results:

1. **OKF conformance** — whether the bundle satisfies OKF v0.2.
2. **Profile conformance** — whether it satisfies the producer's additional requirements.

A bundle may conform to OKF while failing its application profile. If no executable profile
validator exists, label the profile review as manual and name the rules examined.

## Review a proposed profile or bundle representation

1. Classify each proposed Markdown artifact as a concept document, reserved `index.md`, reserved
   `log.md`, or external peer authority before evaluating its semantic usefulness.
2. Apply the base OKF file contract before producer-profile rules. A profile may narrow choices OKF
   leaves open; it cannot waive a base reserved-file rule and still claim OKF v0.2 conformance.
3. When a proposal gives durable semantic ownership to an index or log, reject that representation
   without discarding the useful meaning. State that the meaning can be represented by a distinct
   non-reserved concept document and that the reserved file can link to it. Unless the applicable
   authority has already accepted them, keep any illustrative type or filename explicitly
   non-normative rather than drafting them as the chosen result.
4. Report the base-format conclusion, profile decision, and any unresolved domain-authority choice
   separately. Do not choose a domain concept type, path, or cardinality that the applicable profile
   authority has not accepted.
5. Preserve peer authorities named by the proposal. Moving one durable concept into OKF does not
   move definitions, executions, results, approvals, requirements, or other operative artifacts
   into that concept's ownership. Describe representational compatibility without approving a
   profile-policy reversal or widening the concept boundary.

For an assessment request, stop at that authority boundary. Do not provide a ready-to-adopt index
or concept draft when its domain type, canonical path, inclusion policy, or ownership is still
proposed. Instead:

- say that OKF permits an uncontrolled non-empty `type` on a non-reserved concept, while the
  applicable profile or domain authority decides whether the proposed type is accepted;
- refer to a distinct non-reserved concept document without selecting its canonical filename;
- treat a requested corpus- or profile-policy reversal as a proposal, not as accepted policy; and
- restate any supplied `owns` and `does not own` boundaries so the representational correction
  cannot absorb peer definitions, executions, results, assurance decisions, or requirements.

Concrete type and path examples are allowed only when clearly labeled non-normative placeholders;
do not place them in a draft artifact whose form implies that they were selected.
When a requested type has not already been accepted, do not call the separated artifact “a
document of type `<requested>`.” Call it a distinct non-reserved concept document, then state
separately that `<requested>` is base-format-compatible but remains a proposed type pending the
applicable profile or domain decision.

## Status and sources

This guidance is provisional. The OKF community has discussed opt-in profiles, but OKF v0.2 does
not currently standardize profile declarations, descriptors, registries, or validation behavior.
Reconcile this guidance with a later OKF specification before adopting conflicting conventions.

The terminology and recommendations are grounded in:

- the [Open Knowledge Format v0.2 specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md);
- the open [OKF application-profile proposal](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/212);
- the [Dublin Core definition of an application profile](https://www.dublincore.org/resources/glossary/application_profile/); and
- the [W3C Profiles Vocabulary](https://www.w3.org/TR/dx-prof/).
