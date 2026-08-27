#!/usr/bin/env python3
"""Inspect an established profile-governed Gen Stack corpus."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from gen_stack_profile.inspection import (  # noqa: E402
    InspectionFailure,
    InspectionPlane,
    diff_envelope,
    load_snapshot,
    standalone_failure_envelope,
)


LIST_KINDS = (
    "concepts",
    "surfaces",
    "structure",
    "requirements",
    "intent",
    "architecture",
    "governance",
    "evaluations",
)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument(
        "--repository-root",
        "-C",
        type=Path,
        default=Path("."),
        help="Repository root; defaults to the current directory.",
    )
    root.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Emit the complete versioned JSON envelope.",
    )
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="Report discovery state and operation eligibility.")
    commands.add_parser("validate", help="Report layered profile validation results.")

    list_parser = commands.add_parser("list", help="List governed concepts by natural kind.")
    list_parser.add_argument("kind", choices=LIST_KINDS)

    show_parser = commands.add_parser("show", help="Inspect one concept and an optional natural view.")
    show_parser.add_argument("reference")
    show_parser.add_argument("view", nargs="?")

    search_parser = commands.add_parser("search", help="Search governed concept meaning.")
    search_parser.add_argument("terms", nargs="+")

    context_parser = commands.add_parser(
        "evaluation-context",
        help="Project Surface/C4 hierarchies and directly associated Requirements.",
    )
    context_parser.add_argument("subject", nargs="?")

    candidates_parser = commands.add_parser(
        "evaluation-candidates",
        help="Project policy-neutral Evaluation role-and-target candidates.",
    )
    candidates_parser.add_argument("subject", nargs="?")

    commands.add_parser("snapshot", help="Emit a deterministic corpus snapshot envelope.")

    path_parser = commands.add_parser("path", help="Find a controlled relationship path.")
    path_parser.add_argument("from_reference")
    path_parser.add_argument("to_reference")

    why_parser = commands.add_parser("why", help="Explain concept identity or relationship provenance.")
    why_parser.add_argument("reference")

    affected_parser = commands.add_parser(
        "affected-concepts",
        help="Project controlled-relationship reachability without claiming realized impact.",
    )
    affected_parser.add_argument("reference")

    diff_parser = commands.add_parser("diff", help="Compare two inspection snapshot files.")
    diff_parser.add_argument("before", type=Path)
    diff_parser.add_argument("after", type=Path)
    return root


def _normalize_transport_options(argv: list[str]) -> list[str]:
    """Allow transport-only global options before or after the subcommand."""

    global_options: list[str] = []
    remaining: list[str] = []
    index = 0
    while index < len(argv):
        token = argv[index]
        if token == "--json":
            global_options.append(token)
        elif token in {"--repository-root", "-C"}:
            if index + 1 >= len(argv):
                remaining.append(token)
            else:
                global_options.extend((token, argv[index + 1]))
                index += 1
        elif token.startswith("--repository-root="):
            global_options.append(token)
        else:
            remaining.append(token)
        index += 1
    return [*global_options, *remaining]


def _human_lines(payload: dict[str, object]) -> str:
    operation = str(payload["operation"])
    data = payload.get("data")
    if operation == "status" and isinstance(data, dict):
        lines = [f"Gen Stack corpus: {data.get('state')}"]
        for item in data.get("operations", []):
            if isinstance(item, dict):
                marker = "ready" if item.get("eligible") else "unavailable"
                lines.append(f"  {item.get('operation')}: {marker} — {item.get('reason')}")
        return "\n".join(lines)
    if operation == "validate" and isinstance(data, dict):
        lines = [
            f"Discovery: {data.get('state')}",
            f"OKF conformance: {data.get('okf_result')}",
            f"Structural profile: {data.get('structural_result')}",
            f"Semantic review: {data.get('semantic_result')}",
            f"Coverage or fitness: {data.get('coverage_or_fitness_result')}",
        ]
        for diagnostic in payload.get("diagnostics", []):
            if isinstance(diagnostic, dict):
                lines.append(
                    f"ERROR {diagnostic.get('rule')} {diagnostic.get('path')}: {diagnostic.get('message')}"
                )
        return "\n".join(lines)
    if operation == "list" and isinstance(data, dict):
        return "\n".join(
            f"{item.get('ref')}  [{item.get('type')}]  {item.get('title')}"
            for item in data.get("concepts", [])
            if isinstance(item, dict)
        )
    if operation == "search" and isinstance(data, dict):
        lines = [f"{data.get('total')} result(s) for {data.get('query')!r}"]
        lines.extend(
            f"{item.get('ref')}  [{item.get('type')}]  {item.get('title')}"
            for item in data.get("results", [])
            if isinstance(item, dict)
        )
        return "\n".join(lines)
    if operation == "show" and isinstance(data, dict) and data.get("view") == "concept":
        result = data.get("result")
        if isinstance(result, dict):
            lines = [
                f"{result.get('title')} [{result.get('type')}]",
                str(result.get("ref")),
                str(result.get("description")),
                "",
                str(result.get("body", "")),
                "",
                "Views: " + ", ".join(str(item) for item in result.get("available_views", [])),
            ]
            return "\n".join(lines).rstrip()
    return json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True)


def _emit(payload: dict[str, object], *, json_output: bool) -> None:
    if json_output or payload.get("operation") == "snapshot":
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print(_human_lines(payload))


def _blocking(payload: dict[str, object]) -> bool:
    return any(
        isinstance(item, dict) and item.get("blocking") is True
        for item in payload.get("diagnostics", [])
    )


def main(argv: list[str] | None = None) -> int:
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    args = parser().parse_args(_normalize_transport_options(raw_argv))
    if args.command == "diff":
        try:
            payload = diff_envelope(load_snapshot(args.before), load_snapshot(args.after))
        except InspectionFailure as failure:
            payload = standalone_failure_envelope("diff", failure)
            _emit(payload, json_output=args.json_output)
            return 1
        _emit(payload, json_output=args.json_output)
        return 0

    plane = InspectionPlane(args.repository_root)
    try:
        if args.command == "status":
            payload = plane.status()
        elif args.command == "validate":
            payload = plane.validation()
        elif args.command == "list":
            payload = plane.list_concepts(args.kind)
        elif args.command == "show":
            payload = plane.show(args.reference, args.view)
        elif args.command == "search":
            payload = plane.search(" ".join(args.terms))
        elif args.command == "evaluation-context":
            payload = plane.evaluation_context(args.subject)
        elif args.command == "evaluation-candidates":
            payload = plane.evaluation_candidates(args.subject)
        elif args.command == "snapshot":
            payload = plane.snapshot()
        elif args.command == "path":
            payload = plane.path(args.from_reference, args.to_reference)
        elif args.command == "why":
            payload = plane.why(args.reference)
        elif args.command == "affected-concepts":
            payload = plane.affected_concepts(args.reference)
        else:  # pragma: no cover - argparse owns command exhaustiveness
            raise AssertionError(args.command)
    except InspectionFailure as failure:
        payload = plane.failure_envelope(args.command, failure)
    _emit(payload, json_output=args.json_output)
    return 1 if _blocking(payload) else 0


if __name__ == "__main__":
    raise SystemExit(main())
