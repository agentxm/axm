from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


VALIDATOR_PATH = Path(__file__).parents[1] / "validate_okf.py"
SPEC = importlib.util.spec_from_file_location("validate_okf", VALIDATOR_PATH)
assert SPEC is not None and SPEC.loader is not None
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


def concept(frontmatter: str, body: str = "# Synthetic concept\n") -> str:
    return f"---\n{frontmatter.rstrip()}\n---\n\n{body}"


class OkfValidatorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write(self, relative: str, content: str) -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def validate(self):
        return VALIDATOR.validate(self.root, VALIDATOR.dt.date(2026, 8, 26))

    def codes(self, severity: str | None = None) -> set[str]:
        findings, _ = self.validate()
        return {
            item["code"]
            for item in findings.items
            if severity is None or item["severity"] == severity
        }

    def test_type_only_concept_is_base_conformant(self) -> None:
        self.write("concept.md", concept("type: Reference"))
        self.assertEqual(set(), self.codes("error"))

    def test_optional_family_contract_defects_are_warnings(self) -> None:
        self.write(
            "provenance.md",
            concept(
                """type: Reference
generated: {}
sources:
  - title: Missing resource"""
            ),
        )
        self.write("computation.md", concept("type: Attested Computation"))
        errors = self.codes("error")
        warnings = self.codes("warn")
        self.assertNotIn("source-resource-missing", errors)
        self.assertNotIn("generated-by-missing", errors)
        self.assertNotIn("runtime-missing", errors)
        self.assertTrue(
            {"source-resource-missing", "generated-by-missing", "runtime-missing"}
            <= warnings
        )

    def test_yaml_document_end_is_not_an_okf_frontmatter_delimiter(self) -> None:
        self.write("concept.md", "---\ntype: Reference\n...\n\n# Synthetic concept\n")
        self.assertIn("frontmatter-delimiter", self.codes("error"))

    def test_nested_index_rejects_frontmatter(self) -> None:
        self.write("section/index.md", concept("type: Reference", "# Section\n"))
        self.assertIn("index-frontmatter", self.codes("error"))

    def test_root_index_rejects_empty_frontmatter(self) -> None:
        self.write("index.md", "---\n---\n\n# Bundle\n")
        self.assertIn("index-frontmatter", self.codes("error"))

    def test_root_index_rejects_non_mapping_frontmatter(self) -> None:
        self.write("index.md", "---\n- okf_version\n---\n\n# Bundle\n")
        self.assertIn("frontmatter-shape", self.codes("error"))

    def test_root_index_rejects_extra_frontmatter_keys(self) -> None:
        self.write(
            "index.md",
            "---\nokf_version: \"0.2\"\ntype: Reference\n---\n\n# Bundle\n",
        )
        self.assertIn("index-frontmatter", self.codes("error"))

    def test_root_index_records_declared_version_separately(self) -> None:
        self.write("index.md", "---\nokf_version: \"0.1\"\n---\n\n# Bundle\n")
        findings, stats = self.validate()
        self.assertEqual("0.1", stats["declared_okf_version"])
        self.assertIn("okf-version", {item["code"] for item in findings.items})

    def test_unquoted_numeric_version_is_warned(self) -> None:
        self.write("index.md", "---\nokf_version: 0.2\n---\n\n# Bundle\n")
        self.assertIn("okf-version-type", self.codes("warn"))

    def test_invalid_optional_dates_are_warnings(self) -> None:
        self.write(
            "concept.md",
            concept(
                """type: Reference
stale_after: \"2026-02-31\"
generated: { by: process:synthetic, at: \"2026-99-99T40:00:00Z\" }
sources:
  - resource: synthetic.md
    last_modified: \"2026-02-31\"
"""
            ),
        )
        self.assertIn("date-format", self.codes("warn"))
        self.assertIn("datetime-format", self.codes("warn"))
        self.assertEqual(set(), self.codes("error"))

    def test_invalid_log_date_is_a_conformance_error(self) -> None:
        self.write("log.md", "# Log\n\n## 2026-02-31\n\n- Synthetic update.\n")
        self.assertIn("log-date", self.codes("error"))

    def test_empty_verified_does_not_elevate_trust(self) -> None:
        self.write("concept.md", concept("type: Reference\nverified: []"))
        findings, stats = self.validate()
        self.assertEqual({"unverified": 1}, stats["tiers"])
        self.assertIn("verified-empty", {item["code"] for item in findings.items})

    def test_malformed_verified_event_does_not_elevate_trust(self) -> None:
        self.write(
            "concept.md",
            concept("type: Reference\nverified:\n  - { at: 2026-08-26T12:00:00Z }"),
        )
        _, stats = self.validate()
        self.assertEqual({"unverified": 1}, stats["tiers"])

    def test_valid_verification_events_derive_trust_tiers(self) -> None:
        self.write(
            "machine.md",
            concept(
                "type: Reference\nverified: { by: process:synthetic, at: 2026-08-26T12:00:00Z }"
            ),
        )
        self.write(
            "human.md",
            concept(
                "type: Reference\nverified: { by: human:reviewer, at: 2026-08-26T12:00:00Z }"
            ),
        )
        _, stats = self.validate()
        self.assertEqual(1, stats["tiers"]["machine-confirmed"])
        self.assertEqual(1, stats["tiers"]["human-reviewed"])

    def test_invalid_status_is_not_counted_as_stable(self) -> None:
        self.write("concept.md", concept("type: Reference\nstatus: proposed"))
        _, stats = self.validate()
        self.assertEqual({"invalid": 1}, stats["status"])

    def test_index_omitting_available_description_warns(self) -> None:
        self.write(
            "concept.md",
            concept(
                "type: Reference\ntitle: Synthetic concept\ndescription: A synthetic concept."
            ),
        )
        self.write(
            "index.md",
            "# Bundle\n\nSynthetic scope.\n\n- [Synthetic concept](concept.md)\n",
        )
        self.assertIn("index-description-missing", self.codes("warn"))

    def test_nested_index_quality_is_checked_without_root_index(self) -> None:
        self.write(
            "section/concept.md",
            concept("type: Reference\ntitle: Canonical title\ndescription: Canonical description."),
        )
        self.write(
            "section/index.md",
            "# Section\n\nSynthetic scope.\n\n- [Wrong title](concept.md) - Wrong description.\n",
        )
        warnings = self.codes("warn")
        self.assertIn("discovery-root-missing", warnings)
        self.assertIn("index-title-mismatch", warnings)
        self.assertIn("index-description-mismatch", warnings)

    def test_top_level_resource_path_is_checked(self) -> None:
        self.write("concept.md", concept("type: Reference\nresource: missing.md"))
        self.assertIn("path-unresolved", self.codes("warn"))

    def test_per_source_usage_window_is_validated(self) -> None:
        self.write(
            "concept.md",
            concept(
                """type: Reference
sources:
  - resource: synthetic-scope
    usage_count: 3
    usage_window: { from: \"2026-02-31\", to: \"2026-08-26\" }"""
            ),
        )
        self.assertIn("date-format", self.codes("warn"))


if __name__ == "__main__":
    unittest.main()
