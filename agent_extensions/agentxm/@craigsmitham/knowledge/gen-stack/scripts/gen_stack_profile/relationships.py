"""Normalize, project, and validate profile-governed relationships."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from .corpus import Concept, load_concepts
from .profile import (
    GOVERNED_TYPES,
    RELATIONSHIP_BY_ID,
    RELATIONSHIP_SPECS,
    ROLE_TO_SPEC,
    RelationshipSpec,
)


@dataclass(frozen=True, order=True)
class Edge:
    relationship_id: str
    subject: PurePosixPath | str
    object: PurePosixPath | str


@dataclass(frozen=True)
class RelationshipDiagnostic:
    rule: str
    path: PurePosixPath
    message: str


@dataclass
class RelationshipAnalysis:
    concepts: dict[PurePosixPath, Concept]
    actual: dict[PurePosixPath, dict[str, list[str]]]
    expected: dict[PurePosixPath, dict[str, list[str]]]
    diagnostics: list[RelationshipDiagnostic]
    edges: tuple[Edge, ...] = ()

    @property
    def projection_paths(self) -> list[PurePosixPath]:
        return sorted(
            relative
            for relative, concept in self.concepts.items()
            if concept.metadata.get("type") in GOVERNED_TYPES
            and self.actual.get(relative, {}) != self.expected.get(relative, {})
        )


def _is_external(value: str) -> bool:
    return bool(urlsplit(value).scheme)


def _internal_path(value: str) -> PurePosixPath | None:
    if not value.startswith("/") or "?" in value or "#" in value:
        return None
    relative = PurePosixPath(value.lstrip("/"))
    if not relative.parts or relative.is_absolute() or ".." in relative.parts:
        return None
    return relative


def _shown(relative: PurePosixPath) -> str:
    return f"/{relative.as_posix()}"


def _endpoint_types(spec: RelationshipSpec, side: str) -> frozenset[str] | None:
    return spec.subject_types if side == "forward" else spec.object_types


def _target_types(spec: RelationshipSpec, side: str) -> frozenset[str] | None:
    return spec.object_types if side == "forward" else spec.subject_types


def analyze_relationships(root: Path) -> RelationshipAnalysis:
    root = root.resolve()
    diagnostics: list[RelationshipDiagnostic] = []
    try:
        concepts = load_concepts(root)
    except Exception as exc:
        return RelationshipAnalysis(
            {},
            {},
            {},
            [RelationshipDiagnostic("relationship-corpus", PurePosixPath("."), str(exc))],
        )

    actual: dict[PurePosixPath, dict[str, list[str]]] = {}
    valid_roles: dict[PurePosixPath, dict[str, list[str]]] = {}

    for relative, concept in concepts.items():
        concept_type = concept.metadata.get("type")
        if concept_type not in GOVERNED_TYPES:
            continue
        for alias in ("relations", "links"):
            if alias in concept.metadata:
                diagnostics.append(
                    RelationshipDiagnostic(
                        "relationship-frontmatter",
                        relative,
                        f"{alias} is not a controlled relationship field; use relationships.",
                    )
                )
        for role in ROLE_TO_SPEC:
            if role in concept.metadata:
                diagnostics.append(
                    RelationshipDiagnostic(
                        "relationship-frontmatter",
                        relative,
                        f"{role} must be nested under relationships, not used as a top-level field.",
                    )
                )
        raw = concept.metadata.get("relationships")
        if raw is None:
            actual[relative] = {}
            valid_roles[relative] = {}
            continue
        if not isinstance(raw, dict) or not raw:
            diagnostics.append(
                RelationshipDiagnostic(
                    "relationship-frontmatter",
                    relative,
                    "relationships must be a non-empty mapping when present.",
                )
            )
            actual[relative] = raw if isinstance(raw, dict) else {}  # type: ignore[assignment]
            valid_roles[relative] = {}
            continue

        normalized: dict[str, list[str]] = {}
        for role, targets in raw.items():
            if not isinstance(role, str) or role not in ROLE_TO_SPEC:
                diagnostics.append(
                    RelationshipDiagnostic(
                        "relationship-role",
                        relative,
                        f"Unknown Gen Stack relationship role {role!r}.",
                    )
                )
                continue
            if (
                not isinstance(targets, list)
                or not targets
                or any(not isinstance(target, str) or not target.strip() for target in targets)
            ):
                diagnostics.append(
                    RelationshipDiagnostic(
                        "relationship-frontmatter",
                        relative,
                        f"{role} must be a non-empty list of non-empty strings.",
                    )
                )
                continue
            cleaned = [target.strip() for target in targets]
            if len(cleaned) != len(set(cleaned)):
                diagnostics.append(
                    RelationshipDiagnostic(
                        "relationship-frontmatter",
                        relative,
                        f"{role} must not contain duplicate targets.",
                    )
                )
                continue

            spec, side = ROLE_TO_SPEC[role]
            endpoint_types = _endpoint_types(spec, side)
            if endpoint_types is not None and concept_type not in endpoint_types:
                diagnostics.append(
                    RelationshipDiagnostic(
                        "relationship-role-type",
                        relative,
                        f"{role} is not valid on a concept of type {concept_type}.",
                    )
                )
                continue

            target_types = _target_types(spec, side)
            role_valid = True
            for target in cleaned:
                if _is_external(target):
                    if not (side == "forward" and spec.allow_external_object):
                        diagnostics.append(
                            RelationshipDiagnostic(
                                "relationship-target",
                                relative,
                                f"{role} does not permit the external target {target!r}.",
                            )
                        )
                        role_valid = False
                    continue
                target_path = _internal_path(target)
                if target_path is None:
                    diagnostics.append(
                        RelationshipDiagnostic(
                            "relationship-target",
                            relative,
                            f"{role} target {target!r} must be a bundle-relative concept path or an allowed external URI.",
                        )
                    )
                    role_valid = False
                    continue
                target_concept = concepts.get(target_path)
                if target_concept is None:
                    diagnostics.append(
                        RelationshipDiagnostic(
                            "relationship-target-resolves",
                            relative,
                            f"{role} target {target!r} must resolve to a maintained non-reserved concept.",
                        )
                    )
                    role_valid = False
                    continue
                target_type = target_concept.metadata.get("type")
                if target_types is not None and target_type not in target_types:
                    diagnostics.append(
                        RelationshipDiagnostic(
                            "relationship-target-type",
                            relative,
                            f"{role} target {target!r} has incompatible type {target_type!r}.",
                        )
                    )
                    role_valid = False
            normalized[role] = sorted(cleaned)
            if role_valid:
                valid_roles.setdefault(relative, {})[role] = sorted(cleaned)
        actual[relative] = dict(sorted(normalized.items()))
        valid_roles.setdefault(relative, {})

    edges: set[Edge] = set()

    for spec in RELATIONSHIP_SPECS:
        if spec.assertion_source not in {"forward", "inverse"}:
            continue
        role = spec.forward_role if spec.assertion_source == "forward" else spec.inverse_role
        side = spec.assertion_source
        endpoint_types = _endpoint_types(spec, side)
        for relative, concept in concepts.items():
            if endpoint_types is not None and concept.metadata.get("type") not in endpoint_types:
                continue
            targets = valid_roles.get(relative, {}).get(role, [])
            minimum = spec.subject_min if side == "forward" else spec.object_min
            maximum = spec.subject_max if side == "forward" else spec.object_max
            if len(targets) < minimum or (maximum is not None and len(targets) > maximum):
                expected_count = (
                    f"exactly {minimum}"
                    if maximum == minimum
                    else f"between {minimum} and {maximum}"
                    if maximum is not None
                    else f"at least {minimum}"
                )
                diagnostics.append(
                    RelationshipDiagnostic(
                        "relationship-cardinality",
                        relative,
                        f"{role} requires {expected_count} target(s); found {len(targets)}.",
                    )
                )
            for target in targets:
                endpoint: PurePosixPath | str
                endpoint = target if _is_external(target) else _internal_path(target)  # type: ignore[assignment]
                if endpoint is None:
                    continue
                if side == "forward":
                    edges.add(Edge(spec.identifier, relative, endpoint))
                else:
                    edges.add(Edge(spec.identifier, endpoint, relative))

    requirements = {
        relative: concept
        for relative, concept in concepts.items()
        if concept.metadata.get("type") == "Requirement"
    }
    requirement_ids = {
        requirement_id: relative
        for relative, concept in requirements.items()
        if isinstance((requirement_id := concept.metadata.get("requirement_id")), str)
    }
    supersession_edges: dict[str, list[str]] = {}

    for relative, concept in requirements.items():
        sources = concept.metadata.get("requirement_sources", [])
        if isinstance(sources, list):
            for source in sources:
                if not isinstance(source, str) or _is_external(source):
                    continue
                source_path = _internal_path(source)
                source_concept = concepts.get(source_path) if source_path is not None else None
                if source_concept is None:
                    diagnostics.append(
                        RelationshipDiagnostic(
                            "relationship-target-resolves",
                            relative,
                            f"requirement_sources target {source!r} must resolve or be an external URI.",
                        )
                    )
                    continue
                if source_concept.metadata.get("type") == "Requirement":
                    diagnostics.append(
                        RelationshipDiagnostic(
                            "relationship-target-type",
                            relative,
                            "requirement_sources must not target another Requirement.",
                        )
                    )
                    continue
                edges.add(
                    Edge("requirement-source-is-source-of-requirement", source_path, relative)
                )

        subject = concept.metadata.get("subject")
        if isinstance(subject, str):
            subject_path = _internal_path(subject)
            if subject_path in concepts:
                edges.add(Edge("requirement-has-subject", relative, subject_path))

        parents = concept.metadata.get("derived_from", [])
        if isinstance(parents, list):
            for parent_id in parents:
                if isinstance(parent_id, str) and parent_id in requirement_ids:
                    edges.add(
                        Edge(
                            "requirement-is-derived-from-requirement",
                            relative,
                            requirement_ids[parent_id],
                        )
                    )

        predecessors = concept.metadata.get("supersedes", [])
        if isinstance(predecessors, list) and isinstance(
            successor_id := concept.metadata.get("requirement_id"), str
        ):
            typed_predecessors = [item for item in predecessors if isinstance(item, str)]
            supersession_edges[successor_id] = typed_predecessors
            for predecessor_id in typed_predecessors:
                predecessor_path = requirement_ids.get(predecessor_id)
                if predecessor_id == successor_id:
                    diagnostics.append(
                        RelationshipDiagnostic(
                            "requirement-supersession",
                            relative,
                            "A Requirement cannot supersede itself.",
                        )
                    )
                elif predecessor_path is None:
                    diagnostics.append(
                        RelationshipDiagnostic(
                            "requirement-supersession",
                            relative,
                            f"supersedes references unknown requirement_id {predecessor_id}.",
                        )
                    )
                else:
                    predecessor = requirements[predecessor_path]
                    if predecessor.metadata.get("requirement_lifecycle") != "retired":
                        diagnostics.append(
                            RelationshipDiagnostic(
                                "requirement-supersession-lifecycle",
                                relative,
                                f"superseded Requirement {predecessor_id} must have requirement_lifecycle retired.",
                            )
                        )
                    edges.add(
                        Edge(
                            "requirement-supersedes-requirement",
                            relative,
                            predecessor_path,
                        )
                    )

    def supersession_cycle(node: str, active: set[str], visited: set[str]) -> bool:
        if node in active:
            return True
        if node in visited:
            return False
        active.add(node)
        for predecessor in supersession_edges.get(node, []):
            if predecessor in supersession_edges and supersession_cycle(
                predecessor, active, visited
            ):
                return True
        active.remove(node)
        visited.add(node)
        return False

    supersession_visited: set[str] = set()
    for requirement_id, relative in requirement_ids.items():
        if requirement_id in supersession_edges and supersession_cycle(
            requirement_id, set(), supersession_visited
        ):
            diagnostics.append(
                RelationshipDiagnostic(
                    "requirement-supersession-cycle",
                    relative,
                    "supersedes relationships must not contain a cycle.",
                )
            )
            break

    for relative, concept in concepts.items():
        concept_type = concept.metadata.get("type")
        if concept_type == "Surface" and len(relative.parts) > 3:
            parent = relative.parent.with_suffix(".md")
            parent_concept = concepts.get(parent)
            if parent_concept is None or parent_concept.metadata.get("type") != "Surface":
                diagnostics.append(
                    RelationshipDiagnostic(
                        "relationship-structure",
                        relative,
                        f"Nested Surface path requires maintained parent Surface {_shown(parent)}.",
                    )
                )
            else:
                edges.add(Edge("surface-contains-surface", parent, relative))
        elif concept_type == "C4 Component" and len(relative.parts) >= 6:
            parent = PurePosixPath(*relative.parts[:3], f"{relative.parts[3]}.md")
            parent_concept = concepts.get(parent)
            if parent_concept is None or parent_concept.metadata.get("type") != "C4 Container":
                diagnostics.append(
                    RelationshipDiagnostic(
                        "relationship-structure",
                        relative,
                        f"C4 Component path requires maintained owning Container {_shown(parent)}.",
                    )
                )
            else:
                edges.add(Edge("c4-container-contains-component", parent, relative))

    expected_sets: dict[PurePosixPath, dict[str, set[str]]] = defaultdict(
        lambda: defaultdict(set)
    )
    ordered_edges = sorted(
        edges,
        key=lambda edge: (
            edge.relationship_id,
            str(edge.subject),
            str(edge.object),
        ),
    )
    for edge in ordered_edges:
        spec = RELATIONSHIP_BY_ID[edge.relationship_id]
        subject_internal = isinstance(edge.subject, PurePosixPath)
        object_internal = isinstance(edge.object, PurePosixPath)
        subject_governed = (
            subject_internal
            and edge.subject in concepts
            and concepts[edge.subject].metadata.get("type") in GOVERNED_TYPES
        )
        object_governed = (
            object_internal
            and edge.object in concepts
            and concepts[edge.object].metadata.get("type") in GOVERNED_TYPES
        )
        if spec.materialize_forward and subject_governed:
            target = _shown(edge.object) if object_internal else str(edge.object)
            expected_sets[edge.subject][spec.forward_role].add(target)
        if spec.materialize_inverse and object_governed and subject_internal:
            expected_sets[edge.object][spec.inverse_role].add(_shown(edge.subject))

    expected: dict[PurePosixPath, dict[str, list[str]]] = {}
    for relative, concept in concepts.items():
        if concept.metadata.get("type") not in GOVERNED_TYPES:
            continue
        expected[relative] = {
            role: sorted(targets)
            for role, targets in sorted(expected_sets.get(relative, {}).items())
            if targets
        }
        if actual.get(relative, {}) != expected[relative]:
            diagnostics.append(
                RelationshipDiagnostic(
                    "relationship-projection",
                    relative,
                    "relationships does not match the authoritative assertions and derived reciprocals; run sync-gen-stack-relationships.py.",
                )
            )

    return RelationshipAnalysis(concepts, actual, expected, diagnostics, tuple(ordered_edges))
