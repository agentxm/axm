"""Read Gen Stack concept documents without applying profile semantics."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

import yaml


LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")


@dataclass(frozen=True)
class Concept:
    path: Path
    relative: PurePosixPath
    metadata: dict[str, object]
    body: str


def parse_frontmatter(path: Path) -> tuple[dict[str, object], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return {}, text
    marker = text.find("\n---\n", 4)
    if marker < 0:
        raise ValueError("frontmatter closing delimiter is missing")
    data = yaml.safe_load(text[4:marker]) or {}
    if not isinstance(data, dict):
        raise ValueError("frontmatter must be a mapping")
    return data, text[marker + 5 :]


def load_concepts(root: Path) -> dict[PurePosixPath, Concept]:
    root = root.resolve()
    concepts: dict[PurePosixPath, Concept] = {}
    for path in sorted(root.rglob("*.md")):
        if path.name in {"index.md", "log.md"}:
            continue
        relative = PurePosixPath(path.relative_to(root).as_posix())
        metadata, body = parse_frontmatter(path)
        concepts[relative] = Concept(path, relative, metadata, body)
    return concepts


def local_markdown_targets(path: Path, root: Path) -> set[Path]:
    targets: set[Path] = set()
    text = path.read_text(encoding="utf-8")
    for raw in LINK_RE.findall(text):
        target = raw.strip().split()[0].strip("<>")
        if not target or target.startswith(("#", "http://", "https://", "mailto:")):
            continue
        target = unquote(target.split("#", 1)[0].split("?", 1)[0])
        candidate = root / target.lstrip("/") if target.startswith("/") else path.parent / target
        try:
            resolved = candidate.resolve(strict=False)
            resolved.relative_to(root)
        except (OSError, ValueError):
            continue
        if resolved.is_dir():
            resolved = resolved / "index.md"
        if resolved.suffix == "":
            resolved = resolved.with_suffix(".md")
        if resolved.is_file():
            targets.add(resolved)
    return targets
