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
[software-architecture-docs profile](https://example.test/profile) version 0.9.0.

"""
            + "\n".join(links)
            + "\n",
            encoding="utf-8",
        )

    def rules(self) -> set[str]:
        report = VALIDATOR.validate(self.root)
        return {item["rule"] for item in report["errors"]}

    def test_minimal_required_kernel_passes(self) -> None:
        report = VALIDATOR.validate(self.root)
        self.assertEqual("pass", report["structural_result"])
        self.assertEqual("unknown", report["semantic_result"])
        self.assertEqual("0.9.0", report["profile"]["version"])

    def test_missing_required_root_concept_fails(self) -> None:
        (self.root / "assurance.md").unlink()
        self.assertIn("required-root-concept", self.rules())

    def test_wrong_required_type_fails_exact_type_rule(self) -> None:
        (self.root / "lifecycle.md").write_text(
            concept("Local Lifecycle", "Wrong root type"), encoding="utf-8"
        )
        self.assertIn("required-root-type", self.rules())

    def test_blank_required_body_fails(self) -> None:
        path = self.root / "assurance.md"
        path.write_text(concept("System Assurance").split("# Synthetic concept")[0], encoding="utf-8")
        self.assertIn("required-root-body", self.rules())

    def test_constraints_catch_all_is_prohibited(self) -> None:
        (self.root / "constraints.md").write_text(
            concept("Architecture Constraint", "Constraint set"), encoding="utf-8"
        )
        self.assertIn("constraint-collection", self.rules())

    def test_risk_driver_profile_like_type_is_prohibited(self) -> None:
        path = self.root / "risk-driver.md"
        path.write_text(concept("Risk Driver", "Generic risk summary"), encoding="utf-8")
        with (self.root / "index.md").open("a", encoding="utf-8") as index:
            index.write("- [Generic risk summary](risk-driver.md)\n")
        self.assertIn("profile-type-prohibited", self.rules())

    def test_empty_conditional_collection_fails(self) -> None:
        decisions = self.root / "decisions"
        decisions.mkdir()
        (decisions / "index.md").write_text("# Decisions\n", encoding="utf-8")
        self.assertIn("empty-collection", self.rules())

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

    def test_named_constraint_collection_passes(self) -> None:
        constraints = self.root / "constraints"
        constraints.mkdir()
        (constraints / "index.md").write_text(
            "# Constraints\n\n- [Regional residency](regional-residency.md)\n",
            encoding="utf-8",
        )
        (constraints / "regional-residency.md").write_text(
            concept("Architecture Constraint", "Regional residency"), encoding="utf-8"
        )
        with (self.root / "index.md").open("a", encoding="utf-8") as index:
            index.write("- [Constraints](constraints/)\n")
        self.assertEqual("pass", VALIDATOR.validate(self.root)["structural_result"])

    def test_wrong_type_in_decision_collection_fails(self) -> None:
        decisions = self.root / "decisions"
        decisions.mkdir()
        (decisions / "index.md").write_text(
            "# Decisions\n\n- [Wrong](wrong.md)\n", encoding="utf-8"
        )
        (decisions / "wrong.md").write_text(
            concept("Architecture Constraint", "Wrong"), encoding="utf-8"
        )
        with (self.root / "index.md").open("a", encoding="utf-8") as index:
            index.write("- [Decisions](decisions/)\n")
        self.assertIn("collection-type", self.rules())


if __name__ == "__main__":
    unittest.main()
