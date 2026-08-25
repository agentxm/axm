#!/usr/bin/env python3
"""Validate mechanically decidable software-architecture-docs profile rules."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import deque
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

try:
    import yaml
except ImportError:  # pragma: no cover - environment failure path
    print("PyYAML is required to run this validator.", file=sys.stderr)
    raise SystemExit(2)


PROFILE_ID = "software-architecture-docs"
PROFILE_VERSION = "0.10.2"
COMMON_FIELDS = ("type", "title", "description", "status")
VALID_STATUSES = {"draft", "stable", "deprecated"}
REQUIRED_ROOT_CONCEPTS = {
    "system.md": "System",
    "lifecycle.md": "System Lifecycle",
    "ownership.md": "System Ownership",
    "decisions.md": "Architecture Decision Policy",
    "assurance.md": "System Assurance",
}
GOVERNED_TYPES = {
    *REQUIRED_ROOT_CONCEPTS.values(),
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
}
REQUIREMENT_TYPES = {
    "functional",
    "quality",
    "process",
    "human-factors",
    "usability",
    "constraint",
}
REQUIREMENT_SUBJECT_TYPES = {
    "System",
    "Offering",
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
LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")


def parse_frontmatter(path: Path) -> tuple[dict[str, object], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return {}, text
    marker = text.find("\n---\n", 4)
    if marker < 0:
        raise ValueError("frontmatter closing delimiter is missing")
    data = yaml.safe_load(text[4:marker]) or {}
    if not isinstance(data, dict):
        raise ValueError("frontmatter must be a mapping")
    return data, text[marker + 5 :]


def path_matches(concept_type: str, relative: PurePosixPath) -> bool:
    parts = relative.parts
    required_path = next(
        (path for path, expected_type in REQUIRED_ROOT_CONCEPTS.items() if expected_type == concept_type),
        None,
    )
    if required_path is not None:
        return relative == PurePosixPath(required_path)
    if concept_type == "Architecture Decision Record":
        return len(parts) == 2 and parts[0] == "decisions"
    if concept_type == "Requirement":
        return "requirements" in parts
    exact_collections = {
        "Offering": ("value", "offerings"),
        "Audience": ("value", "audiences"),
        "Need": ("value", "needs"),
        "Job to Be Done": ("value", "jobs"),
        "Value Proposition": ("value", "value-propositions"),
        "Use Case": ("use-cases",),
        "Capability": ("capabilities",),
        "Feature": ("features",),
        "Bounded Context": ("domains", "contexts"),
        "Context Map": ("domains", "context-maps"),
        "C4 Software System": ("structure", "systems"),
    }
    if concept_type in exact_collections:
        prefix = exact_collections[concept_type]
        return len(parts) == len(prefix) + 1 and parts[:-1] == prefix
    if concept_type == "Surface":
        return len(parts) >= 2 and parts[0] == "surfaces" and "requirements" not in parts
    if concept_type == "Subdomain":
        return len(parts) == 3 and parts[:2] in {
            ("domains", "core"),
            ("domains", "supporting"),
            ("domains", "generic"),
        }
    if concept_type == "C4 Container":
        return len(parts) == 3 and parts[:2] == ("structure", "containers")
    if concept_type == "C4 Component":
        return (
            len(parts) == 5
            and parts[0] == "structure"
            and parts[1] == "containers"
            and parts[3] == "components"
        )
    if concept_type == "C4 View":
        if len(parts) == 3 and parts[:2] == ("structure", "views"):
            return parts[2] in {"system-landscape.md", "system-context.md", "containers.md"}
        return (
            len(parts) == 4
            and parts[:2] == ("structure", "views")
            and parts[2] in {"components", "dynamics", "deployments", "code"}
        )
    return True


def local_markdown_targets(path: Path, root: Path) -> set[Path]:
    targets: set[Path] = set()
    text = path.read_text(encoding="utf-8")
    for raw in LINK_RE.findall(text):
        target = raw.strip().split()[0].strip("<>")
        if not target or target.startswith(("#", "http://", "https://", "mailto:")):
            continue
        target = unquote(target.split("#", 1)[0].split("?", 1)[0])
        candidate = root / target.lstrip("/") if target.startswith("/") else path.parent / target
        try:
            resolved = candidate.resolve(strict=False)
            resolved.relative_to(root)
        except (OSError, ValueError):
            continue
        if resolved.is_dir():
            resolved = resolved / "index.md"
        if resolved.suffix == "":
            resolved = resolved.with_suffix(".md")
        if resolved.is_file():
            targets.add(resolved)
    return targets


def validate(root: Path) -> dict[str, object]:
    errors: list[dict[str, str]] = []

    def error(rule: str, path: Path, message: str) -> None:
        try:
            shown = path.relative_to(root).as_posix()
        except ValueError:
            shown = str(path)
        errors.append({"rule": rule, "path": shown, "message": message})

    root = root.resolve()
    root_index = root / "index.md"
    if not root_index.is_file():
        error("root-index", root_index, "The architecture root must contain index.md.")
        return result(root, errors, 0)

    try:
        root_meta, root_body = parse_frontmatter(root_index)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        error("root-frontmatter", root_index, str(exc))
        return result(root, errors, 0)

    if root_meta.get("okf_version") != "0.2":
        error("okf-version", root_index, 'Root frontmatter must declare okf_version: "0.2".')
    normalized_body = re.sub(r"\s+", " ", root_body)
    adoption = re.search(
        rf"\badopts\b.*?{re.escape(PROFILE_ID)}.*?\b(?:version\s+)?{re.escape(PROFILE_VERSION)}\b",
        normalized_body,
        flags=re.IGNORECASE,
    )
    if adoption is None or not re.search(r"\[[^\]]+\]\([^)]+\)", adoption.group(0)):
        error(
            "profile-adoption",
            root_index,
            f"Root index must explicitly adopt and link {PROFILE_ID} version {PROFILE_VERSION}.",
        )

    for filename, concept_type in REQUIRED_ROOT_CONCEPTS.items():
        path = root / filename
        if not path.is_file():
            error(
                "required-root-concept",
                path,
                f"The architecture root must contain {filename} with type {concept_type}.",
            )
            continue
        try:
            meta, _ = parse_frontmatter(path)
        except (OSError, ValueError, yaml.YAMLError):
            continue
        if meta.get("type") != concept_type:
            error("required-root-type", path, f"{filename} must have the exact profile type {concept_type}.")

    for forbidden_collection in ("constraints", "quality"):
        path = root / forbidden_collection
        if path.exists():
            error(
                "superseded-collection",
                path,
                f"{forbidden_collection}/ is superseded; requirements must be colocated with their subject.",
            )
    if (root / "constraints.md").exists():
        error("superseded-collection", root / "constraints.md", "constraints.md is superseded by Requirement concepts.")

    decisions = root / "decisions"
    if decisions.exists():
        named_files = sorted(path for path in decisions.glob("*.md") if path.name != "index.md")
        if not named_files:
            error(
                "empty-collection",
                decisions,
                "decisions/ must be omitted until its first Architecture Decision Record is admitted.",
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
                    "Every named concept directly under decisions/ must have type Architecture Decision Record.",
                )

    for requirement_root in root.rglob("requirements"):
        if not requirement_root.is_dir():
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
                expected = relative.parts[1] if len(relative.parts) > 1 else None
                if meta.get("classification") != expected:
                    error(
                        "subdomain-classification",
                        path,
                        "Subdomain classification must match its canonical directory.",
                    )
            if concept_type == "Requirement":
                validate_requirement(path, relative, meta, body, requirement_ids, error)

        current = path.parent
        while current != root:
            index = current / "index.md"
            if not index.is_file():
                error("collection-index", index, "Every present concept collection requires index.md.")
            current = current.parent

    validate_requirement_relations(root, concept_files, concept_metadata, requirement_ids, error)

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
    for path in concept_files:
        if path.resolve() not in reachable:
            error("root-reachability", path, "Concept is not reachable from the root index.")

    return result(root, errors, governed_count)


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
    for field in ("requirement_sources", "derived_from"):
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
                    "subject must be a System, Offering, Capability, Feature, Surface, Bounded Context, or C4 element.",
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

    def has_cycle(node: str, active: set[str], visited: set[str]) -> bool:
        if node in active:
            return True
        if node in visited:
            return False
        active.add(node)
        for parent in parents_by_id.get(node, []):
            if parent in parents_by_id and has_cycle(parent, active, visited):
                return True
        active.remove(node)
        visited.add(node)
        return False

    visited: set[str] = set()
    for requirement_id in parents_by_id:
        if has_cycle(requirement_id, set(), visited):
            report(
                "requirement-derivation-cycle",
                requirement_ids[requirement_id],
                "derived_from relationships must not contain a cycle.",
            )
            break


def result(root: Path, errors: list[dict[str, str]], governed_count: int) -> dict[str, object]:
    return {
        "profile": {"identity": PROFILE_ID, "version": PROFILE_VERSION},
        "root": str(root),
        "structural_result": "pass" if not errors else "fail",
        "semantic_result": "unknown",
        "governed_concepts": governed_count,
        "errors": errors,
        "note": "A named manual semantic review is required for complete profile conformance.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("architecture_root", type=Path)
    parser.add_argument("--json", action="store_true", dest="json_output")
    args = parser.parse_args()
    report = validate(args.architecture_root)
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
