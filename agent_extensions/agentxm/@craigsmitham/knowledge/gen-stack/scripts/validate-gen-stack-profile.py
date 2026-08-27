#!/usr/bin/env python3
"""Validate the Gen Stack corpus at ``<repository-root>/gen-stack``."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import deque
from pathlib import Path, PurePosixPath

try:
    import yaml
except ImportError:  # pragma: no cover - environment failure path
    print("PyYAML is required to run this validator.", file=sys.stderr)
    raise SystemExit(2)

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from gen_stack_profile.corpus import LINK_RE, local_markdown_targets, parse_frontmatter  # noqa: E402
from gen_stack_profile.location import inspect_repository  # noqa: E402
from gen_stack_profile.profile import (  # noqa: E402
    ARCHITECTURE_REALIZATION_TYPES,
    COMMON_FIELDS,
    EVALUATION_PROTOCOL_DIRECTORIES,
    EVALUATION_PROTOCOL_LIFECYCLES,
    EVALUATION_PROTOCOL_ROLES,
    EVALUATION_PROTOCOL_SECTIONS,
    EVALUATION_PROTOCOL_TYPE,
    GOVERNED_TYPES,
    PLURAL_CATCH_ALLS,
    PROFILE_ID,
    PROFILE_VERSION,
    PROHIBITED_PROFILE_LIKE_TYPES,
    QUALITY_CHARACTERISTICS,
    REQUIRED_ROOT_CONCEPTS,
    REQUIREMENT_SUBJECT_TYPES,
    REQUIREMENT_LIFECYCLES,
    REQUIREMENT_TYPES,
    VALID_STATUSES,
)
from gen_stack_profile.relationships import analyze_relationships  # noqa: E402


def path_matches(concept_type: str, relative: PurePosixPath) -> bool:
    parts = relative.parts
    required_path = next(
        (path for path, expected_type in REQUIRED_ROOT_CONCEPTS.items() if expected_type == concept_type),
        None,
    )
    if required_path is not None:
        return relative == PurePosixPath(required_path)
    if concept_type == EVALUATION_PROTOCOL_TYPE:
        return (
            len(parts) == 4
            and parts[:2] == ("evaluations", "protocols")
            and parts[2] in set(EVALUATION_PROTOCOL_DIRECTORIES.values())
        )
    if concept_type == "Architecture Decision Record":
        return len(parts) == 3 and parts[:2] == ("architecture", "decisions")
    if concept_type == "Requirement":
        return "requirements" in parts
    exact_collections = {
        "Offering": ("intent", "offerings"),
        "Audience": ("intent", "audiences"),
        "Need": ("intent", "needs"),
        "Job to Be Done": ("intent", "jobs"),
        "Value Proposition": ("intent", "value-propositions"),
        "Use Case": ("intent", "use-cases"),
        "Capability": ("architecture", "capabilities"),
        "Feature": ("architecture", "features"),
        "Bounded Context": ("architecture", "domains", "contexts"),
        "Context Map": ("architecture", "domains", "context-maps"),
        "C4 Software System": ("architecture", "structure", "systems"),
    }
    if concept_type in exact_collections:
        prefix = exact_collections[concept_type]
        return len(parts) == len(prefix) + 1 and parts[:-1] == prefix
    if concept_type == "Surface":
        return len(parts) >= 3 and parts[:2] == ("architecture", "surfaces") and "requirements" not in parts
    if concept_type == "Subdomain":
        return len(parts) == 4 and parts[:3] in {
            ("intent", "domains", "core"),
            ("intent", "domains", "supporting"),
            ("intent", "domains", "generic"),
        }
    if concept_type == "C4 Container":
        return len(parts) == 4 and parts[:3] == ("architecture", "structure", "containers")
    if concept_type == "C4 Component":
        return (
            len(parts) == 6
            and parts[:3] == ("architecture", "structure", "containers")
            and parts[4] == "components"
        )
    if concept_type == "C4 View":
        if len(parts) == 4 and parts[:3] == ("architecture", "structure", "views"):
            return parts[3] in {"system-landscape.md", "system-context.md", "containers.md"}
        return (
            len(parts) == 5
            and parts[:3] == ("architecture", "structure", "views")
            and parts[3] in {"components", "dynamics", "deployments", "code"}
        )
    return True


def validate(repository_root: Path) -> dict[str, object]:
    location = inspect_repository(repository_root)
    if location.diagnostics:
        errors = [
            {
                "rule": item.rule,
                "path": _repository_relative(item.path, location.repository_root),
                "message": item.message,
            }
            for item in location.diagnostics
        ]
        return result(
            location.repository_root,
            location.corpus_root,
            errors,
            0,
            location.state,
        )
    return validate_corpus(location.repository_root, location.corpus_root)


def _repository_relative(path: Path, repository_root: Path) -> str:
    try:
        return path.relative_to(repository_root).as_posix()
    except ValueError:
        return str(path)


def validate_corpus(repository_root: Path, root: Path) -> dict[str, object]:
    errors: list[dict[str, str]] = []

    def error(rule: str, path: Path, message: str) -> None:
        errors.append(
            {
                "rule": rule,
                "path": _repository_relative(path, repository_root),
                "message": message,
            }
        )

    root = root.resolve()
    root_index = root / "index.md"

    for filename, concept_type in REQUIRED_ROOT_CONCEPTS.items():
        path = root / filename
        if not path.is_file():
            error(
                "required-root-concept",
                path,
                f"The Gen Stack corpus root must contain {filename} with type {concept_type}.",
            )
            continue
        try:
            meta, _ = parse_frontmatter(path)
        except (OSError, ValueError, yaml.YAMLError):
            continue
        if meta.get("type") != concept_type:
            error("required-root-type", path, f"{filename} must have the exact profile type {concept_type}.")

    evaluations_index = root / "evaluations" / "index.md"
    if not evaluations_index.is_file():
        error("evaluation-navigation", evaluations_index, "The corpus must contain evaluations/index.md.")
    legacy_approach = root / "evaluations" / "system-evaluation-approach.md"
    if legacy_approach.exists():
        error(
            "superseded-evaluation-approach",
            legacy_approach,
            "system-evaluation-approach.md is retired in profile 0.5.0; distribute durable claims to Evaluation Protocols and their owning authorities.",
        )
    protocols_root = root / "evaluations" / "protocols"
    if protocols_root.exists():
        role_directories = set(EVALUATION_PROTOCOL_DIRECTORIES.values())
        present_roles = sorted(path for path in protocols_root.iterdir() if path.is_dir())
        if not present_roles:
            error(
                "empty-evaluation-protocol-collection",
                protocols_root,
                "evaluations/protocols/ must be omitted until its first Evaluation Protocol is admitted.",
            )
        for role_directory in present_roles:
            if role_directory.name not in role_directories:
                error(
                    "evaluation-protocol-role-directory",
                    role_directory,
                    "Protocol role directory must be requirements, architecture, or implementation.",
                )
                continue
            named_files = sorted(
                path for path in role_directory.glob("*.md") if path.name != "index.md"
            )
            if not named_files:
                error(
                    "empty-evaluation-protocol-role",
                    role_directory,
                    "A Protocol role directory must be omitted until it contains a named Evaluation Protocol.",
                )

    for forbidden_collection in (
        "constraints",
        "quality",
        "implementation",
        "feedback",
        "signals",
        "observations",
        "value",
        "use-cases",
        "capabilities",
        "features",
        "surfaces",
        "domains",
        "structure",
    ):
        path = root / forbidden_collection
        if path.exists():
            error(
                "superseded-collection",
                path,
                f"{forbidden_collection}/ is not a canonical root collection in this profile.",
            )
    if (root / "constraints.md").exists():
        error("superseded-collection", root / "constraints.md", "constraints.md is superseded by Requirement concepts.")

    decisions = root / "architecture" / "decisions"
    if decisions.exists():
        named_files = sorted(path for path in decisions.glob("*.md") if path.name != "index.md")
        if not named_files:
            error(
                "empty-collection",
                decisions,
                "architecture/decisions/ must be omitted until its first Architecture Decision Record is admitted.",
            )
        for path in named_files:
            try:
                meta, _ = parse_frontmatter(path)
            except (OSError, ValueError, yaml.YAMLError):
                continue
            if meta.get("type") != "Architecture Decision Record":
                error(
                    "collection-type",
                    path,
                    "Every named concept directly under architecture/decisions/ must have type Architecture Decision Record.",
                )

    for requirement_root in root.rglob("requirements"):
        if not requirement_root.is_dir():
            continue
        if requirement_root.relative_to(root).parts[:2] == (
            "evaluations",
            "protocols",
        ):
            continue
        type_directories = sorted(path for path in requirement_root.iterdir() if path.is_dir())
        if not type_directories:
            error(
                "empty-requirement-collection",
                requirement_root,
                "requirements/ must be omitted until its first Requirement is admitted.",
            )
        for type_directory in type_directories:
            if type_directory.name not in REQUIREMENT_TYPES:
                error(
                    "requirement-type-directory",
                    type_directory,
                    "Requirement type directory must use one of the six profile requirement_type values.",
                )
                continue
            named_files = sorted(
                path for path in type_directory.glob("*.md") if path.name != "index.md"
            )
            if not named_files:
                error(
                    "empty-requirement-type",
                    type_directory,
                    "A Requirement type directory must be omitted until it contains a named Requirement.",
                )

    concept_files = sorted(
        path for path in root.rglob("*.md") if path.name not in {"index.md", "log.md"}
    )
    governed_count = 0
    concept_metadata: dict[PurePosixPath, dict[str, object]] = {}
    requirement_ids: dict[str, Path] = {}
    protocol_ids: dict[str, Path] = {}

    for path in concept_files:
        relative = PurePosixPath(path.relative_to(root).as_posix())
        try:
            meta, body = parse_frontmatter(path)
        except (OSError, ValueError, yaml.YAMLError) as exc:
            error("concept-frontmatter", path, str(exc))
            continue
        concept_type = meta.get("type")
        if not isinstance(concept_type, str) or not concept_type.strip():
            error("common-frontmatter", path, "type must be a non-empty string.")
            continue
        if concept_type in PROHIBITED_PROFILE_LIKE_TYPES:
            error(
                "profile-type-prohibited",
                path,
                f"{concept_type} is not a current profile concept type; use Requirement or the concept that owns the meaning.",
            )
        if concept_type in GOVERNED_TYPES:
            governed_count += 1
            concept_metadata[relative] = meta
            for field in COMMON_FIELDS[1:]:
                value = meta.get(field)
                if not isinstance(value, str) or not value.strip():
                    error("common-frontmatter", path, f"{field} must be a non-empty string.")
            if meta.get("status") not in VALID_STATUSES:
                error("common-frontmatter", path, "status must be draft, stable, or deprecated.")
            if not path_matches(concept_type, relative):
                error("canonical-path", path, f"{concept_type} is not at a profile-defined canonical path.")
            if path.name in PLURAL_CATCH_ALLS:
                error("stable-identity", path, "Plural catch-all concept files are prohibited.")
            if relative.as_posix() in REQUIRED_ROOT_CONCEPTS and not body.strip():
                error("required-root-body", path, "A required root concept must contain a substantive body.")
            if concept_type == "Subdomain":
                expected = relative.parts[2] if len(relative.parts) > 2 else None
                if meta.get("classification") != expected:
                    error(
                        "subdomain-classification",
                        path,
                        "Subdomain classification must match its canonical directory.",
                    )
            if concept_type == "Requirement":
                validate_requirement(path, relative, meta, body, requirement_ids, error)
            if concept_type == EVALUATION_PROTOCOL_TYPE:
                validate_evaluation_protocol(
                    path, relative, meta, body, protocol_ids, error
                )

        current = path.parent
        while current != root:
            index = current / "index.md"
            if not index.is_file():
                error("collection-index", index, "Every present concept collection requires index.md.")
            current = current.parent

    validate_requirement_relations(root, concept_files, concept_metadata, requirement_ids, error)
    validate_evaluation_protocol_targets(
        repository_root,
        root,
        concept_metadata,
        requirement_ids,
        error,
    )

    relationship_analysis = analyze_relationships(root)
    for diagnostic in relationship_analysis.diagnostics:
        error(
            diagnostic.rule,
            root / diagnostic.path.as_posix(),
            diagnostic.message,
        )

    markdown_files = {root_index.resolve(), *(path.resolve() for path in root.rglob("*.md"))}
    reachable: set[Path] = set()
    queue: deque[Path] = deque([root_index.resolve()])
    while queue:
        path = queue.popleft()
        if path in reachable:
            continue
        reachable.add(path)
        for target in local_markdown_targets(path, root):
            if target.resolve() in markdown_files:
                queue.append(target.resolve())
    if evaluations_index.is_file() and evaluations_index.resolve() not in reachable:
        error(
            "evaluation-navigation-reachability",
            evaluations_index,
            "evaluations/index.md must be reachable from the root index.",
        )
    for path in concept_files:
        if path.resolve() not in reachable:
            error("root-reachability", path, "Concept is not reachable from the root index.")

    return result(
        repository_root,
        root,
        errors,
        governed_count,
        "conforming" if not errors else "invalid",
    )


def validate_evaluation_protocol(
    path: Path,
    relative: PurePosixPath,
    meta: dict[str, object],
    body: str,
    protocol_ids: dict[str, Path],
    error: object,
) -> None:
    report = error
    protocol_id = meta.get("protocol_id")
    lifecycle = meta.get("protocol_lifecycle")
    role = meta.get("evaluation_role")

    if not isinstance(protocol_id, str) or not protocol_id.strip():
        report("evaluation-protocol-id", path, "Evaluation Protocol requires a non-empty protocol_id.")
    elif protocol_id in protocol_ids:
        report(
            "evaluation-protocol-id-unique",
            path,
            f"protocol_id duplicates {protocol_ids[protocol_id].name}.",
        )
    else:
        protocol_ids[protocol_id] = path

    if lifecycle not in EVALUATION_PROTOCOL_LIFECYCLES:
        report(
            "evaluation-protocol-lifecycle",
            path,
            "protocol_lifecycle must be active or retired.",
        )
    if role not in EVALUATION_PROTOCOL_ROLES:
        report(
            "evaluation-protocol-role",
            path,
            "evaluation_role must be requirement-satisfaction, architecture-realization, or implementation-conformance.",
        )
    elif len(relative.parts) >= 3:
        expected_directory = EVALUATION_PROTOCOL_DIRECTORIES[role]
        if relative.parts[2] != expected_directory:
            report(
                "evaluation-protocol-path-role",
                path,
                f"{role} Protocols must be under evaluations/protocols/{expected_directory}/.",
            )

    matching_field = EVALUATION_PROTOCOL_ROLES.get(role) if isinstance(role, str) else None
    target_fields = set(EVALUATION_PROTOCOL_ROLES.values())
    present = {field for field in target_fields if field in meta}
    if matching_field is None or present != {matching_field}:
        report(
            "evaluation-protocol-target-exclusivity",
            path,
            "Evaluation Protocol must contain exactly the target field selected by evaluation_role and omit the other role target fields.",
        )
    elif not _non_empty_unique_strings(meta.get(matching_field)):
        report(
            "evaluation-protocol-targets",
            path,
            f"{matching_field} must be a non-empty list of unique non-empty strings.",
        )

    for section in EVALUATION_PROTOCOL_SECTIONS:
        if not re.search(rf"^## {re.escape(section)}\s*$", body, flags=re.MULTILINE):
            report(
                "evaluation-protocol-section",
                path,
                f"Evaluation Protocol requires a ## {section} section.",
            )


def _non_empty_unique_strings(value: object) -> bool:
    return (
        isinstance(value, list)
        and bool(value)
        and all(isinstance(item, str) and item.strip() for item in value)
        and len(value) == len(set(value))
    )


def validate_evaluation_protocol_targets(
    repository_root: Path,
    root: Path,
    concept_metadata: dict[PurePosixPath, dict[str, object]],
    requirement_ids: dict[str, Path],
    error: object,
) -> None:
    report = error
    requirement_meta_by_id = {
        requirement_id: concept_metadata.get(
            PurePosixPath(path.relative_to(root).as_posix()), {}
        )
        for requirement_id, path in requirement_ids.items()
    }
    for relative, meta in concept_metadata.items():
        if meta.get("type") != EVALUATION_PROTOCOL_TYPE:
            continue
        path = root / relative.as_posix()
        role = meta.get("evaluation_role")
        lifecycle = meta.get("protocol_lifecycle")

        if role == "requirement-satisfaction" and _non_empty_unique_strings(
            targets := meta.get("requirements")
        ):
            for requirement_id in targets:
                requirement_meta = requirement_meta_by_id.get(requirement_id)
                if requirement_meta is None:
                    report(
                        "evaluation-protocol-requirement-resolves",
                        path,
                        f"requirements references unknown requirement_id {requirement_id}.",
                    )
                elif (
                    lifecycle == "active"
                    and requirement_meta.get("requirement_lifecycle") != "active"
                ):
                    report(
                        "evaluation-protocol-requirement-lifecycle",
                        path,
                        f"Active Protocol targets retired Requirement {requirement_id}; retire or retarget the Protocol.",
                    )

        if role == "architecture-realization" and _non_empty_unique_strings(
            targets := meta.get("architecture_authorities")
        ):
            for target in targets:
                if not target.startswith("/") or "?" in target or "#" in target:
                    report(
                        "evaluation-protocol-architecture-target",
                        path,
                        f"architecture_authorities target {target!r} must be a bundle-relative concept path.",
                    )
                    continue
                target_relative = PurePosixPath(target.lstrip("/"))
                if ".." in target_relative.parts:
                    report(
                        "evaluation-protocol-architecture-target",
                        path,
                        f"architecture_authorities target {target!r} escapes the corpus.",
                    )
                    continue
                target_meta = concept_metadata.get(target_relative)
                if target_meta is None:
                    report(
                        "evaluation-protocol-architecture-resolves",
                        path,
                        f"architecture_authorities target {target!r} must resolve to a maintained concept.",
                    )
                elif target_meta.get("type") not in ARCHITECTURE_REALIZATION_TYPES:
                    report(
                        "evaluation-protocol-architecture-type",
                        path,
                        f"architecture_authorities target {target!r} has ineligible type {target_meta.get('type')!r}; C4 Views are projections and are not eligible.",
                    )

        if role == "implementation-conformance" and _non_empty_unique_strings(
            targets := meta.get("implementation_units")
        ):
            for target in targets:
                target_relative = PurePosixPath(target)
                if (
                    target_relative.is_absolute()
                    or not target_relative.parts
                    or ".." in target_relative.parts
                    or target_relative.parts[0] == "gen-stack"
                ):
                    report(
                        "evaluation-protocol-implementation-target",
                        path,
                        f"implementation_units target {target!r} must be a repository-relative path outside gen-stack/.",
                    )
                    continue
                candidate = (repository_root / target_relative.as_posix()).resolve(
                    strict=False
                )
                try:
                    candidate.relative_to(repository_root)
                except ValueError:
                    report(
                        "evaluation-protocol-implementation-target",
                        path,
                        f"implementation_units target {target!r} escapes the repository.",
                    )
                    continue
                if not candidate.exists():
                    report(
                        "evaluation-protocol-implementation-resolves",
                        path,
                        f"implementation_units target {target!r} must resolve to a maintained file or directory.",
                    )


def validate_requirement(
    path: Path,
    relative: PurePosixPath,
    meta: dict[str, object],
    body: str,
    requirement_ids: dict[str, Path],
    error: object,
) -> None:
    report = error
    requirement_id = meta.get("requirement_id")
    requirement_type = meta.get("requirement_type")
    requirement_lifecycle = meta.get("requirement_lifecycle")
    subject = meta.get("subject")
    if not isinstance(requirement_id, str) or not requirement_id.strip():
        report("requirement-id", path, "Requirement requires a non-empty requirement_id.")
    elif requirement_id in requirement_ids:
        report("requirement-id-unique", path, f"requirement_id duplicates {requirement_ids[requirement_id].name}.")
    else:
        requirement_ids[requirement_id] = path
    if requirement_type not in REQUIREMENT_TYPES:
        report(
            "requirement-type",
            path,
            "requirement_type must be functional, quality, process, human-factors, usability, or constraint.",
        )
    if requirement_lifecycle not in REQUIREMENT_LIFECYCLES:
        report(
            "requirement-lifecycle",
            path,
            "requirement_lifecycle must be active or retired.",
        )
    if not isinstance(subject, str) or not subject.strip():
        report("requirement-subject", path, "Requirement requires one bundle-relative subject link.")
    elif isinstance(requirement_type, str):
        subject_path = PurePosixPath(subject.lstrip("/"))
        expected_parent = subject_path.with_suffix("").parts + ("requirements", requirement_type)
        if relative.parts[:-1] != expected_parent:
            report(
                "requirement-colocation",
                path,
                "Requirement path must be <subject-without-.md>/requirements/<requirement_type>/<requirement>.md.",
            )
    if not re.search(r"^## Requirement\s*$", body, flags=re.MULTILINE):
        report("requirement-body", path, "Requirement body requires a ## Requirement section.")
    if not re.search(r"^## Rationale\s*$", body, flags=re.MULTILINE):
        report("requirement-rationale", path, "Requirement body requires a ## Rationale section.")
    if requirement_lifecycle == "retired" and not re.search(
        r"^## Lifecycle\s*$", body, flags=re.MULTILINE
    ):
        report(
            "requirement-lifecycle-body",
            path,
            "A retired Requirement body requires a ## Lifecycle section with retirement decision Provenance.",
        )
    if requirement_type == "quality":
        for field in ("quality_model", "quality_characteristic", "quality_subcharacteristic"):
            value = meta.get(field)
            if not isinstance(value, str) or not value.strip():
                report("quality-requirement-metadata", path, f"Quality requirement requires {field}.")
        if (
            meta.get("quality_model") == "ISO/IEC 25010:2023"
            and meta.get("quality_characteristic") not in QUALITY_CHARACTERISTICS
        ):
            report(
                "quality-characteristic",
                path,
                "ISO/IEC 25010:2023 quality_characteristic is not recognized by this profile.",
            )
    for field in ("requirement_sources", "derived_from", "supersedes"):
        value = meta.get(field)
        if value is not None and (
            not isinstance(value, list)
            or any(not isinstance(item, str) or not item.strip() for item in value)
        ):
            report("requirement-relation", path, f"{field} must be a list of non-empty strings.")


def validate_requirement_relations(
    root: Path,
    concept_files: list[Path],
    concept_metadata: dict[PurePosixPath, dict[str, object]],
    requirement_ids: dict[str, Path],
    error: object,
) -> None:
    report = error
    parents_by_id: dict[str, list[str]] = {}
    supersedes_by_id: dict[str, list[str]] = {}
    metadata_by_id: dict[str, dict[str, object]] = {}
    for relative, meta in concept_metadata.items():
        if meta.get("type") != "Requirement":
            continue
        requirement_id = meta.get("requirement_id")
        if isinstance(requirement_id, str):
            metadata_by_id[requirement_id] = meta
    for path in concept_files:
        relative = PurePosixPath(path.relative_to(root).as_posix())
        meta = concept_metadata.get(relative)
        if meta is None or meta.get("type") != "Requirement":
            continue
        subject = meta.get("subject")
        if isinstance(subject, str):
            subject_meta = concept_metadata.get(PurePosixPath(subject.lstrip("/")))
            if subject_meta is None:
                report("requirement-subject-resolves", path, "subject must resolve to a maintained concept.")
            elif subject_meta.get("type") not in REQUIREMENT_SUBJECT_TYPES:
                report(
                    "requirement-subject-type",
                    path,
                    "subject must be a System, Capability, Feature, Surface, Bounded Context, or C4 element; Intent concepts such as Offering are not eligible.",
                )
        requirement_id = meta.get("requirement_id")
        parents = meta.get("derived_from", [])
        if isinstance(requirement_id, str) and isinstance(parents, list):
            typed_parents = [item for item in parents if isinstance(item, str)]
            parents_by_id[requirement_id] = typed_parents
            for parent in typed_parents:
                if parent == requirement_id:
                    report("requirement-derivation", path, "A requirement cannot derive from itself.")
                elif parent not in requirement_ids:
                    report("requirement-derivation", path, f"derived_from references unknown requirement_id {parent}.")

        predecessors = meta.get("supersedes", [])
        if isinstance(requirement_id, str) and isinstance(predecessors, list):
            typed_predecessors = [item for item in predecessors if isinstance(item, str)]
            supersedes_by_id[requirement_id] = typed_predecessors
            for predecessor in typed_predecessors:
                if predecessor == requirement_id:
                    report("requirement-supersession", path, "A Requirement cannot supersede itself.")
                elif predecessor not in requirement_ids:
                    report(
                        "requirement-supersession",
                        path,
                        f"supersedes references unknown requirement_id {predecessor}.",
                    )
                elif metadata_by_id.get(predecessor, {}).get("requirement_lifecycle") != "retired":
                    report(
                        "requirement-supersession-lifecycle",
                        path,
                        f"superseded Requirement {predecessor} must have requirement_lifecycle retired.",
                    )

    def has_cycle(
        node: str,
        edges: dict[str, list[str]],
        active: set[str],
        visited: set[str],
    ) -> bool:
        if node in active:
            return True
        if node in visited:
            return False
        active.add(node)
        for target in edges.get(node, []):
            if target in edges and has_cycle(target, edges, active, visited):
                return True
        active.remove(node)
        visited.add(node)
        return False

    visited: set[str] = set()
    for requirement_id in parents_by_id:
        if has_cycle(requirement_id, parents_by_id, set(), visited):
            report(
                "requirement-derivation-cycle",
                requirement_ids[requirement_id],
                "derived_from relationships must not contain a cycle.",
            )
            break

    visited = set()
    for requirement_id in supersedes_by_id:
        if has_cycle(requirement_id, supersedes_by_id, set(), visited):
            report(
                "requirement-supersession-cycle",
                requirement_ids[requirement_id],
                "supersedes relationships must not contain a cycle.",
            )
            break


def result(
    repository_root: Path,
    corpus_root: Path,
    errors: list[dict[str, str]],
    governed_count: int,
    state: str,
) -> dict[str, object]:
    return {
        "profile": {"identity": PROFILE_ID, "version": PROFILE_VERSION},
        "repository_root": str(repository_root),
        "corpus_root": str(corpus_root),
        "state": state,
        "structural_result": "pass" if not errors else "fail",
        "semantic_result": "unknown",
        "governed_concepts": governed_count,
        "errors": errors,
        "note": "A named manual semantic review is required for complete profile conformance.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "repository_root",
        nargs="?",
        type=Path,
        default=Path("."),
        help="Repository root; defaults to the current directory.",
    )
    parser.add_argument("--json", action="store_true", dest="json_output")
    args = parser.parse_args()
    report = validate(args.repository_root)
    if args.json_output:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(
            f"Structural profile result: {report['structural_result']} "
            f"({PROFILE_ID} {PROFILE_VERSION})"
        )
        for item in report["errors"]:
            print(f"ERROR {item['rule']} {item['path']}: {item['message']}")
        print(report["note"])
    return 0 if report["structural_result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
