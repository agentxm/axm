from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


VALIDATOR_PATH = Path(__file__).parents[1] / "validate-software-architecture-profile.py"
SPEC = importlib.util.spec_from_file_location("software_architecture_profile", VALIDATOR_PATH)
assert SPEC is not None and SPEC.loader is not None
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


REQUIRED = {
    "system.md": "System",
    "lifecycle.md": "System Lifecycle",
    "ownership.md": "System Ownership",
    "decisions.md": "Architecture Decision Policy",
    "assurance.md": "System Assurance",
}


def concept(concept_type: str, title: str = "Synthetic concept") -> str:
    return f"""---
type: {concept_type}
title: {title}
description: A synthetic concept used to validate the profile checker.
status: stable
---

# {title}

Accepted synthetic meaning with an authority, consequence, and review trigger.
"""


def requirement(
    requirement_id: str = "SYN-REQ-0001",
    requirement_type: str = "functional",
    subject: str = "/system.md",
    extra: str = "",
) -> str:
    return f"""---
type: Requirement
title: Preserve accepted state
description: A failed operation leaves accepted state unchanged.
status: stable
requirement_id: {requirement_id}
requirement_type: {requirement_type}
subject: {subject}
{extra}---

# Preserve accepted state

## Requirement

When an operation fails, the System shall leave accepted state unchanged.

## Rationale

Partial state would make the outcome ambiguous.
"""


class ProfileValidatorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.write_valid_kernel()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_valid_kernel(self) -> None:
        links = []
        for filename, concept_type in REQUIRED.items():
            title = concept_type
            (self.root / filename).write_text(concept(concept_type, title), encoding="utf-8")
            links.append(f"- [{title}]({filename})")
        (self.root / "index.md").write_text(
            """---
okf_version: "0.2"
---

# Synthetic architecture

This documentation set adopts the
[software-architecture-docs profile](https://example.test/profile) version 0.10.2.

"""
            + "\n".join(links)
            + "\n",
            encoding="utf-8",
        )

    def rules(self) -> set[str]:
        report = VALIDATOR.validate(self.root)
        return {item["rule"] for item in report["errors"]}

    def add_system_requirement(self, body: str | None = None) -> Path:
        subject = self.root / "system"
        requirement_root = subject / "requirements"
        functional = requirement_root / "functional"
        functional.mkdir(parents=True)
        (subject / "index.md").write_text(
            "# System details\n\n- [Requirements](requirements/)\n", encoding="utf-8"
        )
        (requirement_root / "index.md").write_text(
            "# System requirements\n\n- [Functional](functional/)\n", encoding="utf-8"
        )
        (functional / "index.md").write_text(
            "# Functional requirements\n\n- [Preserve accepted state](preserve-state.md)\n",
            encoding="utf-8",
        )
        path = functional / "preserve-state.md"
        path.write_text(body or requirement(), encoding="utf-8")
        with (self.root / "system.md").open("a", encoding="utf-8") as system:
            system.write("\n[System requirements](system/requirements/)\n")
        return path

    def test_minimal_required_kernel_passes(self) -> None:
        report = VALIDATOR.validate(self.root)
        self.assertEqual("pass", report["structural_result"])
        self.assertEqual("unknown", report["semantic_result"])
        self.assertEqual("0.10.2", report["profile"]["version"])

    def test_missing_system_fails(self) -> None:
        (self.root / "system.md").unlink()
        self.assertIn("required-root-concept", self.rules())

    def test_wrong_required_type_fails(self) -> None:
        (self.root / "system.md").write_text(
            concept("C4 Software System", "Wrong root type"), encoding="utf-8"
        )
        self.assertIn("required-root-type", self.rules())

    def test_valid_colocated_requirement_passes(self) -> None:
        self.add_system_requirement()
        self.assertEqual("pass", VALIDATOR.validate(self.root)["structural_result"])

    def test_requirement_type_must_match_path(self) -> None:
        self.add_system_requirement(requirement(requirement_type="usability"))
        self.assertIn("requirement-colocation", self.rules())

    def test_requirement_subject_must_resolve(self) -> None:
        self.add_system_requirement(requirement(subject="/missing.md"))
        self.assertIn("requirement-subject-resolves", self.rules())

    def test_quality_requirement_requires_quality_metadata(self) -> None:
        path = self.add_system_requirement(requirement(requirement_type="quality"))
        quality = path.parent.parent / "quality"
        quality.mkdir()
        (quality / "index.md").write_text(
            "# Quality requirements\n\n- [Preserve accepted state](preserve-state.md)\n",
            encoding="utf-8",
        )
        path.rename(quality / path.name)
        (path.parent / "index.md").unlink()
        path.parent.rmdir()
        self.assertIn("quality-requirement-metadata", self.rules())

    def test_empty_requirement_type_fails(self) -> None:
        self.add_system_requirement()
        usability = self.root / "system" / "requirements" / "usability"
        usability.mkdir()
        (usability / "index.md").write_text("# Usability requirements\n", encoding="utf-8")
        self.assertIn("empty-requirement-type", self.rules())

    def test_legacy_constraint_type_is_prohibited(self) -> None:
        path = self.root / "legacy.md"
        path.write_text(concept("Architecture Constraint"), encoding="utf-8")
        with (self.root / "index.md").open("a", encoding="utf-8") as index:
            index.write("- [Legacy](legacy.md)\n")
        self.assertIn("profile-type-prohibited", self.rules())

    def test_top_level_quality_collection_is_prohibited(self) -> None:
        quality = self.root / "quality"
        quality.mkdir()
        (quality / "index.md").write_text("# Quality\n", encoding="utf-8")
        self.assertIn("superseded-collection", self.rules())

    def test_named_decision_collection_passes(self) -> None:
        decisions = self.root / "decisions"
        decisions.mkdir()
        (decisions / "index.md").write_text(
            "# Decisions\n\n- [Preserve state](preserve-state.md)\n", encoding="utf-8"
        )
        (decisions / "preserve-state.md").write_text(
            concept("Architecture Decision Record", "Preserve state"), encoding="utf-8"
        )
        with (self.root / "index.md").open("a", encoding="utf-8") as index:
            index.write("- [Decisions](decisions/)\n")
        self.assertEqual("pass", VALIDATOR.validate(self.root)["structural_result"])


if __name__ == "__main__":
    unittest.main()
