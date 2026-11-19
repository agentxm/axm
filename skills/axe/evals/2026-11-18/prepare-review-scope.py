"""Prepare one synthetic review target in a new directory for a fresh host trial."""

import argparse
import json
from pathlib import Path
from zipfile import ZipFile


def prepare(case, directory):
    directory.mkdir(parents=True, exist_ok=False)
    (directory / "AGENTS.md").write_text(case["context"] + "\n")
    for name, content in case["files"].items():
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    if "archiveEntries" in case:
        evidence = directory / "evidence"
        evidence.mkdir()
        with ZipFile(evidence / "candidate.zip", "w") as archive:
            for name in case["archiveEntries"]:
                content = (directory / "sample" / name).read_bytes()
                if name == "skill.json":
                    manifest = json.loads(content)
                    del manifest["publish"]
                    content = json.dumps(manifest).encode()
                archive.writestr(name, content)


if __name__ == "__main__":
    fixtures = json.loads(Path(__file__).with_name("review-scope-fixtures.json").read_text())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case", choices=fixtures)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    prepare(fixtures[args.case], args.directory)
