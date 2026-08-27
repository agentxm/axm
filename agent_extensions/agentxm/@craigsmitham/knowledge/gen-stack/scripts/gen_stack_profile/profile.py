"""Executable counterpart of the normative Gen Stack profile inventory."""

from __future__ import annotations

from dataclasses import dataclass


PROFILE_ID = "gen-stack"
PROFILE_VERSION = "0.5.0"
COMMON_FIELDS = ("type", "title", "description", "status")
VALID_STATUSES = {"draft", "stable", "deprecated"}
REQUIRED_ROOT_CONCEPTS = {
    "system.md": "System",
    "lifecycle.md": "System Lifecycle",
    "ownership.md": "System Ownership",
    "decisions.md": "Architecture Decision Policy",
    "assurance.md": "System Assurance",
}
EVALUATION_PROTOCOL_TYPE = "Evaluation Protocol"
EVALUATION_PROTOCOL_LIFECYCLES = {"active", "retired"}
EVALUATION_PROTOCOL_ROLES = {
    "requirement-satisfaction": "requirements",
    "architecture-realization": "architecture_authorities",
    "implementation-conformance": "implementation_units",
}
EVALUATION_PROTOCOL_DIRECTORIES = {
    "requirement-satisfaction": "requirements",
    "architecture-realization": "architecture",
    "implementation-conformance": "implementation",
}
EVALUATION_PROTOCOL_SECTIONS = (
    "Claim",
    "Assessment",
    "Judgment",
    "Evidence and lifecycle",
)
ARCHITECTURE_REALIZATION_TYPES = {
    "System",
    "Architecture Decision Record",
    "Capability",
    "Feature",
    "Surface",
    "Bounded Context",
    "Context Map",
    "C4 Software System",
    "C4 Container",
    "C4 Component",
}
GOVERNED_TYPES = {
    *REQUIRED_ROOT_CONCEPTS.values(),
    EVALUATION_PROTOCOL_TYPE,
    "Architecture Decision Record",
    "Requirement",
    "Offering",
    "Audience",
    "Need",
    "Job to Be Done",
    "Value Proposition",
    "Use Case",
    "Capability",
    "Feature",
    "Surface",
    "Subdomain",
    "Bounded Context",
    "Context Map",
    "C4 Software System",
    "C4 Container",
    "C4 Component",
    "C4 View",
}
PROHIBITED_PROFILE_LIKE_TYPES = {
    "Architecture Constraint",
    "Architecture Overview",
    "Constraint Set",
    "Product Quality Requirement",
    "Product Quality View",
    "Quality Concern",
    "Risk Driver",
    "Risk Driver Set",
    "System Evaluation Approach",
}
REQUIREMENT_TYPES = {
    "functional",
    "quality",
    "process",
    "human-factors",
    "usability",
    "constraint",
}
REQUIREMENT_LIFECYCLES = {"active", "retired"}
REQUIREMENT_SUBJECT_TYPES = {
    "System",
    "Capability",
    "Feature",
    "Surface",
    "Bounded Context",
    "C4 Software System",
    "C4 Container",
    "C4 Component",
}
QUALITY_CHARACTERISTICS = {
    "functional-suitability",
    "performance-efficiency",
    "compatibility",
    "interaction-capability",
    "reliability",
    "security",
    "maintainability",
    "flexibility",
    "safety",
}
PLURAL_CATCH_ALLS = {
    "offerings.md",
    "audiences.md",
    "needs.md",
    "jobs.md",
    "value-propositions.md",
    "use-cases.md",
    "requirements.md",
    "product-quality-requirements.md",
    "capabilities.md",
    "features.md",
    "surfaces.md",
    "subdomains.md",
    "bounded-contexts.md",
    "context-maps.md",
    "software-systems.md",
    "components.md",
}

C4_ELEMENTS = frozenset({"C4 Software System", "C4 Container", "C4 Component"})
ARCHITECTURE_VIEWS = frozenset({"Capability", "Feature", "Surface"})


@dataclass(frozen=True)
class RelationshipSpec:
    identifier: str
    forward_role: str
    inverse_role: str
    subject_types: frozenset[str] | None
    object_types: frozenset[str] | None
    assertion_source: str
    subject_min: int = 0
    subject_max: int | None = None
    object_min: int = 0
    object_max: int | None = None
    allow_external_object: bool = False
    materialize_forward: bool = True
    materialize_inverse: bool = True


RELATIONSHIP_SPECS = (
    RelationshipSpec(
        "requirement-source-is-source-of-requirement",
        "is-source-of-requirement",
        "originates-from-requirement-source",
        None,
        frozenset({"Requirement"}),
        "requirement_sources",
        materialize_inverse=False,
    ),
    RelationshipSpec(
        "requirement-is-derived-from-requirement",
        "is-derived-from-requirement",
        "is-parent-of-requirement",
        frozenset({"Requirement"}),
        frozenset({"Requirement"}),
        "derived_from",
        materialize_forward=False,
    ),
    RelationshipSpec(
        "requirement-supersedes-requirement",
        "supersedes-requirement",
        "is-superseded-by-requirement",
        frozenset({"Requirement"}),
        frozenset({"Requirement"}),
        "supersedes",
        materialize_forward=False,
    ),
    RelationshipSpec(
        "requirement-has-subject",
        "has-subject",
        "is-subject-of-requirement",
        frozenset({"Requirement"}),
        frozenset(REQUIREMENT_SUBJECT_TYPES),
        "subject",
        subject_min=1,
        subject_max=1,
        materialize_forward=False,
    ),
    RelationshipSpec(
        "requirement-incorporates-normative-reference",
        "incorporates-normative-reference",
        "is-incorporated-by-requirement",
        frozenset({"Requirement"}),
        None,
        "forward",
        allow_external_object=True,
    ),
    RelationshipSpec(
        "adr-responds-to-requirement",
        "responds-to-requirement",
        "is-addressed-by-adr",
        frozenset({"Architecture Decision Record"}),
        frozenset({"Requirement"}),
        "forward",
    ),
    RelationshipSpec(
        "offering-depends-on-capability",
        "depends-on-capability",
        "supports-offering",
        frozenset({"Offering"}),
        frozenset({"Capability"}),
        "forward",
    ),
    RelationshipSpec(
        "use-case-exercises-capability",
        "exercises-capability",
        "is-exercised-by-use-case",
        frozenset({"Use Case"}),
        frozenset({"Capability"}),
        "forward",
    ),
    RelationshipSpec(
        "feature-enables-use-case",
        "enables-use-case",
        "is-enabled-by-feature",
        frozenset({"Feature"}),
        frozenset({"Use Case"}),
        "forward",
    ),
    RelationshipSpec(
        "feature-contributes-to-capability",
        "contributes-to-capability",
        "is-supported-by-feature",
        frozenset({"Feature"}),
        frozenset({"Capability"}),
        "forward",
    ),
    RelationshipSpec(
        "feature-is-available-through-surface",
        "is-available-through-surface",
        "exposes-feature",
        frozenset({"Feature"}),
        frozenset({"Surface"}),
        "forward",
    ),
    RelationshipSpec(
        "architecture-view-is-realized-by-c4-element",
        "is-realized-by-c4-element",
        "realizes-architecture-view",
        ARCHITECTURE_VIEWS,
        C4_ELEMENTS,
        "forward",
    ),
    RelationshipSpec(
        "bounded-context-models-subdomain",
        "models-subdomain",
        "is-modeled-by-bounded-context",
        frozenset({"Bounded Context"}),
        frozenset({"Subdomain"}),
        "forward",
    ),
    RelationshipSpec(
        "context-map-relates-context",
        "relates-bounded-context",
        "participates-in-context-map",
        frozenset({"Context Map"}),
        frozenset({"Bounded Context"}),
        "forward",
        subject_min=1,
    ),
    RelationshipSpec(
        "surface-contains-surface",
        "contains-surface",
        "is-contained-by-surface",
        frozenset({"Surface"}),
        frozenset({"Surface"}),
        "surface-path",
        object_max=1,
    ),
    RelationshipSpec(
        "c4-system-contains-container",
        "contains-c4-container",
        "belongs-to-c4-software-system",
        frozenset({"C4 Software System"}),
        frozenset({"C4 Container"}),
        "inverse",
        object_min=1,
        object_max=1,
    ),
    RelationshipSpec(
        "c4-container-contains-component",
        "contains-c4-component",
        "belongs-to-c4-container",
        frozenset({"C4 Container"}),
        frozenset({"C4 Component"}),
        "component-path",
        object_min=1,
        object_max=1,
    ),
    RelationshipSpec(
        "c4-view-projects-element",
        "projects-c4-element",
        "appears-in-c4-view",
        frozenset({"C4 View"}),
        C4_ELEMENTS,
        "forward",
        subject_min=1,
    ),
)

RELATIONSHIP_BY_ID = {spec.identifier: spec for spec in RELATIONSHIP_SPECS}
ROLE_TO_SPEC = {
    role: (spec, side)
    for spec in RELATIONSHIP_SPECS
    for role, side in ((spec.forward_role, "forward"), (spec.inverse_role, "inverse"))
}

PEER_OWNED_RELATIONSHIP_IDS = frozenset(
    {
        "architecture-constrains-compilation",
        "compilation-produces-implementation-unit",
        "implementation-unit-realizes-authority",
        "evaluation-definition-evaluates-requirement",
        "evaluation-definition-evaluates-architecture-realization",
        "evaluation-protocol-evaluates-implementation-conformance",
        "evaluation-protocol-defines-case",
        "evaluation-suite-groups-definition",
        "evaluation-execution-applies-definition",
        "evaluation-execution-assesses-implementation",
        "evaluation-execution-produces-result",
        "evaluation-result-evidences-requirement",
        "evaluation-result-evidences-architecture-realization",
        "evaluation-result-evidences-implementation-conformance",
        "evaluation-report-projects-result",
        "signal-draws-attention-to",
        "observation-informs-orientation",
        "orientation-frames-decision",
        "decision-selects-action",
        "action-produces-observation",
    }
)
