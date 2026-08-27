from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path, PurePosixPath


SCRIPT_ROOT = Path(__file__).parents[1]
CLI_PATH = SCRIPT_ROOT / "gen-stack.py"
CONTRACT_ROOT = SCRIPT_ROOT / "contracts"
SCHEMA_PATH = CONTRACT_ROOT / "gen-stack-inspection-v1alpha3.schema.json"
EXAMPLE_PATH = CONTRACT_ROOT / "evaluation-context.example.json"
CANDIDATES_EXAMPLE_PATH = CONTRACT_ROOT / "evaluation-candidates.example.json"
CHECK_EXAMPLE_PATH = CONTRACT_ROOT / "mechanical-check.example.json"
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

from gen_stack_profile.frontmatter import replace_relationships
from gen_stack_profile.inspection import (
    MAX_CONCEPT_BYTES,
    SCHEMA_VERSION,
    InspectionFailure,
    InspectionPlane,
    diff_envelope,
)
from gen_stack_profile.relationships import analyze_relationships


def concept(
    concept_type: str,
    title: str,
    *,
    metadata: str = "",
    body: str = "Accepted synthetic meaning for public inspection fixtures.",
) -> str:
    return f"""---
type: {concept_type}
title: {title}
description: A public synthetic {concept_type} used to verify inspection.
status: stable
{metadata}---

# {title}

{body}
"""


def requirement(
    requirement_id: str,
    title: str,
    subject: str,
    *,
    lifecycle: str = "active",
    requirement_type: str = "functional",
    extra: str = "",
) -> str:
    lifecycle_body = (
        "\n## Lifecycle\n\nA synthetic accepted decision retired this obligation.\n"
        if lifecycle == "retired"
        else ""
    )
    return f"""---
type: Requirement
title: {title}
description: A public synthetic Requirement used to verify direct association.
status: stable
requirement_id: {requirement_id}
requirement_type: {requirement_type}
requirement_lifecycle: {lifecycle}
subject: {subject}
{extra}---

# {title}

## Requirement

When synthetic work is requested, the obligated subject shall preserve its accepted boundary.

## Rationale

The fixture needs an observable, non-private obligation.
{lifecycle_body}"""


def evaluation_protocol(
    title: str,
    protocol_id: str,
    role: str,
    target_field: str,
    targets: list[str],
    *,
    lifecycle: str = "active",
) -> str:
    encoded_targets = "\n".join(f"  - {target}" for target in targets)
    return concept(
        "Evaluation Protocol",
        title,
        metadata=f"""protocol_id: {protocol_id}
protocol_lifecycle: {lifecycle}
evaluation_role: {role}
{target_field}:
{encoded_targets}
""",
        body="""## Claim

The realized Surface satisfies the accepted boundary Requirement.

## Assessment

Exercise a rejected install operation.

## Judgment

Pass when the accepted boundary remains unchanged.

## Evidence and lifecycle

Unknown and harness errors remain visible.""",
    )


class SyntheticCorpus:
    def __init__(self, *, include_architecture: bool = True) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repository_root = Path(self.temp.name)
        self.root = self.repository_root / "gen-stack"
        self.root.mkdir()
        implementation = self.repository_root / "src" / "processor.py"
        implementation.parent.mkdir(parents=True)
        implementation.write_text("# Public synthetic implementation fixture.\n", encoding="utf-8")
        self._write_kernel(include_architecture=include_architecture)
        if include_architecture:
            self._write_architecture()
            self._write_requirements()
        self._sync()

    def cleanup(self) -> None:
        self.temp.cleanup()

    def write(self, relative: str, content: str) -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def _write_kernel(self, *, include_architecture: bool) -> None:
        root_links = []
        for filename, concept_type in {
            "system.md": "System",
            "lifecycle.md": "System Lifecycle",
            "ownership.md": "System Ownership",
            "decisions.md": "Architecture Decision Policy",
            "assurance.md": "System Assurance",
        }.items():
            body = "Accepted synthetic governance meaning."
            if filename == "lifecycle.md":
                body += "\n\n[Processor](architecture/structure/containers/api/components/processor.md)"
            self.write(filename, concept(concept_type, concept_type, body=body))
            root_links.append(f"- [{concept_type}]({filename})")
        self.write(
            "evaluations/index.md",
            "# Evaluations\n\n" + ("- [Protocols](protocols/)\n" if include_architecture else "No protocols are admitted.\n"),
        )
        if include_architecture:
            self.write(
                "evaluations/protocols/index.md",
                "# Protocols\n\n- [Requirements](requirements/)\n- [Architecture](architecture/)\n- [Implementation](implementation/)\n",
            )
            self.write(
                "evaluations/protocols/requirements/index.md",
                "# Requirement protocols\n\n- [Preserve install boundary](preserve-install-boundary.md)\n- [Retired install behavior](retired-install-behavior.md)\n",
            )
            self.write(
                "evaluations/protocols/requirements/preserve-install-boundary.md",
                evaluation_protocol(
                    "Preserve install boundary protocol",
                    "SYN-EVAL-0001",
                    "requirement-satisfaction",
                    "requirements",
                    ["SYN-REQ-0001"],
                ),
            )
            self.write(
                "evaluations/protocols/requirements/retired-install-behavior.md",
                evaluation_protocol(
                    "Retired install behavior protocol",
                    "SYN-EVAL-0002",
                    "requirement-satisfaction",
                    "requirements",
                    ["SYN-REQ-0001", "SYN-REQ-0002"],
                    lifecycle="retired",
                ),
            )
            self.write(
                "evaluations/protocols/architecture/index.md",
                "# Architecture protocols\n\n- [Preserve processor boundary](preserve-processor-boundary.md)\n",
            )
            self.write(
                "evaluations/protocols/architecture/preserve-processor-boundary.md",
                evaluation_protocol(
                    "Preserve processor boundary protocol",
                    "SYN-EVAL-0003",
                    "architecture-realization",
                    "architecture_authorities",
                    ["/architecture/structure/containers/api/components/processor.md"],
                ),
            )
            self.write(
                "evaluations/protocols/implementation/index.md",
                "# Implementation protocols\n\n- [Processor module](processor-module.md)\n",
            )
            self.write(
                "evaluations/protocols/implementation/processor-module.md",
                evaluation_protocol(
                    "Processor module protocol",
                    "SYN-EVAL-0004",
                    "implementation-conformance",
                    "implementation_units",
                    ["src/processor.py"],
                ),
            )
        root_links.append("- [Evaluations](evaluations/)")
        if include_architecture:
            root_links.append("- [Architecture](architecture/)")
        self.write(
            "index.md",
            """---
okf_version: "0.2"
---

# Synthetic Gen Stack corpus

This public fixture adopts the
[gen-stack profile](https://example.test/gen-stack) version 0.5.0.

"""
            + "\n".join(root_links)
            + "\n",
        )

    def _write_architecture(self) -> None:
        self.write(
            "architecture/index.md",
            "# Architecture\n\n- [Capabilities](capabilities/)\n- [Features](features/)\n- [Surfaces](surfaces/)\n- [Structure](structure/)\n",
        )
        self.write(
            "architecture/capabilities/index.md",
            "# Capabilities\n\n- [Operate](operate.md)\n",
        )
        self.write(
            "architecture/capabilities/operate.md",
            concept("Capability", "Operate synthetic work"),
        )
        self.write(
            "architecture/features/index.md",
            "# Features\n\n- [Install](install.md)\n",
        )
        self.write(
            "architecture/features/install.md",
            concept(
                "Feature",
                "Install synthetic extension",
                metadata="""relationships:
  contributes-to-capability:
    - /architecture/capabilities/operate.md
  is-available-through-surface:
    - /architecture/surfaces/cli/install.md
  is-realized-by-c4-element:
    - /architecture/structure/containers/api/components/processor.md
""",
            ),
        )
        self.write(
            "architecture/surfaces/index.md",
            "# Surfaces\n\n- [CLI](cli.md)\n",
        )
        self.write(
            "architecture/surfaces/cli.md",
            concept(
                "Surface",
                "Synthetic CLI",
                body="Accepted command-line encounter point.\n\n[Narrow surfaces](cli/)",
            ),
        )
        self.write(
            "architecture/surfaces/cli/index.md",
            "# CLI surfaces\n\n- [Install command](install.md)\n",
        )
        self.write(
            "architecture/surfaces/cli/install.md",
            concept(
                "Surface",
                "Install command",
                metadata="""relationships:
  is-realized-by-c4-element:
    - /architecture/structure/containers/api/components/processor.md
""",
                body="Accepted install interaction.\n\n[Requirements](install/requirements/)",
            ),
        )
        self.write(
            "architecture/structure/index.md",
            "# Structure\n\n- [Systems](systems/)\n- [Containers](containers/)\n- [Views](views/)\n",
        )
        self.write(
            "architecture/structure/systems/index.md",
            "# Systems\n\n- [Extensions](extensions.md)\n",
        )
        self.write(
            "architecture/structure/systems/extensions.md",
            concept("C4 Software System", "Extensions system"),
        )
        self.write(
            "architecture/structure/containers/index.md",
            "# Containers\n\n- [API](api.md)\n",
        )
        self.write(
            "architecture/structure/containers/api.md",
            concept(
                "C4 Container",
                "Extension API",
                metadata="""relationships:
  belongs-to-c4-software-system:
    - /architecture/structure/systems/extensions.md
""",
                body="Accepted runtime boundary.\n\n[Components](api/components/)",
            ),
        )
        self.write(
            "architecture/structure/containers/api/index.md",
            "# API details\n\n- [Components](components/)\n",
        )
        self.write(
            "architecture/structure/containers/api/components/index.md",
            "# Components\n\n- [Processor](processor.md)\n",
        )
        self.write(
            "architecture/structure/containers/api/components/processor.md",
            concept(
                "C4 Component",
                "Install processor",
                body="Accepted cohesive responsibility.\n\n[Requirements](processor/requirements/)",
            ),
        )
        self.write(
            "architecture/structure/views/index.md",
            "# Views\n\n- [Containers](containers.md)\n",
        )
        self.write(
            "architecture/structure/views/containers.md",
            concept(
                "C4 View",
                "Container view",
                metadata="""view_type: container
relationships:
  projects-c4-element:
    - /architecture/structure/containers/api.md
    - /architecture/structure/systems/extensions.md
""",
            ),
        )

    def _write_requirement_collection(
        self,
        subject_file: str,
        requirement_type: str,
        filename: str,
        body: str,
    ) -> None:
        sidecar = subject_file[:-3]
        collection = f"{sidecar}/requirements"
        type_root = f"{collection}/{requirement_type}"
        self.write(
            f"{sidecar}/index.md",
            f"# Subject details\n\n- [Requirements](requirements/)\n",
        )
        self.write(
            f"{collection}/index.md",
            f"# Requirements\n\n- [{requirement_type}]({requirement_type}/)\n",
        )
        existing = self.root / type_root / "index.md"
        links = existing.read_text(encoding="utf-8") if existing.exists() else f"# {requirement_type}\n\n"
        links += f"- [{filename}]({filename})\n"
        self.write(f"{type_root}/index.md", links)
        self.write(f"{type_root}/{filename}", body)

    def _write_requirements(self) -> None:
        surface = "architecture/surfaces/cli/install.md"
        self._write_requirement_collection(
            surface,
            "functional",
            "preserve-boundary.md",
            requirement("SYN-REQ-0001", "Preserve install boundary", f"/{surface}"),
        )
        self._write_requirement_collection(
            surface,
            "functional",
            "retired-behavior.md",
            requirement(
                "SYN-REQ-0002",
                "Retired install behavior",
                f"/{surface}",
                lifecycle="retired",
            ),
        )
        component = "architecture/structure/containers/api/components/processor.md"
        self._write_requirement_collection(
            component,
            "constraint",
            "preserve-component.md",
            requirement(
                "SYN-REQ-0003",
                "Preserve processor boundary",
                f"/{component}",
                requirement_type="constraint",
            ),
        )

    def _sync(self) -> None:
        analysis = analyze_relationships(self.root)
        blocking = [
            item for item in analysis.diagnostics if item.rule != "relationship-projection"
        ]
        if blocking:
            raise AssertionError([(item.rule, str(item.path), item.message) for item in blocking])
        for relative in analysis.projection_paths:
            replace_relationships(
                analysis.concepts[relative].path,
                analysis.expected.get(relative, {}),
            )


class InspectionPlaneTest(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = SyntheticCorpus()
        self.addCleanup(self.fixture.cleanup)
        self.plane = InspectionPlane(self.fixture.repository_root)
        self.assertTrue(self.plane.conforming, self.plane.validation_report)

    def test_status_and_envelope_are_public_deterministic_and_layered(self) -> None:
        first = self.plane.status()
        second = self.plane.status()
        self.assertEqual(SCHEMA_VERSION, first["schema_version"])
        self.assertEqual("conforming", first["discovery"]["state"])
        self.assertEqual("unknown", first["discovery"]["semantic_result"])
        self.assertEqual({"kind": "working-tree"}, first["input"])
        self.assertEqual(first["output_digest"], second["output_digest"])
        self.assertNotIn(str(self.fixture.repository_root), json.dumps(first))

    def test_established_sparse_greenfield_context_is_valid_and_empty_without_gap_claims(self) -> None:
        greenfield = SyntheticCorpus(include_architecture=False)
        self.addCleanup(greenfield.cleanup)
        plane = InspectionPlane(greenfield.repository_root)
        context = plane.evaluation_context()
        self.assertEqual([], context["data"]["surfaces"])
        self.assertEqual([], context["data"]["structure"])
        self.assertEqual({}, context["data"]["requirements"])
        self.assertFalse(
            any(item["rule"] == "missing-requirements" for item in context["diagnostics"])
        )

    def test_list_search_and_show_resolve_concepts_and_requirement_ids(self) -> None:
        surfaces = self.plane.list_concepts("surfaces")["data"]["concepts"]
        self.assertEqual(2, len(surfaces))
        results = self.plane.search("install boundary")["data"]["results"]
        self.assertEqual("SYN-REQ-0001", results[0]["requirement_id"])
        shown = self.plane.show("SYN-REQ-0001")["data"]["result"]
        self.assertEqual("active", shown["requirement_lifecycle"])
        self.assertIn("Requirement", shown["sections"])

        protocol_why = self.plane.why("SYN-EVAL-0001")["data"]
        self.assertEqual("stable-protocol-id", protocol_why["identity"]["kind"])
        self.assertEqual("SYN-EVAL-0001", protocol_why["identity"]["reference"])

    def test_show_requirements_is_direct_only_and_preserves_lifecycle(self) -> None:
        parent = self.plane.show("/architecture/surfaces/cli.md", "requirements")["data"]["result"]
        self.assertEqual([], parent["direct_requirements"])
        self.assertIsNone(parent["inherited_requirements"])
        child = self.plane.show(
            "/architecture/surfaces/cli/install.md", "requirements"
        )["data"]["result"]
        self.assertEqual(
            {"active", "retired"},
            {item["requirement_lifecycle"] for item in child["direct_requirements"]},
        )

    def test_evaluation_context_projects_both_hierarchies_and_requirements(self) -> None:
        context = self.plane.evaluation_context()["data"]
        self.assertEqual("/architecture/surfaces/cli.md", context["surfaces"][0]["ref"])
        install = context["surfaces"][0]["children"][0]
        self.assertEqual(["SYN-REQ-0001", "SYN-REQ-0002"], install["direct_requirements"])
        system = context["structure"][0]
        self.assertEqual("C4 Software System", system["type"])
        self.assertEqual("C4 Container", system["children"][0]["type"])
        self.assertEqual("C4 Component", system["children"][0]["children"][0]["type"])
        self.assertEqual(
            {"SYN-REQ-0001", "SYN-REQ-0002", "SYN-REQ-0003"},
            set(context["requirements"]),
        )
        self.assertTrue(context["cross_view_mappings"])
        self.assertFalse(context["c4_views"][0]["evaluation_subject"])
        protocols = {
            item["protocol_id"]: item
            for item in context["governance"]["evaluation_protocols"]
        }
        self.assertEqual("Evaluation Protocol", protocols["SYN-EVAL-0001"]["type"])
        self.assertEqual(["SYN-REQ-0001"], protocols["SYN-EVAL-0001"]["targets"])
        protocol = self.plane.show("SYN-EVAL-0001")["data"]["result"]
        self.assertEqual("requirement-satisfaction", protocol["evaluation_role"])
        self.assertEqual("not-inferred", context["interpretation"]["requirement_inheritance"])

    def test_scoped_evaluation_context_separates_ancestors_and_explicit_relations(self) -> None:
        context = self.plane.evaluation_context(
            "/architecture/surfaces/cli/install.md"
        )["data"]
        self.assertEqual("scoped", context["scope"]["mode"])
        self.assertEqual(
            ["/architecture/surfaces/cli.md"],
            [item["ref"] for item in context["ancestor_context"]],
        )
        self.assertTrue(
            any(item["type"] == "C4 Component" for item in context["related_subjects"])
        )

    def test_evaluation_candidates_are_policy_neutral_and_match_explicit_protocols(self) -> None:
        projection = self.plane.evaluation_candidates()
        repeated = self.plane.evaluation_candidates()
        self.assertEqual(projection["output_digest"], repeated["output_digest"])
        candidates = projection["data"]["candidates"]
        by_pair = {
            (item["role"], item["protocol_target"]): item for item in candidates
        }

        requirement = by_pair[("requirement-satisfaction", "SYN-REQ-0001")]
        self.assertEqual(
            "/architecture/surfaces/cli/install.md",
            requirement["subject"]["ref"],
        )
        self.assertEqual(
            ["SYN-EVAL-0001"],
            [
                item["protocol_id"]
                for item in requirement["matching_protocols"]["active"]
            ],
        )
        self.assertEqual(
            ["SYN-EVAL-0002"],
            [
                item["protocol_id"]
                for item in requirement["matching_protocols"]["retired"]
            ],
        )
        self.assertIn(
            ("requirement-satisfaction", "SYN-REQ-0003"),
            by_pair,
        )
        self.assertEqual(
            [],
            by_pair[("requirement-satisfaction", "SYN-REQ-0003")][
                "matching_protocols"
            ]["active"],
        )

        architecture = by_pair[
            (
                "architecture-realization",
                "/architecture/structure/containers/api/components/processor.md",
            )
        ]
        self.assertEqual(
            ["SYN-EVAL-0003"],
            [
                item["protocol_id"]
                for item in architecture["matching_protocols"]["active"]
            ],
        )
        implementation = by_pair[("implementation-conformance", "src/processor.py")]
        self.assertEqual(
            "active-protocol-declared-implementation-unit",
            implementation["basis"],
        )

        exclusions = projection["data"]["excluded"]
        self.assertTrue(
            any(
                item["reason"] == "retired-requirement"
                and item["target"]["requirement_id"] == "SYN-REQ-0002"
                for item in exclusions
            )
        )
        self.assertTrue(
            any(item["reason"] == "c4-view-is-projection" for item in exclusions)
        )
        interpretation = projection["data"]["interpretation"]
        self.assertEqual("not-assessed", interpretation["selection_claim"])
        self.assertEqual("not-assessed", interpretation["coverage_claim"])
        self.assertTrue(
            any(item["claim"] == "protocol-adequacy" for item in projection["unknowns"])
        )

    def test_scoped_evaluation_candidates_exclude_ancestors_and_implementation_discovery(self) -> None:
        projection = self.plane.evaluation_candidates(
            "/architecture/surfaces/cli/install.md"
        )["data"]
        candidates = projection["candidates"]
        targets = {
            (item["role"], item["protocol_target"]): item for item in candidates
        }
        self.assertNotIn(
            ("architecture-realization", "/architecture/surfaces/cli.md"),
            targets,
        )
        self.assertIn(
            (
                "architecture-realization",
                "/architecture/structure/containers/api/components/processor.md",
            ),
            targets,
        )
        self.assertFalse(
            any(item["role"] == "implementation-conformance" for item in candidates)
        )
        self.assertEqual(
            ["/architecture/surfaces/cli.md"],
            [item["ref"] for item in projection["ancestor_context"]],
        )
        self.assertEqual(
            "primary",
            targets[
                ("architecture-realization", "/architecture/surfaces/cli/install.md")
            ]["scope_relation"],
        )
        self.assertEqual(
            "cross-view",
            targets[
                (
                    "architecture-realization",
                    "/architecture/structure/containers/api/components/processor.md",
                )
            ]["scope_relation"],
        )

    def test_c4_view_is_not_an_eligible_candidate_scope(self) -> None:
        with self.assertRaises(InspectionFailure) as raised:
            self.plane.evaluation_candidates(
                "/architecture/structure/views/containers.md"
            )
        self.assertEqual("ineligible-evaluation-subject", raised.exception.code)

    def test_ordinary_markdown_link_does_not_become_graph_relation(self) -> None:
        with self.assertRaises(InspectionFailure) as raised:
            self.plane.path(
                "/lifecycle.md",
                "/architecture/structure/containers/api/components/processor.md",
            )
        self.assertEqual("path-not-found", raised.exception.code)

    def test_path_why_and_affected_concepts_preserve_provenance_and_limits(self) -> None:
        path = self.plane.path(
            "/architecture/features/install.md",
            "/architecture/structure/containers/api/components/processor.md",
        )["data"]
        self.assertEqual(1, len(path["hops"]))
        edge_ref = path["hops"][0]["edge"]["ref"]
        why = self.plane.why(edge_ref)["data"]
        self.assertEqual("relationship", why["kind"])
        self.assertEqual("asserted", why["explanation"]["derivation"])
        affected = self.plane.affected_concepts("/architecture/features/install.md")["data"]
        self.assertIn("not implementation", affected["interpretation"])

    def test_snapshot_and_diff_report_concept_change_without_peer_impact_claims(self) -> None:
        before = self.plane.snapshot()
        requirement_path = self.fixture.root / "architecture/surfaces/cli/install/requirements/functional/preserve-boundary.md"
        requirement_path.write_text(
            requirement_path.read_text(encoding="utf-8").replace(
                "preserve its accepted boundary", "preserve its revised accepted boundary"
            ),
            encoding="utf-8",
        )
        after_plane = InspectionPlane(self.fixture.repository_root)
        after = after_plane.snapshot()
        diff = diff_envelope(before, after)
        changed = diff["data"]["concepts"]["changed"]
        self.assertEqual(1, len(changed))
        self.assertIn("body", changed[0]["changed_fields"])
        self.assertIn("implementation-or-evaluation-impact", json.dumps(diff["unknowns"]))

    def test_cli_emits_json_contract_and_human_views(self) -> None:
        json_run = subprocess.run(
            [
                sys.executable,
                str(CLI_PATH.resolve()),
                "-C",
                str(self.fixture.repository_root),
                "--json",
                "evaluation-context",
                "/architecture/surfaces/cli/install.md",
            ],
            cwd=self.fixture.repository_root,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, json_run.returncode, json_run.stdout + json_run.stderr)
        payload = json.loads(json_run.stdout)
        self.assertEqual(SCHEMA_VERSION, payload["schema_version"])
        candidates_run = subprocess.run(
            [
                sys.executable,
                str(CLI_PATH.resolve()),
                "-C",
                str(self.fixture.repository_root),
                "--json",
                "evaluation-candidates",
                "/architecture/surfaces/cli/install.md",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            0,
            candidates_run.returncode,
            candidates_run.stdout + candidates_run.stderr,
        )
        candidates_payload = json.loads(candidates_run.stdout)
        self.assertEqual("evaluation-candidates", candidates_payload["operation"])
        self.assertEqual(SCHEMA_VERSION, candidates_payload["schema_version"])
        human_run = subprocess.run(
            [
                sys.executable,
                str(CLI_PATH),
                "-C",
                str(self.fixture.repository_root),
                "show",
                "SYN-REQ-0001",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, human_run.returncode, human_run.stdout + human_run.stderr)
        self.assertIn("Preserve install boundary [Requirement]", human_run.stdout)

        trailing_option = subprocess.run(
            [
                sys.executable,
                str(CLI_PATH),
                "status",
                "--json",
                "-C",
                str(self.fixture.repository_root),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, trailing_option.returncode, trailing_option.stderr)
        self.assertEqual("status", json.loads(trailing_option.stdout)["operation"])


class InspectionFailClosedTest(unittest.TestCase):
    def test_absent_corpus_reports_state_and_refuses_queries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            plane = InspectionPlane(Path(temporary))
            self.assertEqual("absent", plane.status()["data"]["state"])
            with self.assertRaises(InspectionFailure) as raised:
                plane.list_concepts("concepts")
            self.assertEqual("operation-ineligible", raised.exception.code)

    def test_oversized_source_is_rejected_before_profile_parsing(self) -> None:
        fixture = SyntheticCorpus(include_architecture=False)
        self.addCleanup(fixture.cleanup)
        (fixture.root / "system.md").write_text(
            "x" * (MAX_CONCEPT_BYTES + 1), encoding="utf-8"
        )
        plane = InspectionPlane(fixture.repository_root)
        self.assertFalse(plane.conforming)
        self.assertEqual(
            "inspection-resource-limit", plane.validation_report["errors"][0]["rule"]
        )

    def test_internal_symlink_is_rejected_without_reading_its_target(self) -> None:
        fixture = SyntheticCorpus(include_architecture=False)
        self.addCleanup(fixture.cleanup)
        external = fixture.repository_root / "external-public-fixture.md"
        external.write_text("Synthetic external content.", encoding="utf-8")
        (fixture.root / "linked.md").symlink_to(external)
        plane = InspectionPlane(fixture.repository_root)
        self.assertFalse(plane.conforming)
        self.assertEqual(
            "inspection-symlink", plane.validation_report["errors"][0]["rule"]
        )

    def test_corpus_change_invalidates_an_existing_inspection_snapshot(self) -> None:
        fixture = SyntheticCorpus(include_architecture=False)
        self.addCleanup(fixture.cleanup)
        plane = InspectionPlane(fixture.repository_root)
        assurance = fixture.root / "assurance.md"
        assurance.write_text(
            assurance.read_text(encoding="utf-8") + "\nChanged after indexing.\n",
            encoding="utf-8",
        )
        with self.assertRaises(InspectionFailure) as raised:
            plane.status()
        self.assertEqual("corpus-changed-during-inspection", raised.exception.code)


@unittest.skipUnless(shutil.which("git") and shutil.which("axm"), "Git and AXM are required")
class MechanicalCheckIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = SyntheticCorpus()
        self.addCleanup(self.fixture.cleanup)
        commands = [
            ["git", "init", "-q"],
            ["git", "config", "user.name", "Synthetic Fixture"],
            ["git", "config", "user.email", "fixture@example.invalid"],
            ["git", "add", "."],
            ["git", "commit", "-qm", "synthetic corpus"],
        ]
        for command in commands:
            subprocess.run(
                command,
                cwd=self.fixture.repository_root,
                check=True,
                capture_output=True,
                text=True,
            )

    def run_check(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(CLI_PATH.resolve()),
                "-C",
                str(self.fixture.repository_root),
                "--json",
                "check",
                *arguments,
            ],
            cwd=self.fixture.repository_root,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_working_tree_check_reports_independent_layers(self) -> None:
        completed = self.run_check()
        self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertEqual("check", payload["operation"])
        self.assertEqual("working-tree", payload["input"]["kind"])
        self.assertEqual("pass", payload["data"]["layers"]["okf"]["result"])
        self.assertEqual(
            "pass", payload["data"]["layers"]["structural_profile"]["result"]
        )
        self.assertEqual(
            "pass", payload["data"]["layers"]["relationship_projection"]["result"]
        )
        self.assertEqual(
            "unknown", payload["data"]["layers"]["semantic_review"]["result"]
        )
        self.assertFalse(
            any(item["claim"] == "okf-conformance" for item in payload["unknowns"])
        )

    def test_git_index_and_revision_are_exact_and_independent(self) -> None:
        feature = self.fixture.root / "architecture/features/install.md"
        original = feature.read_text(encoding="utf-8")
        feature.write_text(
            original.replace(
                "/architecture/capabilities/operate.md",
                "/architecture/capabilities/alternate.md",
            ),
            encoding="utf-8",
        )
        subprocess.run(
            ["git", "add", "gen-stack/architecture/features/install.md"],
            cwd=self.fixture.repository_root,
            check=True,
        )
        feature.write_text(original, encoding="utf-8")

        index_check = self.run_check("--view", "git-index")
        self.assertEqual(1, index_check.returncode, index_check.stdout + index_check.stderr)
        index_payload = json.loads(index_check.stdout)
        self.assertEqual("git-index", index_payload["input"]["kind"])
        self.assertRegex(index_payload["input"]["tree"], r"^[0-9a-f]{40,64}$")
        self.assertEqual(
            "fail",
            index_payload["data"]["layers"]["structural_profile"]["result"],
        )

        working_check = self.run_check("--view", "working-tree")
        self.assertEqual(
            0, working_check.returncode, working_check.stdout + working_check.stderr
        )

        head_check = self.run_check("--revision", "HEAD")
        self.assertEqual(0, head_check.returncode, head_check.stdout + head_check.stderr)
        head_payload = json.loads(head_check.stdout)
        self.assertEqual("git-tree", head_payload["input"]["kind"])
        self.assertEqual("HEAD", head_payload["input"]["revision"])

    def test_staged_rename_is_validated_as_a_whole_tree(self) -> None:
        subprocess.run(
            ["git", "mv", "gen-stack/system.md", "gen-stack/system-renamed.md"],
            cwd=self.fixture.repository_root,
            check=True,
        )
        completed = self.run_check("--view", "git-index")
        self.assertEqual(1, completed.returncode, completed.stdout + completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertTrue(
            any(
                item["rule"] == "required-root-concept"
                and item["path"] == "gen-stack/system.md"
                for item in payload["diagnostics"]
            )
        )

    def test_relationship_projection_is_a_separate_failing_layer(self) -> None:
        capability = PurePosixPath("architecture/capabilities/operate.md")
        analysis = analyze_relationships(self.fixture.root)
        replace_relationships(analysis.concepts[capability].path, {})
        subprocess.run(
            ["git", "add", "gen-stack/architecture/capabilities/operate.md"],
            cwd=self.fixture.repository_root,
            check=True,
        )
        completed = self.run_check("--view", "git-index")
        self.assertEqual(1, completed.returncode, completed.stdout + completed.stderr)
        layers = json.loads(completed.stdout)["data"]["layers"]
        self.assertEqual("pass", layers["structural_profile"]["result"])
        self.assertEqual("fail", layers["relationship_projection"]["result"])

    def test_missing_okf_validator_is_an_environment_error(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                str(CLI_PATH.resolve()),
                "-C",
                str(self.fixture.repository_root),
                "--json",
                "check",
            ],
            cwd=self.fixture.repository_root,
            env={"PATH": ""},
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(2, completed.returncode, completed.stdout + completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertEqual("okf-validator-unavailable", payload["diagnostics"][0]["rule"])
        self.assertEqual("working-tree", payload["input"]["kind"])
        self.assertEqual("mechanical-check", payload["unknowns"][0]["claim"])

    def test_unmerged_index_is_an_environment_error(self) -> None:
        blob = subprocess.run(
            ["git", "rev-parse", "HEAD:gen-stack/system.md"],
            cwd=self.fixture.repository_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        path = "gen-stack/system.md"
        zero = "0" * 40
        index_info = "".join(
            [
                f"0 {zero}\t{path}\n",
                f"100644 {blob} 1\t{path}\n",
                f"100644 {blob} 2\t{path}\n",
                f"100644 {blob} 3\t{path}\n",
            ]
        )
        subprocess.run(
            ["git", "update-index", "--index-info"],
            cwd=self.fixture.repository_root,
            input=index_info,
            check=True,
            text=True,
        )
        completed = self.run_check("--view", "git-index")
        self.assertEqual(2, completed.returncode, completed.stdout + completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertEqual("git-index-unmerged", payload["diagnostics"][0]["rule"])

    def test_status_is_observational_unless_conformance_is_required(self) -> None:
        empty = tempfile.TemporaryDirectory()
        self.addCleanup(empty.cleanup)
        base = [
            sys.executable,
            str(CLI_PATH),
            "-C",
            empty.name,
            "--json",
            "status",
        ]
        observational = subprocess.run(base, check=False, capture_output=True, text=True)
        required = subprocess.run(
            [*base, "--require", "conforming"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, observational.returncode)
        self.assertEqual(1, required.returncode)


class InspectionContractTest(unittest.TestCase):
    def test_schema_and_public_example_are_parseable_and_version_aligned(self) -> None:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        example = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
        candidates_example = json.loads(
            CANDIDATES_EXAMPLE_PATH.read_text(encoding="utf-8")
        )
        check_example = json.loads(CHECK_EXAMPLE_PATH.read_text(encoding="utf-8"))
        self.assertEqual("https://json-schema.org/draft/2020-12/schema", schema["$schema"])
        self.assertEqual(SCHEMA_VERSION, schema["properties"]["schema_version"]["const"])
        self.assertEqual(SCHEMA_VERSION, example["schema_version"])
        self.assertEqual(SCHEMA_VERSION, candidates_example["schema_version"])
        self.assertEqual(SCHEMA_VERSION, check_example["schema_version"])
        self.assertEqual("evaluation-context", example["operation"])
        self.assertEqual("evaluation-candidates", candidates_example["operation"])
        self.assertEqual("check", check_example["operation"])
        self.assertEqual("git-index", check_example["input"]["kind"])
        self.assertEqual("direct-only", example["data"]["interpretation"]["requirement_association"])
        self.assertNotIn(Path.home().as_posix(), json.dumps(example))
        self.assertNotIn(Path.home().as_posix(), json.dumps(candidates_example))
        self.assertNotIn(Path.home().as_posix(), json.dumps(check_example))
        try:
            import jsonschema
        except ImportError:
            return
        jsonschema.Draft202012Validator.check_schema(schema)
        jsonschema.validate(example, schema)
        jsonschema.validate(candidates_example, schema)
        jsonschema.validate(check_example, schema)

    def test_documented_cli_entrypoint_has_help(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(CLI_PATH), "--help"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, completed.returncode, completed.stderr)
        self.assertIn("usage:", completed.stdout)
        self.assertIn("evaluation-candidates", completed.stdout)
        self.assertIn("check", completed.stdout)

    def test_invalid_diff_input_still_emits_the_machine_envelope(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            invalid = Path(temporary) / "invalid.json"
            invalid.write_text("{}\n", encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CLI_PATH),
                    "--json",
                    "diff",
                    str(invalid),
                    str(invalid),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(1, completed.returncode)
            payload = json.loads(completed.stdout)
            self.assertEqual("diff", payload["operation"])
            self.assertEqual("snapshot-contract", payload["diagnostics"][0]["rule"])


if __name__ == "__main__":
    unittest.main()
