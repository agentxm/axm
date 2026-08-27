#!/usr/bin/env python3
"""Synchronize relationships in ``<repository-root>/gen-stack``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from gen_stack_profile.frontmatter import replace_relationships  # noqa: E402
from gen_stack_profile.location import inspect_repository  # noqa: E402
from gen_stack_profile.profile import PROFILE_ID, PROFILE_VERSION  # noqa: E402
from gen_stack_profile.relationships import analyze_relationships  # noqa: E402


def report_payload(
    repository_root: Path,
    corpus_root: Path,
    result: str,
    changes: list[str],
    errors: list[dict[str, str]],
) -> dict[str, object]:
    return {
        "profile": {"identity": PROFILE_ID, "version": PROFILE_VERSION},
        "repository_root": str(repository_root),
        "corpus_root": str(corpus_root),
        "result": result,
        "changes": changes,
        "errors": errors,
    }


def repository_relative(repository_root: Path, path: Path) -> str:
    try:
        return path.relative_to(repository_root).as_posix()
    except ValueError:
        return str(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "repository_root",
        nargs="?",
        type=Path,
        default=Path("."),
        help="Repository root; defaults to the current directory.",
    )
    parser.add_argument("--check", action="store_true", help="Fail when synchronization would change files.")
    parser.add_argument("--json", action="store_true", dest="json_output")
    args = parser.parse_args()

    location = inspect_repository(args.repository_root)
    if location.diagnostics:
        errors = [
            {
                "rule": item.rule,
                "path": repository_relative(location.repository_root, item.path),
                "message": item.message,
            }
            for item in location.diagnostics
        ]
        payload = report_payload(
            location.repository_root,
            location.corpus_root,
            "fail",
            [],
            errors,
        )
        if args.json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            for item in errors:
                print(f"ERROR {item['rule']} {item['path']}: {item['message']}")
        return 2

    analysis = analyze_relationships(location.corpus_root)
    blocking = [item for item in analysis.diagnostics if item.rule != "relationship-projection"]
    errors = [
        {
            "rule": item.rule,
            "path": f"gen-stack/{item.path.as_posix()}",
            "message": item.message,
        }
        for item in blocking
    ]
    changes = [f"gen-stack/{path.as_posix()}" for path in analysis.projection_paths]
    if blocking:
        payload = report_payload(
            location.repository_root, location.corpus_root, "fail", changes, errors
        )
        if args.json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            for item in errors:
                print(f"ERROR {item['rule']} {item['path']}: {item['message']}")
        return 2

    if args.check:
        result = "pass" if not changes else "changes-required"
        payload = report_payload(
            location.repository_root, location.corpus_root, result, changes, []
        )
        if args.json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        elif changes:
            for path in changes:
                print(f"CHANGE {path}")
        else:
            print(f"Relationship synchronization: pass ({PROFILE_ID} {PROFILE_VERSION})")
        return 0 if not changes else 1

    changed: list[str] = []
    for relative in analysis.projection_paths:
        concept = analysis.concepts[relative]
        if replace_relationships(concept.path, analysis.expected.get(relative, {})):
            changed.append(f"gen-stack/{relative.as_posix()}")

    verified = analyze_relationships(location.corpus_root)
    remaining = [
        {
            "rule": item.rule,
            "path": f"gen-stack/{item.path.as_posix()}",
            "message": item.message,
        }
        for item in verified.diagnostics
    ]
    result = "pass" if not remaining else "fail"
    payload = report_payload(
        location.repository_root, location.corpus_root, result, changed, remaining
    )
    if args.json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        for path in changed:
            print(f"UPDATED {path}")
        for item in remaining:
            print(f"ERROR {item['rule']} {item['path']}: {item['message']}")
        if not changed and not remaining:
            print(f"Relationship synchronization: pass ({PROFILE_ID} {PROFILE_VERSION})")
    return 0 if result == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
