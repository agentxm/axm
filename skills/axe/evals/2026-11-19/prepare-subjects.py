"""Prepare one local Fieldwork case. Run from the AXM checkout with an unused destination."""

import json
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile


root = Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=False)
project = root / "fieldwork"
evidence = root / "evidence"
evidence.mkdir()


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n")


def write_json(path, value):
    write(path, json.dumps(value, indent=2))


# Tooling for the evaluator lives outside the repository under review.
for name in ["axe", "axm"]:
    shutil.copytree(Path("skills") / name / "src", root / ".agents/skills" / name)
shutil.copytree(
    "knowledge/agent-extension-engineering",
    root / "knowledge/agent-extension-engineering",
)
write_json(
    root / "axm.json",
    {
        "owner": "@agentxm",
        "agents": ["codex"],
        "knowledge": {"agent-extension-engineering": "workspace"},
    },
)
write(
    root / "AGENTS.md",
    "Fieldwork is the repository under fieldwork/. Its supplied host and consumer observations are under evidence/. The outer workspace provides the engineering tools.",
)
write(
    project / "CONTRIBUTING.md",
    "New contributors use Codex and the release pack to draft a note. A draft stays in chat until the contributor requests that it be appended to the ledger.",
)
write_json(
    project / "axm.json",
    {
        "owner": "@fieldwork",
        "agents": ["codex"],
        "packs": {"release": "workspace"},
        "skills": {
            "note": "workspace",
            "legacy-note": {"source": "workspace", "enabled": False},
        },
        "hooks": {"ledger-copy": "@vendor/hooks/ledger-copy@1.0.0"},
    },
)
policy = "@fieldwork/knowledge/release-policy#note-format"
for name, description, body in [
    (
        "note",
        "Draft or append a release note for a submitted field observation.",
        f"Read {policy} before drafting. Classify a change of coordinates as a correction. A draft stays in chat. Append to the ledger only on an explicit append request.",
    ),
    (
        "legacy-note",
        "Classify archived field observations for migration.",
        "Classify a change of coordinates as a correction. Return the observation ID and its classification.",
    ),
]:
    package = project / "skills" / name
    write_json(
        package / "skill.json",
        {
            "owner": "@fieldwork",
            "type": "skill",
            "name": name,
            "version": "1.0.0",
            "description": description,
        },
    )
    write(
        package / "src/SKILL.md",
        f"---\nname: {name}\ndescription: {description}\n---\n\n{body}",
    )
    write(package / "README.md", description)
pack = project / "packs/release"
write_json(
    pack / "pack.json",
    {
        "owner": "@fieldwork",
        "type": "pack",
        "name": "release",
        "version": "1.0.0",
        "description": "Draft a release note on a fresh contributor checkout.",
        "dependencies": {"@fieldwork/skills/note": "1.0.0"},
    },
)
write(
    pack / "README.md",
    "# Release\n\nInstall `axm install @fieldwork/packs/release`. Ask for a draft release note for observation N18. Expect a note in the shared format, ready to review in chat.",
)
for package in [pack, project / "skills/note"]:
    with ZipFile(evidence / (package.name + "-1.0.0.zip"), "x") as archive:
        for path in sorted(package.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(package))

# Synthetic host receipts for a specific append request. No hook executes.
write_json(
    evidence / "host-event.json",
    {
        "host": "codex",
        "request": "Append the note for N18",
        "eventId": "E17",
        "deliveries": [
            {
                "extension": "@fieldwork/skills/note",
                "effect": "ledger append",
                "entryId": "L84",
            },
            {
                "extension": "@vendor/hooks/ledger-copy",
                "effect": "ledger append",
                "entryId": "L85",
            },
        ],
    },
)

# Run the same first concept lookup in two assembled workspaces. Only the
# maintainer adds a separate policy bundle alongside the pack's exact member.
with TemporaryDirectory() as temp:
    for name in ["maintainer", "clean-consumer"]:
        consumer = Path(temp) / name
        for folder, archive_name in [
            ("packs/release", "release"),
            ("skills/note", "note"),
        ]:
            with ZipFile(evidence / (archive_name + "-1.0.0.zip")) as archive:
                archive.extractall(consumer / folder)
        settings = {
            "owner": "@fieldwork",
            "agents": ["codex"],
            "packs": {"release": "workspace"},
            "skills": {"note": "workspace"},
        }
        if name == "maintainer":
            settings["knowledge"] = {"release-policy": "workspace"}
            bundle = consumer / "knowledge/release-policy"
            write_json(
                bundle / "knowledge.json",
                {
                    "owner": "@fieldwork",
                    "type": "knowledge",
                    "name": "release-policy",
                    "version": "1.0.0",
                    "format": {"name": "okf", "version": "0.2"},
                    "bundleRoot": "src",
                },
            )
            write(
                bundle / "src/index.md",
                "# Release policy\n\n- [Note format](note-format.md)",
            )
            write(
                bundle / "src/note-format.md",
                "---\ntype: Guide\ntitle: Note format\n---\n\n# Note format\n\nStart the note with its observation ID.",
            )
        write_json(consumer / "axm.json", settings)
        run = subprocess.run(
            ["axm", "knowledge", "concepts", "get", policy, "--offline"],
            cwd=consumer,
            capture_output=True,
            text=True,
        )
        expected_exit = 0 if name == "maintainer" else 3
        if run.returncode != expected_exit:
            raise RuntimeError(f"{name} concept lookup: {run.stdout} {run.stderr}")
        write_json(
            evidence / (name + ".json"),
            {
                "assembledFrom": ["release-1.0.0.zip", "note-1.0.0.zip"],
                "settings": settings,
                "lookup": policy,
                "exitCode": run.returncode,
                "output": (run.stdout + run.stderr).strip().replace(str(consumer), "."),
            },
        )
subprocess.run(["git", "init", "-q", root], check=True)
