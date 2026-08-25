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
PROFILE_VERSION = "0.9.0"
COMMON_FIELDS = ("type", "title", "description", "status")
VALID_STATUSES = {"draft", "stable", "deprecated"}
REQUIRED_ROOT_CONCEPTS = {
    "lifecycle.md": "System Lifecycle",
    "ownership.md": "System Ownership",
    "decisions.md": "Architecture Decision Policy",
    "assurance.md": "System Assurance",
}
GOVERNED_TYPES = {
    *REQUIRED_ROOT_CONCEPTS.values(),
    "Architecture Decision Record",
    "Architecture Constraint",
    "Offering",
    "Audience",
    "Need",
    "Job to Be Done",
    "Value Proposition",
    "Use Case",
    "Product Quality Requirement",
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
    "Architecture Overview",
    "Constraint Set",
    "Risk Driver",
    "Risk Driver Set",
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
    if concept_type == "Architecture Constraint":
        return len(parts) == 2 and parts[0] == "constraints"
    exact_collections = {
        "Offering": ("value", "offerings"),
        "Audience": ("value", "audiences"),
        "Need": ("value", "needs"),
        "Job to Be Done": ("value", "jobs"),
        "Value Proposition": ("value", "value-propositions"),
        "Use Case": ("use-cases",),
        "Capability": ("capabilities",),
        "Feature": ("features",),
        "Surface": ("surfaces",),
        "Bounded Context": ("domains", "contexts"),
        "Context Map": ("domains", "context-maps"),
        "C4 Software System": ("structure", "systems"),
    }
    if concept_type in exact_collections:
        prefix = exact_collections[concept_type]
        return len(parts) == len(prefix) + 1 and parts[:-1] == prefix
    if concept_type == "Product Quality Requirement":
        return (
            len(parts) == 4
            and parts[0] == "quality"
            and parts[1] in QUALITY_CHARACTERISTICS
        )
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
            return parts[2] in {
                "system-landscape.md",
                "system-context.md",
                "containers.md",
            }
        return (
            len(parts) == 4
            and parts[:2] == ("structure", "views")
            and parts[2] in {"components", "dynamics", "deployments", "code"}
        )
    return True  # Open-world OKF concept outside the governed type vocabulary.


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
            error(
                "required-root-type",
                path,
                f"{filename} must have the exact profile type {concept_type}.",
            )

    forbidden_constraints_file = root / "constraints.md"
    if forbidden_constraints_file.exists():
        error(
            "constraint-collection",
            forbidden_constraints_file,
            "Architecture constraints must be named concepts under constraints/; constraints.md is prohibited.",
        )

    for collection, concept_type in (
        ("decisions", "Architecture Decision Record"),
        ("constraints", "Architecture Constraint"),
    ):
        collection_path = root / collection
        if not collection_path.exists():
            continue
        named_files = sorted(
            path for path in collection_path.glob("*.md") if path.name != "index.md"
        )
        if not named_files:
            error(
                "empty-collection",
                collection_path,
                f"{collection}/ must be omitted until its first {concept_type} is admitted.",
            )
        for path in named_files:
            try:
                meta, _ = parse_frontmatter(path)
            except (OSError, ValueError, yaml.YAMLError):
                continue
            if meta.get("type") != concept_type:
                error(
                    "collection-type",
                    path,
                    f"Every named concept directly under {collection}/ must have type {concept_type}.",
                )

    concept_files = sorted(
        path
        for path in root.rglob("*.md")
        if path.name not in {"index.md", "log.md"}
    )
    governed_count = 0
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
                f"{concept_type} is not a profile concept type; use the concept that owns the meaning.",
            )
        if concept_type in GOVERNED_TYPES:
            governed_count += 1
            for field in COMMON_FIELDS[1:]:
                value = meta.get(field)
                if not isinstance(value, str) or not value.strip():
                    error("common-frontmatter", path, f"{field} must be a non-empty string.")
            if meta.get("status") not in VALID_STATUSES:
                error("common-frontmatter", path, "status must be draft, stable, or deprecated.")
            if not path_matches(concept_type, relative):
                error(
                    "canonical-path",
                    path,
                    f"{concept_type} is not at a profile-defined canonical path.",
                )
            if path.name in PLURAL_CATCH_ALLS:
                error("stable-identity", path, "Plural catch-all concept files are prohibited.")
            if relative.as_posix() in REQUIRED_ROOT_CONCEPTS and not body.strip():
                error(
                    "required-root-body",
                    path,
                    "A required root concept must contain a substantive body.",
                )
            if concept_type == "Subdomain":
                expected = relative.parts[1] if len(relative.parts) > 1 else None
                if meta.get("classification") != expected:
                    error(
                        "subdomain-classification",
                        path,
                        "Subdomain classification must match its canonical directory.",
                    )

        current = path.parent
        while current != root:
            index = current / "index.md"
            if not index.is_file():
                error("collection-index", index, "Every present concept collection requires index.md.")
            current = current.parent

    markdown_files = {root_index, *root.rglob("*.md")}
    reachable: set[Path] = set()
    queue: deque[Path] = deque([root_index.resolve()])
    while queue:
        path = queue.popleft()
        if path in reachable:
            continue
        reachable.add(path)
        for target in local_markdown_targets(path, root):
            if target in markdown_files or target.resolve() in {item.resolve() for item in markdown_files}:
                queue.append(target.resolve())
    for path in concept_files:
        if path.resolve() not in reachable:
            error("root-reachability", path, "Concept is not reachable from the root index.")

    return result(root, errors, governed_count)


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
