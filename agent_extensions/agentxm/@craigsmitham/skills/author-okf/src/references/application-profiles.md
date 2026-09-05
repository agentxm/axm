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

## Status and sources

This guidance is provisional. The OKF community has discussed opt-in profiles, but OKF v0.2 does
not currently standardize profile declarations, descriptors, registries, or validation behavior.
Reconcile this guidance with a later OKF specification before adopting conflicting conventions.

The terminology and recommendations are grounded in:

- the [Open Knowledge Format v0.2 specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md);
- the open [OKF application-profile proposal](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/212);
- the [Dublin Core definition of an application profile](https://www.dublincore.org/resources/glossary/application_profile/); and
- the [W3C Profiles Vocabulary](https://www.w3.org/TR/dx-prof/).
