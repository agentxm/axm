"""Composite mechanical validation for Gen Stack repository workflows."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from .inspection import InspectionFailure, InspectionPlane


def _last_json_object(output: str) -> dict[str, object]:
    decoder = json.JSONDecoder()
    candidate: dict[str, object] | None = None
    offset = 0
    while offset < len(output):
        try:
            value, end = decoder.raw_decode(output, offset)
        except json.JSONDecodeError:
            offset += 1
            continue
        if isinstance(value, dict):
            candidate = value
        offset = end
    if candidate is None:
        raise InspectionFailure(
            "okf-validator-contract",
            "AXM did not return a machine-readable OKF validation result.",
        )
    return candidate


def _diagnostic_path(package_root: Path, raw: object) -> str:
    value = str(raw or ".")
    path = Path(value)
    if path.is_absolute():
        try:
            relative = path.resolve(strict=False).relative_to(package_root.resolve())
            value = relative.as_posix()
        except ValueError:
            return "<outside-validation-package>"
    value = value.removeprefix("src/")
    return "gen-stack" if value in {"", "."} else f"gen-stack/{value}"


def run_okf_check(repository_root: Path) -> tuple[str, list[dict[str, object]]]:
    corpus_root = repository_root / "gen-stack"
    if not corpus_root.is_dir():
        return "fail", []
    if corpus_root.is_symlink() or any(path.is_symlink() for path in corpus_root.rglob("*")):
        return "fail", []
    with tempfile.TemporaryDirectory(prefix="gen-stack-okf-") as directory:
        workspace_root = Path(directory)
        (workspace_root / "axm.json").write_text(
            json.dumps({"owner": "@example"}) + "\n", encoding="utf-8"
        )
        package_root = workspace_root / "knowledge" / "gen-stack-check"
        package_root.mkdir(parents=True)
        (package_root / "knowledge.json").write_text(
            json.dumps(
                {
                    "$schema": "https://axm.sh/schemas/knowledge.schema.json",
                    "owner": "@example",
                    "name": "gen-stack-check",
                    "version": "0.0.0",
                    "type": "knowledge",
                    "format": {"name": "okf", "version": "0.2"},
                    "bundleRoot": "src",
                    "description": "A synthetic package used for one read-only Gen Stack OKF check.",
                    "license": "CC-BY-4.0",
                    "standalone": True,
                }
            )
            + "\n",
            encoding="utf-8",
        )
        try:
            shutil.copytree(corpus_root, package_root / "src", symlinks=True)
        except OSError as exc:
            raise InspectionFailure(
                "okf-validation-input",
                "The selected corpus could not be prepared for native OKF validation.",
            ) from exc
        try:
            result = subprocess.run(
                ["axm", "knowledge", "lint", "--path", str(package_root), "--json"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                timeout=60,
                cwd=workspace_root,
            )
        except FileNotFoundError as exc:
            raise InspectionFailure(
                "okf-validator-unavailable",
                "AXM is required to run the native OKF validation layer.",
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise InspectionFailure(
                "okf-validator-timeout",
                "AXM did not complete OKF validation within 60 seconds.",
            ) from exc
        payload = _last_json_object(result.stdout)
        if payload.get("ok") is not True or not isinstance(payload.get("result"), dict):
            raise InspectionFailure(
                "okf-validator-failure",
                "AXM could not execute the native OKF validation layer; rerun it directly for environment diagnostics.",
            )
        validation = payload["result"]
        assert isinstance(validation, dict)
        diagnostics: list[dict[str, object]] = []
        for item in validation.get("diagnostics", []):
            if not isinstance(item, dict):
                continue
            severity = str(item.get("severity", "error")).lower()
            if severity not in {"info", "warning", "error"}:
                severity = "error"
            diagnostics.append(
                {
                    "rule": f"okf:{item.get('code') or item.get('rule') or 'validation'}",
                    "severity": severity,
                    "path": _diagnostic_path(
                        package_root,
                        item.get("relativePath") or item.get("path") or item.get("file"),
                    ),
                    "location": None,
                    "message": str(item.get("message", "OKF validation reported a finding.")),
                    "blocking": severity == "error",
                    "recovery": None,
                }
            )
        valid = validation.get("valid") is True and result.returncode == 0
        return ("pass" if valid else "fail"), diagnostics


def composite_check(
    repository_root: Path, input_identity: dict[str, object]
) -> dict[str, object]:
    plane = InspectionPlane(repository_root, input_identity=input_identity)
    okf_result, okf_diagnostics = run_okf_check(repository_root)
    profile_diagnostics = plane._base_diagnostics()
    projection_failed = any(
        item.get("rule") == "relationship-projection" for item in profile_diagnostics
    )
    non_projection_failed = any(
        item.get("blocking") is True and item.get("rule") != "relationship-projection"
        for item in profile_diagnostics
    )
    return plane.envelope(
        "check",
        {
            "state": plane.state,
            "layers": {
                "okf": {"result": okf_result, "provider": "axm knowledge lint"},
                "structural_profile": {
                    "result": "fail" if non_projection_failed else "pass",
                    "provider": "gen-stack profile validator",
                },
                "relationship_projection": {
                    "result": "fail" if projection_failed else "pass",
                    "provider": "gen-stack relationship analysis",
                },
                "semantic_review": {"result": "unknown", "provider": None},
                "coverage_or_fitness": {"result": "unknown", "provider": None},
            },
            "governed_concepts": plane.validation_report.get("governed_concepts", 0),
        },
        diagnostics=okf_diagnostics,
        okf_result=okf_result,
        include_okf_unknown=False,
    )
