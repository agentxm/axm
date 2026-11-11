from __future__ import annotations

import importlib.util
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


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
        return VALIDATOR.validate(
            self.root, VALIDATOR.dt.datetime(2026, 8, 26, 12, tzinfo=VALIDATOR.dt.timezone.utc)
        )

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

    def test_index_structure_is_required_at_root_and_nested_levels(self) -> None:
        cases = {
            "": "index-structure",
            "An introduction without a heading.\n": "index-structure",
            "* [Concept](concept.md)\n": "index-structure",
            "* [Concept](concept.md)\n\n# Later heading\n": "index-structure",
            "# Bundle\n\n* Unlinked concept\n": "index-entry",
            "# Bundle\n\n* [Undefined reference]\n": "index-entry",
            "```markdown\n# Example only\n```\n": "index-structure",
            "<!-- # Comment only -->\n": "index-structure",
        }
        for path in ("index.md", "section/index.md"):
            for body, expected in cases.items():
                with self.subTest(path=path, body=body):
                    index = self.write(path, body)
                    self.assertIn(expected, self.codes("error"))
                    index.unlink()

    def test_index_accepts_standard_heading_and_link_forms(self) -> None:
        for body in (
            "# Bundle\n\n* [Concept](concept.md)\n",
            "# `Bundle`\n\n- [Concept](concept.md)\n",
            "Bundle\n======\n\n+ [Concept](concept.md)\n",
            "Bundle\n------\n\n- [Concept](concept.md)\n",
            "# Bundle\n\n- [Concept][target]\n\n[target]: concept.md\n",
            "# Bundle\n\n- [Concept][]\n\n[Concept]: concept.md\n",
            "# Bundle\n\n- [Concept]\n\n[concept]: concept.md\n",
            "# Bundle\n\n```markdown\n- Not an entry\n```\n\n- [Concept](concept.md)\n",
        ):
            with self.subTest(body=body):
                self.write("index.md", body)
                self.assertEqual(set(), self.codes("error"))

    def test_headed_empty_index_remains_advisory(self) -> None:
        self.write("index.md", "# Empty directory\n")
        self.assertEqual(set(), self.codes("error"))
        self.assertIn("index-empty", self.codes("warn"))

    def test_missing_index_and_broken_links_remain_conformant(self) -> None:
        self.write("concept.md", concept(
            "type: Unregistered type\ncustom_key: retained",
            "# Concept\n\nSee [Future concept](missing.md).\n",
        ))
        self.assertEqual(set(), self.codes("error"))
        self.assertTrue({"discovery-root-missing", "link-broken"} <= self.codes("warn"))

    def test_bad_index_structure_fails_cli_without_strict(self) -> None:
        self.write("index.md", "* [Future concept](missing.md)\n")
        code, output, _ = self.run_cli()
        self.assertEqual(1, code)
        self.assertFalse(json.loads(output)["base_conformant"])

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

    def test_verification_freshness_compares_instants_without_changing_tier(self) -> None:
        for checked_at, predates in (
            ("2026-08-26T11:59:59Z", True),
            ("2026-08-26T07:00:00-05:00", False),
            ("2026-08-27T01:00:00+13:00", False),
            ("2026-08-26T12:00:01Z", False),
        ):
            with self.subTest(checked_at=checked_at):
                self.write("concept.md", concept(
                    "type: Reference\n"
                    "generated: { by: process:synthetic, at: 2026-08-26T12:00:00Z }\n"
                    f"verified: {{ by: human:reviewer, at: {checked_at} }}\n"
                ))
                findings, stats = self.validate()
                self.assertEqual({"human-reviewed": 1}, stats["tiers"])
                self.assertEqual(0, findings.count("error"))
                self.assertEqual(predates, "verification-predates-content" in self.codes("info"))
                self.assertNotIn("verification-predates-content", self.codes("warn"))

    def test_latest_valid_verification_is_independent_of_order_and_actor(self) -> None:
        old_human = "  - { by: human:reviewer, at: 2026-08-25T12:00:00Z }\n"
        new_machine = "  - { by: process:synthetic, at: 2026-08-27T12:00:00Z }\n"
        for events in (old_human + new_machine, new_machine + old_human):
            with self.subTest(events=events):
                self.write("concept.md", concept(
                    "type: Reference\n"
                    "generated: { by: process:synthetic, at: 2026-08-26T12:00:00Z }\n"
                    "verified:\n" + events
                ))
                _, stats = self.validate()
                self.assertEqual({"human-reviewed": 1}, stats["tiers"])
                self.assertNotIn("verification-predates-content", self.codes())

    def test_invalid_later_event_does_not_hide_unreviewed_change(self) -> None:
        self.write("concept.md", concept(
            "type: Reference\n"
            "generated: { by: process:synthetic, at: 2026-08-26T12:00:00Z }\n"
            "verified:\n"
            "  - { by: human:reviewer, at: 2026-08-25T12:00:00Z }\n"
            "  - { at: 2026-08-27T12:00:00Z }\n"
            "  - { by: human:reviewer, at: 2026-08-28T12:00:00 }\n"
        ))
        self.assertIn("verification-predates-content", self.codes("info"))

    def test_unknown_timestamps_do_not_infer_verification_freshness(self) -> None:
        for metadata in (
            "verified: { by: human:reviewer, at: 2026-08-25T12:00:00Z }",
            "generated: { by: process:synthetic, at: 2026-08-26T12:00:00Z }",
            "generated: { by: process:synthetic, at: 2026-08-26 }\n"
            "verified: { by: human:reviewer, at: 2026-08-25T12:00:00Z }",
            "generated: { by: process:synthetic, at: 2026-08-26T12:00:00Z }\n"
            "verified: { by: human:reviewer, at: 2026-08-25 }",
        ):
            with self.subTest(metadata=metadata):
                self.write("concept.md", concept("type: Reference\n" + metadata))
                self.assertNotIn("verification-predates-content", self.codes())

    def test_verification_observation_is_info_only_even_in_strict_mode(self) -> None:
        self.write("index.md", "# Bundle\n\n* [Concept](concept.md)\n")
        original = concept(
            "type: Reference\n"
            "generated: { by: process:synthetic, at: 2026-08-26T12:00:00Z }\n"
            "verified: { by: human:reviewer, at: 2026-08-25T12:00:00Z }\n"
        )
        path = self.write("concept.md", original)
        for info in (False, True):
            code, output, _ = self.run_cli("--strict", *(["--info"] if info else []))
            data = json.loads(output)
            self.assertEqual(0, code)
            self.assertTrue(data["base_conformant"])
            self.assertEqual({"human-reviewed": 1}, data["summary"]["trust_tiers"])
            self.assertEqual(info, any(
                f["code"] == "verification-predates-content" for f in data["findings"]
            ))
        self.assertEqual(original, path.read_text(encoding="utf-8"))

    def test_concept_template_does_not_claim_unobserved_metadata(self) -> None:
        template = VALIDATOR_PATH.parents[1] / "templates" / "concept.md"
        fm = VALIDATOR.parse_mapping_frontmatter(template.read_text(encoding="utf-8"))
        self.assertTrue(fm["type"])
        self.assertFalse({"verified", "generated", "sources", "resource", "stale_after", "usage_window"} & fm.keys())

    def test_worked_example_has_consistent_discovery_and_resolvable_links(self) -> None:
        example = VALIDATOR_PATH.parents[1] / "examples" / "delivery"
        findings, stats = VALIDATOR.validate(
            example, VALIDATOR.dt.datetime(2026, 10, 30, tzinfo=VALIDATOR.dt.timezone.utc)
        )
        self.assertEqual([], findings.items)
        self.assertEqual(3, stats["concepts"])
        self.assertEqual({"unverified": 3}, stats["tiers"])

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
        self.assertIn("datetime-format", self.codes("warn"))

    def test_timestamp_fields_require_an_explicit_offset(self) -> None:
        fields = [
            "generated: {{ by: process:synthetic, at: {value} }}",
            "verified: {{ by: human:reviewer, at: {value} }}",
            "stale_after: {value}",
            "sources:\n  - resource: synthetic-scope\n    last_modified: {value}",
            "usage_window: {{ from: {value}, to: {value} }}",
            "sources:\n  - resource: synthetic-scope\n    usage_window: {{ from: {value}, to: {value} }}",
        ]
        values = {
            "2027-01-01": False,
            "2027-01-01T12:00:00": False,
            "2027-02-31T12:00:00Z": False,
            "2027-01-01T12:00:00+25:00": False,
            "2027-01-01T12:00:00+00:60": False,
            "2027-01-01T12:00:00Z": True,
            "2027-01-01T12:00:00.123456-05:00": True,
            "2027-01-01T12:00:00+05:30": True,
        }
        for field in fields:
            for value, valid in values.items():
                for quoted in (False, True):
                    with self.subTest(field=field, value=value, quoted=quoted):
                        scalar = json.dumps(value) if quoted else value
                        self.write("concept.md", concept("type: Reference\n" + field.format(value=scalar)))
                        self.assertEqual(valid, "datetime-format" not in self.codes("warn"))
                        self.assertEqual(set(), self.codes("error"))

    def test_staleness_compares_instants_including_exact_boundary(self) -> None:
        # All cases straddle 12:00 UTC, including offsets crossing a calendar day.
        cases = {
            "2026-08-26T07:00:00.000001-05:00": False,
            "2026-08-26T07:00:00-05:00": True,
            "2026-08-26T11:59:59Z": True,
            "2026-08-27T01:00:00+13:00": True,
            "2026-08-27T01:00:01+13:00": False,
            "2026-08-25T23:30:00-13:00": False,
        }
        for value, stale in cases.items():
            for quoted in (False, True):
                with self.subTest(value=value, quoted=quoted):
                    scalar = json.dumps(value) if quoted else value
                    self.write("concept.md", concept(f"type: Reference\nstale_after: {scalar}"))
                    findings, stats = self.validate()
                    self.assertEqual(int(stale), stats["stale"])
                    self.assertEqual(stale, any(i["code"] == "stale" for i in findings.items))

    def test_naive_verification_does_not_elevate_trust(self) -> None:
        self.write("concept.md", concept(
            "type: Reference\nverified: { by: human:reviewer, at: 2026-08-26T12:00:00 }"
        ))
        _, stats = self.validate()
        self.assertEqual({"unverified": 1}, stats["tiers"])

    def test_legacy_stale_date_warns_without_inventing_an_instant(self) -> None:
        self.write("concept.md", concept("type: Reference\nstale_after: 2020-01-01"))
        _, stats = self.validate()
        self.assertIn("datetime-format", self.codes("warn"))
        self.assertEqual(0, stats["stale"])

    def test_log_headings_remain_dates(self) -> None:
        self.write("log.md", "# Log\n\n## 2026-08-26\n\n- Update.\n")
        self.assertEqual(set(), self.codes("error"))
        self.write("log.md", "# Log\n\n## 2026-08-26T12:00:00Z\n\n- Update.\n")
        self.assertIn("log-date", self.codes("error"))

    def run_cli(self, *args):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch("sys.argv", [str(VALIDATOR_PATH), str(self.root), "--json", *args]):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                try:
                    code = VALIDATOR.main()
                except SystemExit as exc:
                    code = exc.code
        return code, stdout.getvalue(), stderr.getvalue()

    def test_cli_clock_overrides_and_bad_usage(self) -> None:
        self.write("concept.md", concept("type: Reference\nstale_after: 2026-08-26T12:00:00Z"))
        for args, stale in [
            (("--now", "2026-08-26T07:00:00-05:00"), 1),
            (("--now", "2026-08-26T11:59:59Z"), 0),
            (("--today", "2026-08-26"), 0),
        ]:
            with self.subTest(args=args):
                code, output, _ = self.run_cli(*args)
                self.assertEqual(0, code)
                self.assertEqual(stale, json.loads(output)["summary"]["stale"])
        for args in [
            ("--now", "2026-08-26"),
            ("--now", "2026-08-26T12:00:00"),
            ("--now", "2026-02-31T12:00:00Z"),
            ("--today", "2026-02-31"),
            ("--now", "2026-08-26T12:00:00Z", "--today", "2026-08-26"),
        ]:
            with self.subTest(args=args):
                self.assertEqual(2, self.run_cli(*args)[0])

    def test_cli_timestamp_warning_is_strict_only_failure(self) -> None:
        self.write("concept.md", concept("type: Reference\nstale_after: 2026-08-26"))
        code, output, _ = self.run_cli("--now", "2026-08-26T12:00:00Z")
        self.assertEqual(0, code)
        self.assertTrue(json.loads(output)["base_conformant"])
        self.assertEqual(1, self.run_cli("--strict")[0])


if __name__ == "__main__":
    unittest.main()
