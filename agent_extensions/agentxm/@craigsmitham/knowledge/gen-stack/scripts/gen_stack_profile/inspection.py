"""Deterministic, read-only inspection projections for a Gen Stack corpus."""

from __future__ import annotations

import datetime as dt
import hashlib
import importlib.util
import json
import re
from collections import defaultdict, deque
from functools import lru_cache
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from .corpus import Concept, load_concepts
from .profile import (
    ARCHITECTURE_REALIZATION_TYPES,
    ARCHITECTURE_VIEWS,
    C4_ELEMENTS,
    EVALUATION_PROTOCOL_TYPE,
    GOVERNED_TYPES,
    PROFILE_ID,
    PROFILE_VERSION,
    RELATIONSHIP_BY_ID,
    REQUIREMENT_SUBJECT_TYPES,
)
from .relationships import Edge, RelationshipAnalysis, analyze_relationships


SCHEMA_VERSION = "gen-stack-inspection/v1alpha3"
COMPATIBLE_SNAPSHOT_VERSIONS = frozenset(
    {"gen-stack-inspection/v1alpha2", SCHEMA_VERSION}
)
PRODUCER_NAME = "gen-stack-inspection"
PRODUCER_VERSION = "0.3.0"
MAX_SEARCH_RESULTS = 50
MAX_GRAPH_RESULTS = 500
MAX_CONCEPT_BYTES = 2 * 1024 * 1024
MAX_CORPUS_BYTES = 32 * 1024 * 1024
MAX_CONCEPTS = 10_000
MAX_PATH_PARTS = 128
MAX_OUTPUT_BYTES = 16 * 1024 * 1024

CROSS_VIEW_RELATIONSHIPS = frozenset(
    {
        "feature-contributes-to-capability",
        "feature-is-available-through-surface",
        "architecture-view-is-realized-by-c4-element",
    }
)
HIERARCHY_RELATIONSHIPS = frozenset(
    {
        "surface-contains-surface",
        "c4-system-contains-container",
        "c4-container-contains-component",
    }
)


class InspectionFailure(Exception):
    """A stable, user-actionable inspection failure."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _json_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, (set, frozenset)):
        return sorted(_json_value(item) for item in value)
    if isinstance(value, (Path, PurePosixPath)):
        return value.as_posix()
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        _json_value(value),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _digest(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _ref(relative: PurePosixPath | str) -> str:
    if isinstance(relative, str):
        return relative
    return f"/{relative.as_posix()}"


def _section_map(body: str) -> dict[str, str]:
    matches = list(re.finditer(r"^##\s+(.+?)\s*$", body, flags=re.MULTILINE))
    sections: dict[str, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        sections[match.group(1).strip()] = body[match.end() : end].strip()
    return sections


def _load_validator(repository_root: Path) -> dict[str, object]:
    script = Path(__file__).resolve().parent.parent / "validate-gen-stack-profile.py"
    spec = importlib.util.spec_from_file_location("gen_stack_profile_validator", script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load profile validator from {script.name}.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.validate(repository_root)


def _safe_diagnostic_path(repository_root: Path, raw: object) -> str:
    value = str(raw)
    path = Path(value)
    if not path.is_absolute():
        return PurePosixPath(value).as_posix()
    try:
        return path.resolve(strict=False).relative_to(repository_root).as_posix()
    except ValueError:
        return "<outside-repository>"


@lru_cache(maxsize=1)
def _producer_digest() -> str:
    package_root = Path(__file__).resolve().parent
    content = bytearray()
    for path in sorted(package_root.glob("*.py")):
        content.extend(path.name.encode("utf-8"))
        content.extend(b"\0")
        content.extend(path.read_bytes())
        content.extend(b"\0")
    return _digest(bytes(content))


def _guard_corpus(repository_root: Path) -> dict[str, object] | None:
    """Reject inputs that exceed inspection bounds before parsing their contents."""

    corpus_root = repository_root / "gen-stack"
    if not corpus_root.is_dir() or corpus_root.is_symlink():
        return None
    files: list[Path] = []
    total_bytes = 0
    for path in corpus_root.rglob("*"):
        relative = path.relative_to(corpus_root)
        if path.is_symlink():
            return {
                "state": "invalid",
                "structural_result": "fail",
                "semantic_result": "unknown",
                "governed_concepts": 0,
                "errors": [
                    {
                        "rule": "inspection-symlink",
                        "path": f"gen-stack/{relative.as_posix()}",
                        "message": "Inspection refuses symlinks inside the Gen Stack corpus.",
                    }
                ],
            }
        if path.suffix != ".md" or not path.is_file():
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if len(relative.parts) > MAX_PATH_PARTS:
            message = f"Corpus path depth exceeds the inspection limit of {MAX_PATH_PARTS} parts."
        elif size > MAX_CONCEPT_BYTES:
            message = f"Markdown source exceeds the inspection limit of {MAX_CONCEPT_BYTES} bytes."
        else:
            message = ""
        if message:
            return {
                "state": "invalid",
                "structural_result": "fail",
                "semantic_result": "unknown",
                "governed_concepts": 0,
                "errors": [
                    {
                        "rule": "inspection-resource-limit",
                        "path": f"gen-stack/{relative.as_posix()}",
                        "message": message,
                    }
                ],
            }
        files.append(path)
        total_bytes += size
        if len(files) > MAX_CONCEPTS or total_bytes > MAX_CORPUS_BYTES:
            limit = (
                f"{MAX_CONCEPTS} Markdown sources"
                if len(files) > MAX_CONCEPTS
                else f"{MAX_CORPUS_BYTES} total Markdown bytes"
            )
            return {
                "state": "invalid",
                "structural_result": "fail",
                "semantic_result": "unknown",
                "governed_concepts": 0,
                "errors": [
                    {
                        "rule": "inspection-resource-limit",
                        "path": "gen-stack",
                        "message": f"Corpus exceeds the inspection limit of {limit}.",
                    }
                ],
            }
    return None


def _edge_sort_key(edge: Edge) -> tuple[str, str, str]:
    return edge.relationship_id, str(edge.subject), str(edge.object)


class InspectionPlane:
    """One indexed view over a validated, profile-governed corpus."""

    def __init__(
        self,
        repository_root: Path,
        validation_report: dict[str, object] | None = None,
        input_identity: dict[str, object] | None = None,
    ) -> None:
        self.repository_root = repository_root.resolve()
        self.input_identity = input_identity or {"kind": "working-tree"}
        self.corpus_root = self.repository_root / "gen-stack"
        self.validation_report = validation_report or _guard_corpus(
            self.repository_root
        ) or _load_validator(self.repository_root)
        self.state = str(self.validation_report.get("state", "invalid"))
        self.structural_result = str(
            self.validation_report.get("structural_result", "fail")
        )
        self.conforming = self.state == "conforming" and self.structural_result == "pass"
        self.concepts: dict[PurePosixPath, Concept] = {}
        self.requirement_ids: dict[str, PurePosixPath] = {}
        self.protocol_ids: dict[str, PurePosixPath] = {}
        self.analysis = RelationshipAnalysis({}, {}, {}, [])
        self.edges: tuple[Edge, ...] = ()
        self.edge_by_ref: dict[str, Edge] = {}
        self.requirements_by_subject: dict[PurePosixPath, list[PurePosixPath]] = {}
        self.children: dict[PurePosixPath, list[PurePosixPath]] = {}
        self.parents: dict[PurePosixPath, PurePosixPath] = {}
        self._corpus_digest: str | None = None

        if self.conforming:
            loaded = load_concepts(self.corpus_root)
            self.concepts = {
                relative: concept
                for relative, concept in loaded.items()
                if concept.metadata.get("type") in GOVERNED_TYPES
            }
            self.analysis = analyze_relationships(self.corpus_root)
            self.edges = tuple(sorted(self.analysis.edges, key=_edge_sort_key))
            self.requirement_ids = {
                str(concept.metadata["requirement_id"]): relative
                for relative, concept in self.concepts.items()
                if concept.metadata.get("type") == "Requirement"
                and isinstance(concept.metadata.get("requirement_id"), str)
            }
            self.protocol_ids = {
                str(concept.metadata["protocol_id"]): relative
                for relative, concept in self.concepts.items()
                if concept.metadata.get("type") == EVALUATION_PROTOCOL_TYPE
                and isinstance(concept.metadata.get("protocol_id"), str)
            }
            requirements: dict[PurePosixPath, list[PurePosixPath]] = defaultdict(list)
            children: dict[PurePosixPath, list[PurePosixPath]] = defaultdict(list)
            for edge in self.edges:
                if not isinstance(edge.subject, PurePosixPath) or not isinstance(
                    edge.object, PurePosixPath
                ):
                    continue
                if edge.relationship_id == "requirement-has-subject":
                    requirements[edge.object].append(edge.subject)
                if edge.relationship_id in HIERARCHY_RELATIONSHIPS:
                    children[edge.subject].append(edge.object)
                    self.parents[edge.object] = edge.subject
            self.requirements_by_subject = {
                subject: sorted(paths)
                for subject, paths in requirements.items()
            }
            self.children = {
                parent: sorted(paths) for parent, paths in children.items()
            }
            self.edge_by_ref = {self._edge_ref(edge): edge for edge in self.edges}
            self._corpus_digest = self._calculate_corpus_digest()

    def _calculate_corpus_digest(self) -> str | None:
        if not self.conforming:
            return None
        content = bytearray()
        for path in sorted(self.corpus_root.rglob("*.md")):
            if path.is_symlink() or not path.is_file():
                continue
            relative = path.relative_to(self.corpus_root).as_posix()
            content.extend(relative.encode("utf-8"))
            content.extend(b"\0")
            content.extend(path.read_bytes())
            content.extend(b"\0")
        return _digest(bytes(content))

    @property
    def corpus_digest(self) -> str | None:
        return self._corpus_digest

    @property
    def snapshot_identity(self) -> str | None:
        corpus_digest = self.corpus_digest
        if corpus_digest is None:
            return None
        return _digest(
            _canonical_json(
                {
                    "profile": f"{PROFILE_ID}/{PROFILE_VERSION}",
                    "corpus_digest": corpus_digest,
                }
            )
        )

    def _base_diagnostics(self) -> list[dict[str, object]]:
        diagnostics: list[dict[str, object]] = []
        for item in self.validation_report.get("errors", []):
            if not isinstance(item, dict):
                continue
            diagnostics.append(
                {
                    "rule": str(item.get("rule", "profile-validation")),
                    "severity": "error",
                    "path": _safe_diagnostic_path(
                        self.repository_root, item.get("path", ".")
                    ),
                    "location": None,
                    "message": str(item.get("message", "Profile validation failed.")),
                    "blocking": True,
                    "recovery": None,
                }
            )
        return diagnostics

    def _base_unknowns(self, *, include_okf: bool = True) -> list[dict[str, str]]:
        unknowns = [
            {
                "claim": "named-semantic-review",
                "reason": "A named semantic review has not been supplied.",
            },
            {
                "claim": "coverage-or-fitness",
                "reason": "Corpus inspection does not assess completeness, satisfaction, coverage, or operational fitness.",
            },
        ]
        if include_okf:
            unknowns.insert(
                0,
                {
                    "claim": "okf-conformance",
                    "reason": "The native OKF validator was not executed by this inspection operation.",
                },
            )
        return unknowns

    def envelope(
        self,
        operation: str,
        data: object,
        *,
        diagnostics: Iterable[dict[str, object]] = (),
        unknowns: Iterable[dict[str, str]] = (),
        check_stability: bool = True,
        okf_result: str = "unknown",
        include_okf_unknown: bool = True,
    ) -> dict[str, object]:
        if (
            check_stability
            and self.conforming
            and self._calculate_corpus_digest() != self._corpus_digest
        ):
            raise InspectionFailure(
                "corpus-changed-during-inspection",
                "The Gen Stack corpus changed while it was being inspected; retry against a stable snapshot.",
            )
        payload: dict[str, object] = {
            "schema_version": SCHEMA_VERSION,
            "producer": {
                "name": PRODUCER_NAME,
                "version": PRODUCER_VERSION,
                "digest": _producer_digest(),
            },
            "snapshot": {
                "profile": {"identity": PROFILE_ID, "version": PROFILE_VERSION},
                "snapshot_id": self.snapshot_identity,
                "corpus_digest": self.corpus_digest,
            },
            "input": _json_value(self.input_identity),
            "discovery": {
                "state": self.state,
                "okf_result": okf_result,
                "structural_result": self.structural_result,
                "semantic_result": "unknown",
            },
            "operation": operation,
            "data": _json_value(data),
            "diagnostics": [*self._base_diagnostics(), *_json_value(list(diagnostics))],
            "unknowns": [
                *self._base_unknowns(include_okf=include_okf_unknown),
                *_json_value(list(unknowns)),
            ],
        }
        encoded = _canonical_json(payload)
        if len(encoded) > MAX_OUTPUT_BYTES:
            raise InspectionFailure(
                "inspection-output-limit",
                f"The projected output exceeds the inspection limit of {MAX_OUTPUT_BYTES} bytes; request a narrower view.",
            )
        payload["output_digest"] = _digest(encoded)
        return payload

    def failure_envelope(self, operation: str, failure: InspectionFailure) -> dict[str, object]:
        return self.envelope(
            operation,
            None,
            diagnostics=[
                {
                    "rule": failure.code,
                    "severity": "error",
                    "path": ".",
                    "location": None,
                    "message": failure.message,
                    "blocking": True,
                    "recovery": None,
                }
            ],
            check_stability=False,
        )

    def require_conforming(self, operation: str) -> None:
        if not self.conforming:
            raise InspectionFailure(
                "operation-ineligible",
                f"{operation} requires a structurally conforming Gen Stack corpus; current state is {self.state}.",
            )

    def _edge_ref(self, edge: Edge) -> str:
        identity = "|".join(
            (edge.relationship_id, _ref(edge.subject), _ref(edge.object))
        ).encode("utf-8")
        return f"edge:{hashlib.sha256(identity).hexdigest()[:16]}"

    def resolve(self, value: str) -> PurePosixPath:
        self.require_conforming("resolve")
        candidate = value.strip()
        if candidate in self.requirement_ids:
            return self.requirement_ids[candidate]
        if candidate in self.protocol_ids:
            return self.protocol_ids[candidate]
        if candidate.startswith("gen-stack/"):
            candidate = candidate[len("gen-stack/") :]
        candidate = candidate.lstrip("/")
        relative = PurePosixPath(candidate)
        if not relative.parts or relative.is_absolute() or ".." in relative.parts:
            raise InspectionFailure("invalid-reference", f"Invalid concept reference {value!r}.")
        if relative not in self.concepts:
            raise InspectionFailure(
                "concept-not-found",
                f"No governed concept or Requirement ID resolves from {value!r}.",
            )
        return relative

    def _available_views(self, relative: PurePosixPath) -> list[str]:
        concept_type = self.concepts[relative].metadata.get("type")
        views = ["relations", "source"]
        if concept_type in REQUIREMENT_SUBJECT_TYPES:
            views.append("requirements")
        if concept_type in {"Surface", *C4_ELEMENTS}:
            views.append("children")
        if concept_type == "Requirement":
            views.append("lineage")
        return sorted(views)

    def _concept_summary(self, relative: PurePosixPath) -> dict[str, object]:
        concept = self.concepts[relative]
        summary: dict[str, object] = {
            "ref": _ref(relative),
            "type": concept.metadata.get("type"),
            "title": concept.metadata.get("title"),
            "description": concept.metadata.get("description"),
            "status": concept.metadata.get("status"),
        }
        if concept.metadata.get("type") == "Requirement":
            summary.update(
                {
                    "requirement_id": concept.metadata.get("requirement_id"),
                    "requirement_type": concept.metadata.get("requirement_type"),
                    "requirement_lifecycle": concept.metadata.get(
                        "requirement_lifecycle"
                    ),
                    "subject": concept.metadata.get("subject"),
                }
            )
        if concept.metadata.get("type") == EVALUATION_PROTOCOL_TYPE:
            role = concept.metadata.get("evaluation_role")
            target_field = {
                "requirement-satisfaction": "requirements",
                "architecture-realization": "architecture_authorities",
                "implementation-conformance": "implementation_units",
            }.get(role)
            summary.update(
                {
                    "protocol_id": concept.metadata.get("protocol_id"),
                    "protocol_lifecycle": concept.metadata.get(
                        "protocol_lifecycle"
                    ),
                    "evaluation_role": role,
                    "targets": concept.metadata.get(target_field, [])
                    if target_field
                    else [],
                }
            )
        return summary

    def _concept_view(
        self, relative: PurePosixPath, *, include_body: bool = True
    ) -> dict[str, object]:
        concept = self.concepts[relative]
        metadata = {
            key: value
            for key, value in concept.metadata.items()
            if key
            not in {
                "type",
                "title",
                "description",
                "status",
                "relationships",
                "requirement_id",
                "requirement_type",
                "requirement_lifecycle",
                "subject",
                "protocol_id",
                "protocol_lifecycle",
                "evaluation_role",
                "requirements",
                "architecture_authorities",
                "implementation_units",
            }
        }
        view = self._concept_summary(relative)
        view.update(
            {
                "attributes": _json_value(metadata),
                "source": {
                    "path": f"gen-stack/{relative.as_posix()}",
                    "digest": _digest(concept.path.read_bytes()),
                },
                "available_views": self._available_views(relative),
            }
        )
        if include_body:
            view["body"] = concept.body.strip()
            view["sections"] = _section_map(concept.body)
        return view

    def _assertion_source(self, edge: Edge) -> tuple[str, str, str]:
        spec = RELATIONSHIP_BY_ID[edge.relationship_id]
        assertion = spec.assertion_source
        if assertion in {"surface-path", "component-path"}:
            return _ref(edge.object), "derived", assertion
        if assertion == "inverse":
            return _ref(edge.object), "asserted", spec.inverse_role
        if assertion == "requirement_sources":
            return _ref(edge.object), "asserted", assertion
        return _ref(edge.subject), "asserted", assertion

    def _edge_view(self, edge: Edge) -> dict[str, object]:
        source, derivation, field = self._assertion_source(edge)
        spec = RELATIONSHIP_BY_ID[edge.relationship_id]
        return {
            "ref": self._edge_ref(edge),
            "relationship": edge.relationship_id,
            "from": _ref(edge.subject),
            "to": _ref(edge.object),
            "forward_role": spec.forward_role,
            "inverse_role": spec.inverse_role,
            "assertion_source": source,
            "assertion": {"kind": derivation, "field": field},
            "derivation": derivation,
        }

    def _relations_for(self, relative: PurePosixPath) -> list[dict[str, object]]:
        return [
            self._edge_view(edge)
            for edge in self.edges
            if edge.subject == relative or edge.object == relative
        ]

    def status(self) -> dict[str, object]:
        operations = [
            "list",
            "show",
            "search",
            "evaluation-context",
            "evaluation-candidates",
            "snapshot",
            "path",
            "why",
            "affected-concepts",
        ]
        return self.envelope(
            "status",
            {
                "state": self.state,
                "governed_concepts": self.validation_report.get(
                    "governed_concepts", 0
                ),
                "operations": [
                    {
                        "operation": operation,
                        "eligible": self.conforming,
                        "reason": (
                            "Structural profile validation passed."
                            if self.conforming
                            else f"Current discovery state is {self.state}."
                        ),
                    }
                    for operation in operations
                ]
                + [
                    {"operation": "status", "eligible": True, "reason": "Always available."},
                    {"operation": "validate", "eligible": True, "reason": "Always available."},
                    {"operation": "check", "eligible": True, "reason": "Always available."},
                    {"operation": "diff", "eligible": True, "reason": "Operates on snapshot files."},
                ],
            },
        )

    def validation(self) -> dict[str, object]:
        return self.envelope(
            "validate",
            {
                "profile": {"identity": PROFILE_ID, "version": PROFILE_VERSION},
                "state": self.state,
                "okf_result": "unknown",
                "structural_result": self.structural_result,
                "semantic_result": "unknown",
                "coverage_or_fitness_result": "unknown",
                "governed_concepts": self.validation_report.get(
                    "governed_concepts", 0
                ),
            },
        )

    def list_concepts(self, kind: str) -> dict[str, object]:
        self.require_conforming("list")
        selectors: dict[str, set[str] | None] = {
            "concepts": None,
            "surfaces": {"Surface"},
            "structure": set(C4_ELEMENTS),
            "requirements": {"Requirement"},
            "intent": {
                "Offering",
                "Audience",
                "Need",
                "Job to Be Done",
                "Value Proposition",
                "Use Case",
                "Subdomain",
            },
            "architecture": {
                "Architecture Decision Record",
                "Capability",
                "Feature",
                "Surface",
                "Bounded Context",
                "Context Map",
                *C4_ELEMENTS,
                "C4 View",
            },
            "governance": {
                "System",
                "System Lifecycle",
                "System Ownership",
                "Architecture Decision Policy",
                "System Assurance",
            },
            "evaluations": {EVALUATION_PROTOCOL_TYPE},
        }
        if kind not in selectors:
            raise InspectionFailure(
                "unknown-list-kind",
                f"Unknown list kind {kind!r}; choose one of {', '.join(sorted(selectors))}.",
            )
        selected = selectors[kind]
        concepts = [
            self._concept_summary(relative)
            for relative, concept in sorted(self.concepts.items())
            if selected is None or concept.metadata.get("type") in selected
        ]
        return self.envelope("list", {"kind": kind, "concepts": concepts})

    def show(self, value: str, view: str | None = None) -> dict[str, object]:
        relative = self.resolve(value)
        selected_view = view or "concept"
        available = {"concept", *self._available_views(relative)}
        if selected_view not in available:
            raise InspectionFailure(
                "view-not-available",
                f"View {selected_view!r} is not available for {_ref(relative)}; choose one of {', '.join(sorted(available))}.",
            )
        if selected_view == "concept":
            data: object = self._concept_view(relative)
        elif selected_view == "source":
            concept = self.concepts[relative]
            data = {
                "concept": self._concept_summary(relative),
                "source": {
                    "path": f"gen-stack/{relative.as_posix()}",
                    "digest": _digest(concept.path.read_bytes()),
                    "content": concept.path.read_text(encoding="utf-8"),
                },
            }
        elif selected_view == "relations":
            data = {
                "concept": self._concept_summary(relative),
                "relations": self._relations_for(relative),
            }
        elif selected_view == "requirements":
            data = {
                "subject": self._concept_summary(relative),
                "direct_requirements": [
                    self._requirement_view(path)
                    for path in self.requirements_by_subject.get(relative, [])
                ],
                "inherited_requirements": None,
                "note": "Gen Stack does not infer Requirement inheritance from subject hierarchy.",
            }
        elif selected_view == "children":
            data = {
                "parent": self._concept_summary(relative),
                "children": [
                    self._concept_summary(path)
                    for path in self.children.get(relative, [])
                ],
            }
        else:
            lineage_ids = {
                "requirement-is-derived-from-requirement",
                "requirement-supersedes-requirement",
            }
            data = {
                "requirement": self._requirement_view(relative),
                "lineage": [
                    self._edge_view(edge)
                    for edge in self.edges
                    if edge.relationship_id in lineage_ids
                    and (edge.subject == relative or edge.object == relative)
                ],
                "note": "Lineage does not imply equivalence, satisfaction, or evidence transfer.",
            }
        return self.envelope("show", {"view": selected_view, "result": data})

    def search(self, query: str) -> dict[str, object]:
        self.require_conforming("search")
        terms = [term for term in re.split(r"\s+", query.casefold().strip()) if term]
        if not terms:
            raise InspectionFailure("empty-search", "Search terms must not be empty.")
        results: list[tuple[int, PurePosixPath]] = []
        for relative, concept in self.concepts.items():
            title = str(concept.metadata.get("title", "")).casefold()
            description = str(concept.metadata.get("description", "")).casefold()
            concept_type = str(concept.metadata.get("type", "")).casefold()
            requirement_id = str(concept.metadata.get("requirement_id", "")).casefold()
            protocol_id = str(concept.metadata.get("protocol_id", "")).casefold()
            reference = _ref(relative).casefold()
            body = concept.body.casefold()
            haystack = " ".join(
                (
                    title,
                    description,
                    concept_type,
                    requirement_id,
                    protocol_id,
                    reference,
                    body,
                )
            )
            if not all(term in haystack for term in terms):
                continue
            score = 0
            phrase = query.casefold().strip()
            if requirement_id == phrase:
                score += 100
            if protocol_id == phrase:
                score += 100
            if title == phrase:
                score += 80
            for term in terms:
                score += 12 if term in title else 0
                score += 6 if term in description else 0
                score += 3 if term in concept_type or term in reference else 0
                score += 1 if term in body else 0
            results.append((score, relative))
        results.sort(key=lambda item: (-item[0], item[1].as_posix()))
        bounded = results[:MAX_SEARCH_RESULTS]
        return self.envelope(
            "search",
            {
                "query": query,
                "total": len(results),
                "truncated": len(results) > len(bounded),
                "results": [
                    {"score": score, **self._concept_summary(relative)}
                    for score, relative in bounded
                ],
            },
        )

    def _requirement_view(self, relative: PurePosixPath) -> dict[str, object]:
        concept = self.concepts[relative]
        sections = _section_map(concept.body)
        return {
            **self._concept_summary(relative),
            "expression": sections.get("Requirement", ""),
            "rationale": sections.get("Rationale", ""),
            "lifecycle_record": sections.get("Lifecycle"),
            "sources": _json_value(concept.metadata.get("requirement_sources", [])),
            "derived_from": _json_value(concept.metadata.get("derived_from", [])),
            "supersedes": _json_value(concept.metadata.get("supersedes", [])),
            "source": {
                "path": f"gen-stack/{relative.as_posix()}",
                "digest": _digest(concept.path.read_bytes()),
            },
        }

    def _descendants(self, roots: Iterable[PurePosixPath]) -> set[PurePosixPath]:
        seen: set[PurePosixPath] = set()
        queue = deque(sorted(set(roots)))
        while queue:
            current = queue.popleft()
            if current in seen:
                continue
            seen.add(current)
            queue.extend(self.children.get(current, []))
        return seen

    def _ancestors(self, relative: PurePosixPath) -> list[PurePosixPath]:
        ancestors: list[PurePosixPath] = []
        current = relative
        while current in self.parents:
            current = self.parents[current]
            ancestors.append(current)
        ancestors.reverse()
        return ancestors

    def _hierarchy_node(self, relative: PurePosixPath) -> dict[str, object]:
        return {
            **self._concept_summary(relative),
            "direct_requirements": [
                str(self.concepts[path].metadata.get("requirement_id"))
                for path in self.requirements_by_subject.get(relative, [])
            ],
            "children": [
                self._hierarchy_node(child)
                for child in self.children.get(relative, [])
            ],
        }

    def _cross_view_closure(
        self, initial: set[PurePosixPath]
    ) -> set[PurePosixPath]:
        included = set(initial)
        changed = True
        while changed:
            changed = False
            expanded = self._descendants(included)
            if not expanded.issubset(included):
                included.update(expanded)
                changed = True
            for edge in self.edges:
                if edge.relationship_id not in CROSS_VIEW_RELATIONSHIPS:
                    continue
                if not isinstance(edge.subject, PurePosixPath) or not isinstance(
                    edge.object, PurePosixPath
                ):
                    continue
                if edge.subject in included or edge.object in included:
                    before = len(included)
                    included.update((edge.subject, edge.object))
                    changed = changed or len(included) != before
        return included

    def _governance_view(self, relative: PurePosixPath) -> dict[str, object] | None:
        concept = self.concepts.get(relative)
        if concept is None:
            return None
        return {
            **self._concept_summary(relative),
            "sections": _section_map(concept.body),
            "body": concept.body.strip(),
            "source": {
                "path": f"gen-stack/{relative.as_posix()}",
                "digest": _digest(concept.path.read_bytes()),
            },
        }

    def _evaluation_scope(
        self,
        value: str | None,
        *,
        operation: str,
        eligible_types: set[str] | frozenset[str],
    ) -> tuple[
        PurePosixPath | None,
        set[PurePosixPath],
        set[PurePosixPath],
        list[PurePosixPath],
    ]:
        primary = self.resolve(value) if value is not None else None
        if (
            primary is not None
            and self.concepts[primary].metadata.get("type") not in eligible_types
        ):
            raise InspectionFailure(
                "ineligible-evaluation-subject",
                f"{_ref(primary)} is not an eligible Architecture subject for {operation}.",
            )
        if primary is None:
            included = {
                relative
                for relative, concept in self.concepts.items()
                if concept.metadata.get("type") in eligible_types
            }
            return primary, set(included), included, []
        primary_scope = self._descendants({primary})
        return (
            primary,
            primary_scope,
            self._cross_view_closure(set(primary_scope)),
            self._ancestors(primary),
        )

    def _matching_protocols(
        self, role: str, target: str
    ) -> dict[str, list[dict[str, object]]]:
        matches: dict[str, list[dict[str, object]]] = {
            "active": [],
            "retired": [],
        }
        for relative, concept in sorted(self.concepts.items()):
            if (
                concept.metadata.get("type") != EVALUATION_PROTOCOL_TYPE
                or concept.metadata.get("evaluation_role") != role
            ):
                continue
            target_field = {
                "requirement-satisfaction": "requirements",
                "architecture-realization": "architecture_authorities",
                "implementation-conformance": "implementation_units",
            }[role]
            if target not in concept.metadata.get(target_field, []):
                continue
            lifecycle = str(concept.metadata.get("protocol_lifecycle"))
            if lifecycle in matches:
                matches[lifecycle].append(self._concept_summary(relative))
        return matches

    def _scope_relation(
        self,
        relative: PurePosixPath,
        *,
        primary: PurePosixPath | None,
        primary_scope: set[PurePosixPath],
    ) -> str:
        if primary is None:
            return "complete-corpus"
        if relative == primary:
            return "primary"
        if relative in primary_scope:
            return "descendant"
        return "cross-view"

    def evaluation_candidates(self, value: str | None = None) -> dict[str, object]:
        """Project policy-neutral Evaluation role-and-target candidates."""

        self.require_conforming("evaluation-candidates")
        primary, primary_scope, included, ancestors = self._evaluation_scope(
            value,
            operation="evaluation-candidates",
            eligible_types=ARCHITECTURE_REALIZATION_TYPES,
        )
        candidate_subjects = {
            relative
            for relative in included
            if self.concepts[relative].metadata.get("type")
            in ARCHITECTURE_REALIZATION_TYPES
        }

        candidates: list[dict[str, object]] = []
        excluded: list[dict[str, object]] = []
        requirement_paths = sorted(
            {
                requirement
                for subject in candidate_subjects
                for requirement in self.requirements_by_subject.get(subject, [])
            },
            key=lambda path: str(self.concepts[path].metadata.get("requirement_id")),
        )
        for relative in requirement_paths:
            concept = self.concepts[relative]
            requirement_id = str(concept.metadata.get("requirement_id"))
            subject = self.resolve(str(concept.metadata.get("subject")))
            scope_relation = self._scope_relation(
                subject,
                primary=primary,
                primary_scope=primary_scope,
            )
            if concept.metadata.get("requirement_lifecycle") == "retired":
                excluded.append(
                    {
                        "role": "requirement-satisfaction",
                        "target": self._concept_summary(relative),
                        "reason": "retired-requirement",
                        "scope_relation": scope_relation,
                    }
                )
                continue
            candidates.append(
                {
                    "role": "requirement-satisfaction",
                    "protocol_target": requirement_id,
                    "target": self._concept_summary(relative),
                    "subject": self._concept_summary(subject),
                    "basis": "active-direct-requirement",
                    "scope_relation": scope_relation,
                    "matching_protocols": self._matching_protocols(
                        "requirement-satisfaction", requirement_id
                    ),
                }
            )

        for relative in sorted(candidate_subjects):
            target = _ref(relative)
            candidates.append(
                {
                    "role": "architecture-realization",
                    "protocol_target": target,
                    "target": self._concept_summary(relative),
                    "subject": None,
                    "basis": "eligible-architecture-authority",
                    "scope_relation": self._scope_relation(
                        relative,
                        primary=primary,
                        primary_scope=primary_scope,
                    ),
                    "matching_protocols": self._matching_protocols(
                        "architecture-realization", target
                    ),
                }
            )

        if primary is None:
            implementation_targets = sorted(
                {
                    str(target)
                    for concept in self.concepts.values()
                    if concept.metadata.get("type") == EVALUATION_PROTOCOL_TYPE
                    and concept.metadata.get("evaluation_role")
                    == "implementation-conformance"
                    and concept.metadata.get("protocol_lifecycle") == "active"
                    for target in concept.metadata.get("implementation_units", [])
                }
            )
            for target in implementation_targets:
                candidates.append(
                    {
                        "role": "implementation-conformance",
                        "protocol_target": target,
                        "target": {
                            "ref": target,
                            "type": "Implementation Unit",
                        },
                        "subject": None,
                        "basis": "active-protocol-declared-implementation-unit",
                        "scope_relation": "complete-corpus",
                        "matching_protocols": self._matching_protocols(
                            "implementation-conformance", target
                        ),
                    }
                )

        projected_views: set[PurePosixPath] = set()
        for relative, concept in sorted(self.concepts.items()):
            if concept.metadata.get("type") != "C4 View":
                continue
            projected = {
                edge.object
                for edge in self.edges
                if edge.relationship_id == "c4-view-projects-element"
                and edge.subject == relative
                and isinstance(edge.object, PurePosixPath)
            }
            if primary is None or projected.intersection(included):
                projected_views.add(relative)
        for relative in sorted(projected_views):
            excluded.append(
                {
                    "role": "architecture-realization",
                    "target": self._concept_summary(relative),
                    "reason": "c4-view-is-projection",
                    "scope_relation": "context",
                }
            )

        role_order = {
            "requirement-satisfaction": 0,
            "architecture-realization": 1,
            "implementation-conformance": 2,
        }
        candidates.sort(
            key=lambda item: (
                role_order[str(item["role"])],
                str(item["protocol_target"]),
            )
        )
        excluded.sort(
            key=lambda item: (
                role_order[str(item["role"])],
                str(item["target"].get("ref", "")),
            )
        )
        data = {
            "scope": {
                "primary": self._concept_summary(primary) if primary else None,
                "mode": "scoped" if primary else "complete-corpus",
            },
            "candidates": candidates,
            "excluded": excluded,
            "ancestor_context": [
                self._concept_summary(relative) for relative in ancestors
            ],
            "interpretation": {
                "candidate_meaning": "eligible role-and-target pair for consideration",
                "selection_claim": "not-assessed",
                "coverage_claim": "not-assessed",
                "protocol_adequacy_claim": "not-assessed",
                "requirement_association": "direct-only",
                "requirement_inheritance": "not-inferred",
                "implementation_discovery": "active-protocol-targets-only",
            },
        }
        return self.envelope(
            "evaluation-candidates",
            data,
            unknowns=[
                {
                    "claim": "candidate-selection",
                    "reason": "An adopting policy or assurance authority determines which candidates are in scope for required coverage.",
                },
                {
                    "claim": "evaluation-coverage",
                    "reason": "Matching Protocols are projected, but applicability and required coverage depend on a separately supplied scope or policy.",
                },
                {
                    "claim": "protocol-adequacy",
                    "reason": "Protocol presence does not establish that its claim, assessment, or judgment adequately evaluates the target.",
                },
                {
                    "claim": "executable-realization",
                    "reason": "Suites, executable Cases, bindings, and discovery remain repository-native.",
                },
                {
                    "claim": "implementation-candidate-completeness",
                    "reason": "Corpus inspection exposes only Implementation Units already targeted by active Protocols and cannot discover uncovered Units.",
                },
                {
                    "claim": "evidence-and-outcome",
                    "reason": "Candidate projection does not inspect Executions, evidence state, Results, or outcomes.",
                },
            ],
        )

    def evaluation_context(self, value: str | None = None) -> dict[str, object]:
        self.require_conforming("evaluation-context")
        primary, primary_scope, included, ancestors = self._evaluation_scope(
            value,
            operation="evaluation-context",
            eligible_types=REQUIREMENT_SUBJECT_TYPES,
        )

        hierarchy_types = {"Surface", *C4_ELEMENTS}

        surface_starts = sorted(
            relative
            for relative in included
            if self.concepts[relative].metadata.get("type") == "Surface"
            and (primary is not None or relative not in self.parents)
            and (
                primary is None
                or self.parents.get(relative) not in included
                or relative == primary
            )
        )
        c4_starts = sorted(
            relative
            for relative in included
            if self.concepts[relative].metadata.get("type") in C4_ELEMENTS
            and (primary is not None or relative not in self.parents)
            and (
                primary is None
                or self.parents.get(relative) not in included
                or relative == primary
            )
        )

        relevant_subjects = {
            relative
            for relative in included | set(ancestors)
            if self.concepts[relative].metadata.get("type") in REQUIREMENT_SUBJECT_TYPES
        }
        requirement_paths = sorted(
            {
                requirement
                for subject in relevant_subjects
                for requirement in self.requirements_by_subject.get(subject, [])
            },
            key=lambda path: str(self.concepts[path].metadata.get("requirement_id")),
        )
        requirements = {
            str(self.concepts[path].metadata.get("requirement_id")): self._requirement_view(path)
            for path in requirement_paths
        }
        mappings = [
            self._edge_view(edge)
            for edge in self.edges
            if edge.relationship_id in CROSS_VIEW_RELATIONSHIPS
            and isinstance(edge.subject, PurePosixPath)
            and isinstance(edge.object, PurePosixPath)
            and (primary is None or (edge.subject in included and edge.object in included))
        ]

        projected_views = []
        for relative, concept in sorted(self.concepts.items()):
            if concept.metadata.get("type") != "C4 View":
                continue
            projected = [
                _ref(edge.object)
                for edge in self.edges
                if edge.relationship_id == "c4-view-projects-element"
                and edge.subject == relative
                and isinstance(edge.object, PurePosixPath)
                and (primary is None or edge.object in included)
            ]
            if projected:
                projected_views.append(
                    {
                        **self._concept_summary(relative),
                        "evaluation_subject": False,
                        "projects": projected,
                    }
                )

        related = sorted(
            included - primary_scope,
            key=lambda path: path.as_posix(),
        )
        data = {
            "scope": {
                "primary": self._concept_summary(primary) if primary else None,
                "mode": "scoped" if primary else "complete-corpus",
            },
            "surfaces": [self._hierarchy_node(path) for path in surface_starts],
            "structure": [self._hierarchy_node(path) for path in c4_starts],
            "ancestor_context": [
                {
                    **self._concept_summary(path),
                    "direct_requirements": [
                        str(self.concepts[requirement].metadata.get("requirement_id"))
                        for requirement in self.requirements_by_subject.get(path, [])
                    ],
                }
                for path in ancestors
            ],
            "related_subjects": [
                self._concept_summary(path)
                for path in related
                if self.concepts[path].metadata.get("type") in hierarchy_types
                or self.concepts[path].metadata.get("type") in ARCHITECTURE_VIEWS
            ],
            "requirements": requirements,
            "cross_view_mappings": mappings,
            "c4_views": projected_views,
            "governance": {
                "evaluation_protocols": [
                    self._governance_view(relative)
                    for relative, concept in sorted(self.concepts.items())
                    if concept.metadata.get("type") == EVALUATION_PROTOCOL_TYPE
                ],
                "system_assurance": self._governance_view(
                    PurePosixPath("assurance.md")
                ),
            },
            "interpretation": {
                "requirement_association": "direct-only",
                "requirement_inheritance": "not-inferred",
                "suite_layout": "repository-native; not prescribed by this projection",
                "c4_views_are_evaluation_subjects": False,
                "coverage_claim": "not-assessed",
            },
        }
        return self.envelope(
            "evaluation-context",
            data,
            unknowns=[
                {
                    "claim": "implementation-realization",
                    "reason": "Implementation mappings are outside this corpus-only projection.",
                },
                {
                    "claim": "evaluation-coverage",
                    "reason": "Protocol presence is projected, but coverage scope, evidence state, and outcomes require a separate assessment.",
                },
            ],
        )

    def snapshot(self) -> dict[str, object]:
        self.require_conforming("snapshot")
        return self.envelope(
            "snapshot",
            {
                "concepts": [
                    self._concept_view(relative, include_body=True)
                    for relative in sorted(self.concepts)
                ],
                "relationships": [self._edge_view(edge) for edge in self.edges],
            },
        )

    def _adjacency(
        self,
    ) -> dict[PurePosixPath, list[tuple[PurePosixPath, Edge, str]]]:
        adjacency: dict[PurePosixPath, list[tuple[PurePosixPath, Edge, str]]] = defaultdict(list)
        for edge in self.edges:
            if not isinstance(edge.subject, PurePosixPath) or not isinstance(
                edge.object, PurePosixPath
            ):
                continue
            adjacency[edge.subject].append((edge.object, edge, "forward"))
            adjacency[edge.object].append((edge.subject, edge, "inverse"))
        for paths in adjacency.values():
            paths.sort(key=lambda item: (item[0].as_posix(), _edge_sort_key(item[1])))
        return adjacency

    def _shortest_path(
        self, start: PurePosixPath, finish: PurePosixPath
    ) -> list[dict[str, object]] | None:
        if start == finish:
            return []
        adjacency = self._adjacency()
        queue = deque([start])
        previous: dict[
            PurePosixPath, tuple[PurePosixPath, Edge, str] | None
        ] = {start: None}
        while queue and len(previous) <= MAX_GRAPH_RESULTS:
            current = queue.popleft()
            for neighbor, edge, direction in adjacency.get(current, []):
                if neighbor in previous:
                    continue
                previous[neighbor] = (current, edge, direction)
                if neighbor == finish:
                    queue.clear()
                    break
                queue.append(neighbor)
        if finish not in previous:
            return None
        hops: list[dict[str, object]] = []
        current = finish
        while current != start:
            record = previous[current]
            assert record is not None
            prior, edge, direction = record
            hops.append(
                {
                    "from": _ref(prior),
                    "to": _ref(current),
                    "traversal": direction,
                    "edge": self._edge_view(edge),
                }
            )
            current = prior
        hops.reverse()
        return hops

    def path(self, start_value: str, finish_value: str) -> dict[str, object]:
        start = self.resolve(start_value)
        finish = self.resolve(finish_value)
        hops = self._shortest_path(start, finish)
        if hops is None:
            raise InspectionFailure(
                "path-not-found",
                f"No controlled relationship path connects {_ref(start)} and {_ref(finish)}.",
            )
        return self.envelope(
            "path",
            {
                "from": self._concept_summary(start),
                "to": self._concept_summary(finish),
                "hops": hops,
            },
        )

    def why(self, value: str) -> dict[str, object]:
        self.require_conforming("why")
        if value in self.edge_by_ref:
            edge = self.edge_by_ref[value]
            source, derivation, field = self._assertion_source(edge)
            data: object = {
                "kind": "relationship",
                "relationship": self._edge_view(edge),
                "explanation": {
                    "assertion_source": source,
                    "derivation": derivation,
                    "field_or_rule": field,
                },
            }
        else:
            relative = self.resolve(value)
            concept = self.concepts[relative]
            data = {
                "kind": "concept",
                "concept": self._concept_summary(relative),
                "identity": {
                    "kind": (
                        "stable-requirement-id"
                        if concept.metadata.get("type") == "Requirement"
                        else "stable-protocol-id"
                        if concept.metadata.get("type") == EVALUATION_PROTOCOL_TYPE
                        else "okf-path-derived"
                    ),
                    "reference": (
                        concept.metadata.get("requirement_id")
                        if concept.metadata.get("type") == "Requirement"
                        else concept.metadata.get("protocol_id")
                        if concept.metadata.get("type") == EVALUATION_PROTOCOL_TYPE
                        else _ref(relative)
                    ),
                    "canonical_path": f"gen-stack/{relative.as_posix()}",
                },
                "relationships": self._relations_for(relative),
                "hierarchy_parent": (
                    self._concept_summary(self.parents[relative])
                    if relative in self.parents
                    else None
                ),
            }
        return self.envelope("why", data)

    def affected_concepts(self, value: str) -> dict[str, object]:
        start = self.resolve(value)
        adjacency = self._adjacency()
        queue = deque([start])
        distance = {start: 0}
        while queue and len(distance) <= MAX_GRAPH_RESULTS:
            current = queue.popleft()
            for neighbor, _, _ in adjacency.get(current, []):
                if neighbor in distance:
                    continue
                distance[neighbor] = distance[current] + 1
                queue.append(neighbor)
        affected = []
        for relative in sorted(
            (path for path in distance if path != start),
            key=lambda path: (distance[path], path.as_posix()),
        ):
            affected.append(
                {
                    **self._concept_summary(relative),
                    "distance": distance[relative],
                    "path": self._shortest_path(start, relative),
                }
            )
        return self.envelope(
            "affected-concepts",
            {
                "source": self._concept_summary(start),
                "affected": affected,
                "truncated": len(distance) > MAX_GRAPH_RESULTS,
                "interpretation": "Controlled-relationship reachability only; this is not implementation, evaluation, delivery, or operational impact.",
            },
        )


def _validate_snapshot_payload(
    payload: object, label: str
) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise InspectionFailure("snapshot-contract", f"Snapshot {label} must contain a JSON object.")
    if payload.get("schema_version") not in COMPATIBLE_SNAPSHOT_VERSIONS or payload.get("operation") != "snapshot":
        raise InspectionFailure(
            "snapshot-contract",
            f"Snapshot {label} must be a compatible v1alpha2 or v1alpha3 snapshot envelope.",
        )
    data = payload.get("data")
    if not isinstance(data, dict) or not isinstance(data.get("concepts"), list) or not isinstance(data.get("relationships"), list):
        raise InspectionFailure("snapshot-contract", f"Snapshot {label} has invalid snapshot data.")
    return payload


def load_snapshot(path: Path) -> dict[str, object]:
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise InspectionFailure("snapshot-read", f"Unable to read snapshot {path}: {exc}") from exc
    if size > MAX_OUTPUT_BYTES:
        raise InspectionFailure(
            "inspection-resource-limit",
            f"Snapshot {path} exceeds the inspection limit of {MAX_OUTPUT_BYTES} bytes.",
        )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise InspectionFailure("snapshot-read", f"Unable to read snapshot {path}: {exc}") from exc
    return _validate_snapshot_payload(payload, str(path))


def diff_snapshots(before: dict[str, object], after: dict[str, object]) -> dict[str, object]:
    before_data = before["data"]
    after_data = after["data"]
    assert isinstance(before_data, dict) and isinstance(after_data, dict)

    def indexed(items: object, key: str) -> dict[str, dict[str, object]]:
        assert isinstance(items, list)
        result: dict[str, dict[str, object]] = {}
        for item in items:
            if isinstance(item, dict) and isinstance(item.get(key), str):
                result[str(item[key])] = item
        return result

    old_concepts = indexed(before_data["concepts"], "ref")
    new_concepts = indexed(after_data["concepts"], "ref")
    old_edges = indexed(before_data["relationships"], "ref")
    new_edges = indexed(after_data["relationships"], "ref")

    changed = []
    for reference in sorted(old_concepts.keys() & new_concepts.keys()):
        if _canonical_json(old_concepts[reference]) == _canonical_json(new_concepts[reference]):
            continue
        fields = sorted(
            key
            for key in old_concepts[reference].keys() | new_concepts[reference].keys()
            if _canonical_json(old_concepts[reference].get(key))
            != _canonical_json(new_concepts[reference].get(key))
        )
        changed.append({"ref": reference, "changed_fields": fields})

    return {
        "before": before.get("snapshot"),
        "after": after.get("snapshot"),
        "concepts": {
            "added": sorted(new_concepts.keys() - old_concepts.keys()),
            "removed": sorted(old_concepts.keys() - new_concepts.keys()),
            "changed": changed,
        },
        "relationships": {
            "added": [new_edges[key] for key in sorted(new_edges.keys() - old_edges.keys())],
            "removed": [old_edges[key] for key in sorted(old_edges.keys() - new_edges.keys())],
        },
    }


def diff_envelope(
    before: dict[str, object], after: dict[str, object]
) -> dict[str, object]:
    """Build a deterministic comparison envelope without inspecting another repository."""

    before = _validate_snapshot_payload(before, "before")
    after = _validate_snapshot_payload(after, "after")

    payload: dict[str, object] = {
        "schema_version": SCHEMA_VERSION,
        "producer": {
            "name": PRODUCER_NAME,
            "version": PRODUCER_VERSION,
            "digest": _producer_digest(),
        },
        "snapshot": after.get("snapshot"),
        "input": {"kind": "snapshot-files"},
        "discovery": after.get("discovery"),
        "operation": "diff",
        "data": diff_snapshots(before, after),
        "diagnostics": [],
        "unknowns": [
            {
                "claim": "implementation-or-evaluation-impact",
                "reason": "Snapshot comparison covers only profile-governed corpus concepts and relationships.",
            }
        ],
    }
    encoded = _canonical_json(payload)
    if len(encoded) > MAX_OUTPUT_BYTES:
        raise InspectionFailure(
            "inspection-output-limit",
            f"The projected output exceeds the inspection limit of {MAX_OUTPUT_BYTES} bytes.",
        )
    payload["output_digest"] = _digest(encoded)
    return payload


def standalone_failure_envelope(
    operation: str,
    failure: InspectionFailure,
    *,
    input_identity: dict[str, object] | None = None,
) -> dict[str, object]:
    """Represent a failure for an operation that does not inspect a live corpus."""

    payload: dict[str, object] = {
        "schema_version": SCHEMA_VERSION,
        "producer": {
            "name": PRODUCER_NAME,
            "version": PRODUCER_VERSION,
            "digest": _producer_digest(),
        },
        "snapshot": {
            "profile": {"identity": PROFILE_ID, "version": PROFILE_VERSION},
            "snapshot_id": None,
            "corpus_digest": None,
        },
        "input": input_identity or {"kind": "snapshot-files"},
        "discovery": {
            "state": "invalid",
            "okf_result": "unknown",
            "structural_result": "fail",
            "semantic_result": "unknown",
        },
        "operation": operation,
        "data": None,
        "diagnostics": [
            {
                "rule": failure.code,
                "severity": "error",
                "path": ".",
                "location": None,
                "message": failure.message,
                "blocking": True,
                "recovery": None,
            }
        ],
        "unknowns": [
            {
                "claim": (
                    "mechanical-check" if operation == "check" else "snapshot-comparison"
                ),
                "reason": (
                    "The selected input or environment could not establish a valid mechanical check."
                    if operation == "check"
                    else "The supplied snapshot inputs could not establish a valid comparison."
                ),
            }
        ],
    }
    payload["output_digest"] = _digest(_canonical_json(payload))
    return payload
