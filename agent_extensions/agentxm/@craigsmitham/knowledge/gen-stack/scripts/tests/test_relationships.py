from __future__ import annotations

import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS_ROOT = Path(__file__).parents[1]
PACKAGE_ROOT = Path(__file__).parents[2]
BUNDLE_SRC = PACKAGE_ROOT / "src"
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

from gen_stack_profile.corpus import parse_frontmatter
from gen_stack_profile.frontmatter import replace_relationships
from gen_stack_profile.profile import (
    PEER_OWNED_RELATIONSHIP_IDS,
    RELATIONSHIP_SPECS,
    ROLE_TO_SPEC,
)
from gen_stack_profile.relationships import analyze_relationships


def document(
    concept_type: str,
    title: str,
    extra: str = "",
) -> str:
    return f"""---
type: {concept_type}
title: {title}
description: A synthetic public fixture.
status: stable
{extra}---

# {title}

Synthetic fixture content.
"""


class RelationshipRegistryTest(unittest.TestCase):
    def test_every_glossary_relationship_has_exactly_one_representation_owner(self) -> None:
        glossary = (BUNDLE_SRC / "glossary.md").read_text(encoding="utf-8")
        glossary_ids = set(
            re.findall(r'<a id="relationship-([a-z0-9-]+)"></a>', glossary)
        )
        governed_ids = {spec.identifier for spec in RELATIONSHIP_SPECS}
        self.assertTrue(glossary_ids)
        self.assertFalse(governed_ids & PEER_OWNED_RELATIONSHIP_IDS)
        self.assertEqual(glossary_ids, governed_ids | PEER_OWNED_RELATIONSHIP_IDS)

    def test_profile_enumerates_every_relationship_and_executable_role(self) -> None:
        profile = (
            BUNDLE_SRC / "profile" / "gen-stack-application-profile.md"
        ).read_text(encoding="utf-8")
        for spec in RELATIONSHIP_SPECS:
            self.assertEqual(
                1,
                profile.count(f"#relationship-{spec.identifier})"),
                spec.identifier,
            )
            if spec.materialize_forward:
                self.assertIn(f"`{spec.forward_role}`", profile)
            if spec.materialize_inverse:
                self.assertIn(f"`{spec.inverse_role}`", profile)
        for identifier in PEER_OWNED_RELATIONSHIP_IDS:
            self.assertEqual(
                1,
                profile.count(f"#relationship-{identifier})"),
                identifier,
            )

    def test_roles_are_unique_readable_kebab_case_phrases(self) -> None:
        roles = [
            role
            for spec in RELATIONSHIP_SPECS
            for role in (spec.forward_role, spec.inverse_role)
        ]
        self.assertEqual(len(roles), len(set(roles)))
        self.assertEqual(set(roles), set(ROLE_TO_SPEC))
        for role in roles:
            self.assertRegex(role, r"^[a-z]+(?:-[a-z0-9]+)+$")


class RelationshipAnalysisTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repository_root = Path(self.temp.name)
        self.root = self.repository_root / "gen-stack"
        self.root.mkdir()
        (self.root / "index.md").write_text(
            """---
okf_version: "0.2"
---

# Synthetic Gen Stack corpus

This corpus adopts the
            [gen-stack profile](https://example.test/profile) version 0.5.0.
""",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write(self, relative: str, content: str) -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def sync(self) -> None:
        analysis = analyze_relationships(self.root)
        blocking = [
            item for item in analysis.diagnostics if item.rule != "relationship-projection"
        ]
        self.assertEqual([], blocking)
        for relative in analysis.projection_paths:
            replace_relationships(
                analysis.concepts[relative].path,
                analysis.expected[relative],
            )

    def test_forward_assertion_materializes_both_endpoint_views_idempotently(self) -> None:
        offering = self.write(
            "intent/offerings/support.md",
            document(
                "Offering",
                "Support",
                "relationships:\n"
                "  depends-on-capability:\n"
                "    - /architecture/capabilities/respond.md\n",
            ),
        )
        capability = self.write(
            "architecture/capabilities/respond.md",
            document("Capability", "Respond"),
        )

        before = analyze_relationships(self.root)
        self.assertEqual(
            [Path("architecture/capabilities/respond.md").as_posix()],
            [path.as_posix() for path in before.projection_paths],
        )
        self.sync()

        after = analyze_relationships(self.root)
        self.assertEqual([], after.diagnostics)
        self.assertFalse(
            replace_relationships(
                offering,
                after.expected[next(path for path in after.expected if path.as_posix() == "intent/offerings/support.md")],
            )
        )
        capability_meta, _ = parse_frontmatter(capability)
        self.assertEqual(
            ["/intent/offerings/support.md"],
            capability_meta["relationships"]["supports-offering"],
        )

    def test_existing_requirement_fields_remain_assertions_and_only_project_reciprocals(self) -> None:
        source = self.write(
            "intent/use-cases/install.md",
            document("Use Case", "Install"),
        )
        subject = self.write("system.md", document("System", "System"))
        parent = self.write(
            "system/requirements/functional/parent.md",
            document(
                "Requirement",
                "Parent",
                "requirement_id: SYN-REQ-0001\n"
                "requirement_type: functional\n"
                "requirement_lifecycle: active\n"
                "subject: /system.md\n",
            ),
        )
        child = self.write(
            "system/requirements/functional/child.md",
            document(
                "Requirement",
                "Child",
                "requirement_id: SYN-REQ-0002\n"
                "requirement_type: functional\n"
                "requirement_lifecycle: active\n"
                "subject: /system.md\n"
                "requirement_sources:\n"
                "  - /intent/use-cases/install.md\n"
                "derived_from:\n"
                "  - SYN-REQ-0001\n",
            ),
        )

        self.sync()

        source_meta, _ = parse_frontmatter(source)
        subject_meta, _ = parse_frontmatter(subject)
        parent_meta, _ = parse_frontmatter(parent)
        child_meta, _ = parse_frontmatter(child)
        self.assertEqual(
            ["/system/requirements/functional/child.md"],
            source_meta["relationships"]["is-source-of-requirement"],
        )
        self.assertEqual(
            [
                "/system/requirements/functional/child.md",
                "/system/requirements/functional/parent.md",
            ],
            subject_meta["relationships"]["is-subject-of-requirement"],
        )
        self.assertEqual(
            ["/system/requirements/functional/child.md"],
            parent_meta["relationships"]["is-parent-of-requirement"],
        )
        self.assertNotIn("relationships", child_meta)

    def test_requirement_supersession_projects_lineage_from_successor(self) -> None:
        self.write("system.md", document("System", "System"))
        predecessor = self.write(
            "system/requirements/functional/predecessor.md",
            document(
                "Requirement",
                "Predecessor",
                "requirement_id: SYN-REQ-0010\n"
                "requirement_type: functional\n"
                "requirement_lifecycle: retired\n"
                "subject: /system.md\n",
            ),
        )
        successor = self.write(
            "system/requirements/functional/successor.md",
            document(
                "Requirement",
                "Successor",
                "requirement_id: SYN-REQ-0011\n"
                "requirement_type: functional\n"
                "requirement_lifecycle: active\n"
                "subject: /system.md\n"
                "supersedes:\n"
                "  - SYN-REQ-0010\n",
            ),
        )

        self.sync()

        predecessor_meta, _ = parse_frontmatter(predecessor)
        successor_meta, _ = parse_frontmatter(successor)
        self.assertEqual(
            ["/system/requirements/functional/successor.md"],
            predecessor_meta["relationships"]["is-superseded-by-requirement"],
        )
        self.assertNotIn("relationships", successor_meta)
        self.assertEqual(["SYN-REQ-0010"], successor_meta["supersedes"])

    def test_requirement_supersession_requires_retired_predecessor(self) -> None:
        self.write("system.md", document("System", "System"))
        self.write(
            "system/requirements/functional/predecessor.md",
            document(
                "Requirement",
                "Predecessor",
                "requirement_id: SYN-REQ-0020\n"
                "requirement_type: functional\n"
                "requirement_lifecycle: active\n"
                "subject: /system.md\n",
            ),
        )
        self.write(
            "system/requirements/functional/successor.md",
            document(
                "Requirement",
                "Successor",
                "requirement_id: SYN-REQ-0021\n"
                "requirement_type: functional\n"
                "requirement_lifecycle: active\n"
                "subject: /system.md\n"
                "supersedes:\n"
                "  - SYN-REQ-0020\n",
            ),
        )

        rules = {item.rule for item in analyze_relationships(self.root).diagnostics}
        self.assertIn("requirement-supersession-lifecycle", rules)

    def test_requirement_supersession_rejects_unknown_predecessor(self) -> None:
        self.write("system.md", document("System", "System"))
        self.write(
            "system/requirements/functional/successor.md",
            document(
                "Requirement",
                "Successor",
                "requirement_id: SYN-REQ-0031\n"
                "requirement_type: functional\n"
                "requirement_lifecycle: active\n"
                "subject: /system.md\n"
                "supersedes:\n"
                "  - SYN-REQ-DOES-NOT-EXIST\n",
            ),
        )

        rules = {item.rule for item in analyze_relationships(self.root).diagnostics}
        self.assertIn("requirement-supersession", rules)

    def test_requirement_supersession_rejects_cycles(self) -> None:
        self.write("system.md", document("System", "System"))
        self.write(
            "system/requirements/functional/first.md",
            document(
                "Requirement",
                "First",
                "requirement_id: SYN-REQ-0040\n"
                "requirement_type: functional\n"
                "requirement_lifecycle: retired\n"
                "subject: /system.md\n"
                "supersedes:\n"
                "  - SYN-REQ-0041\n",
            ),
        )
        self.write(
            "system/requirements/functional/second.md",
            document(
                "Requirement",
                "Second",
                "requirement_id: SYN-REQ-0041\n"
                "requirement_type: functional\n"
                "requirement_lifecycle: retired\n"
                "subject: /system.md\n"
                "supersedes:\n"
                "  - SYN-REQ-0040\n",
            ),
        )

        rules = {item.rule for item in analyze_relationships(self.root).diagnostics}
        self.assertIn("requirement-supersession-cycle", rules)

    def test_path_assertions_materialize_surface_and_component_containment(self) -> None:
        surface = self.write(
            "architecture/surfaces/cli.md",
            document("Surface", "CLI"),
        )
        child_surface = self.write(
            "architecture/surfaces/cli/install.md",
            document("Surface", "Install command"),
        )
        container = self.write(
            "architecture/structure/containers/api.md",
            document(
                "C4 Container",
                "API",
                "relationships:\n"
                "  belongs-to-c4-software-system:\n"
                "    - /architecture/structure/systems/service.md\n",
            ),
        )
        self.write(
            "architecture/structure/systems/service.md",
            document("C4 Software System", "Service"),
        )
        component = self.write(
            "architecture/structure/containers/api/components/router.md",
            document("C4 Component", "Router"),
        )

        self.sync()

        surface_meta, _ = parse_frontmatter(surface)
        child_meta, _ = parse_frontmatter(child_surface)
        container_meta, _ = parse_frontmatter(container)
        component_meta, _ = parse_frontmatter(component)
        self.assertEqual(
            ["/architecture/surfaces/cli/install.md"],
            surface_meta["relationships"]["contains-surface"],
        )
        self.assertEqual(
            ["/architecture/surfaces/cli.md"],
            child_meta["relationships"]["is-contained-by-surface"],
        )
        self.assertEqual(
            ["/architecture/structure/containers/api/components/router.md"],
            container_meta["relationships"]["contains-c4-component"],
        )
        self.assertEqual(
            ["/architecture/structure/containers/api.md"],
            component_meta["relationships"]["belongs-to-c4-container"],
        )

    def test_invalid_role_domain_target_and_cardinality_are_reported(self) -> None:
        self.write(
            "architecture/domains/context-maps/map.md",
            document("Context Map", "Map"),
        )
        self.write(
            "architecture/capabilities/respond.md",
            document(
                "Capability",
                "Respond",
                "relationships:\n"
                "  unknown-relation:\n"
                "    - /missing.md\n"
                "  depends-on-capability:\n"
                "    - /missing.md\n",
            ),
        )
        rules = {item.rule for item in analyze_relationships(self.root).diagnostics}
        self.assertIn("relationship-role", rules)
        self.assertIn("relationship-role-type", rules)
        self.assertIn("relationship-cardinality", rules)

    def test_aliases_and_top_level_roles_are_rejected(self) -> None:
        self.write(
            "intent/offerings/support.md",
            document(
                "Offering",
                "Support",
                "relations: {}\n"
                "depends-on-capability:\n"
                "  - /architecture/capabilities/respond.md\n",
            ),
        )
        diagnostics = analyze_relationships(self.root).diagnostics
        messages = [
            item.message
            for item in diagnostics
            if item.rule == "relationship-frontmatter"
        ]
        self.assertTrue(any("relations" in message for message in messages))
        self.assertTrue(any("depends-on-capability" in message for message in messages))

    def test_stale_or_contradictory_reciprocal_is_rejected(self) -> None:
        self.write(
            "intent/offerings/support.md",
            document(
                "Offering",
                "Support",
                "relationships:\n"
                "  depends-on-capability:\n"
                "    - /architecture/capabilities/respond.md\n",
            ),
        )
        self.write(
            "architecture/capabilities/respond.md",
            document(
                "Capability",
                "Respond",
                "relationships:\n"
                "  supports-offering:\n"
                "    - /intent/offerings/other.md\n",
            ),
        )
        diagnostics = analyze_relationships(self.root).diagnostics
        rules = {item.rule for item in diagnostics}
        self.assertIn("relationship-target-resolves", rules)
        self.assertIn("relationship-projection", rules)

    def test_external_normative_reference_is_allowed_without_reciprocal(self) -> None:
        requirement = self.write(
            "system/requirements/constraint/reference.md",
            document(
                "Requirement",
                "Reference",
                "requirement_id: SYN-REQ-0003\n"
                "requirement_type: constraint\n"
                "requirement_lifecycle: active\n"
                "subject: /system.md\n"
                "relationships:\n"
                "  incorporates-normative-reference:\n"
                "    - https://example.test/standard\n",
            ),
        )
        self.write("system.md", document("System", "System"))
        self.sync()
        meta, _ = parse_frontmatter(requirement)
        self.assertEqual(
            ["https://example.test/standard"],
            meta["relationships"]["incorporates-normative-reference"],
        )

    def test_round_trip_preserves_unrelated_frontmatter_and_comments(self) -> None:
        path = self.write(
            "architecture/capabilities/respond.md",
            """---
type: Capability
title: Respond
description: A synthetic public fixture.
status: stable
# Preserve this producer note.
custom:
  nested: true
relationships:
  supports-offering:
    - /intent/offerings/old.md
# Keep this provenance note with sources.
sources:
  - id: synthetic
    resource: https://example.test/source
---

# Respond
""",
        )
        changed = replace_relationships(
            path,
            {"supports-offering": ["/intent/offerings/new.md"]},
        )
        text = path.read_text(encoding="utf-8")
        metadata, body = parse_frontmatter(path)
        self.assertTrue(changed)
        self.assertIn("# Preserve this producer note.", text)
        self.assertIn("# Keep this provenance note with sources.\nsources:", text)
        self.assertEqual({"nested": True}, metadata["custom"])
        self.assertEqual("synthetic", metadata["sources"][0]["id"])
        self.assertEqual("\n# Respond\n", body)

    def test_cli_check_write_and_check_converge(self) -> None:
        sentinel = self.repository_root / "README.md"
        sentinel.write_text("Repository-native content.\n", encoding="utf-8")
        self.write(
            "intent/offerings/support.md",
            document(
                "Offering",
                "Support",
                "relationships:\n"
                "  depends-on-capability:\n"
                "    - /architecture/capabilities/respond.md\n",
            ),
        )
        self.write(
            "architecture/capabilities/respond.md",
            document("Capability", "Respond"),
        )
        script = SCRIPTS_ROOT / "sync-gen-stack-relationships.py"
        first = subprocess.run(
            [sys.executable, str(script), str(self.repository_root), "--check"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(1, first.returncode)
        self.assertIn("gen-stack/architecture/capabilities/respond.md", first.stdout)
        write = subprocess.run(
            [sys.executable, str(script), str(self.repository_root)],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, write.returncode, write.stdout + write.stderr)
        self.assertEqual("Repository-native content.\n", sentinel.read_text(encoding="utf-8"))
        second = subprocess.run(
            [sys.executable, str(script), str(self.repository_root), "--check"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, second.returncode, second.stdout + second.stderr)

    def test_cli_defaults_to_current_repository_root(self) -> None:
        script = SCRIPTS_ROOT / "sync-gen-stack-relationships.py"
        completed = subprocess.run(
            [sys.executable, str(script), "--check"],
            cwd=self.repository_root,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr)

    def test_cli_refuses_a_candidate_without_profile_adoption(self) -> None:
        (self.root / "index.md").write_text(
            '---\nokf_version: "0.2"\n---\n\n# Ordinary bundle\n',
            encoding="utf-8",
        )
        script = SCRIPTS_ROOT / "sync-gen-stack-relationships.py"
        completed = subprocess.run(
            [sys.executable, str(script), str(self.repository_root), "--check", "--json"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(2, completed.returncode)
        self.assertIn('"rule": "profile-adoption"', completed.stdout)


if __name__ == "__main__":
    unittest.main()
