"""Resolve and verify the one supported repository location for a Gen Stack corpus."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

from .corpus import parse_frontmatter
from .profile import PROFILE_ID, PROFILE_VERSION


CORPUS_DIRECTORY = "gen-stack"


@dataclass(frozen=True)
class LocationDiagnostic:
    rule: str
    path: Path
    message: str


@dataclass(frozen=True)
class CorpusLocation:
    repository_root: Path
    corpus_root: Path
    state: str
    diagnostics: tuple[LocationDiagnostic, ...] = ()


def _normalized_body(body: str) -> str:
    return re.sub(r"\s+", " ", body)


def _mentions_profile_adoption(index_path: Path) -> bool:
    try:
        _, body = parse_frontmatter(index_path)
    except (OSError, ValueError, yaml.YAMLError):
        return False
    normalized = _normalized_body(body)
    return bool(
        re.search(
            rf"\badopts?\b.*?\b{re.escape(PROFILE_ID)}\b",
            normalized,
            flags=re.IGNORECASE,
        )
    )


def _has_supported_adoption(body: str) -> bool:
    adoption = re.search(
        rf"\badopts\b.*?{re.escape(PROFILE_ID)}.*?\b(?:version\s+)?{re.escape(PROFILE_VERSION)}\b",
        _normalized_body(body),
        flags=re.IGNORECASE,
    )
    return adoption is not None and bool(
        re.search(r"\[[^\]]+\]\([^)]+\)", adoption.group(0))
    )


def inspect_repository(repository_root: Path) -> CorpusLocation:
    """Inspect only ``<repository-root>/gen-stack``; never search for alternatives."""

    repository_root = repository_root.resolve()
    corpus_root = repository_root / CORPUS_DIRECTORY

    if not repository_root.is_dir():
        diagnostic = LocationDiagnostic(
            "repository-root",
            repository_root,
            "The supplied repository root must be an existing directory.",
        )
        return CorpusLocation(repository_root, corpus_root, "invalid", (diagnostic,))

    resolved_corpus = corpus_root.resolve(strict=False)
    try:
        resolved_corpus.relative_to(repository_root)
    except ValueError:
        diagnostic = LocationDiagnostic(
            "corpus-boundary",
            corpus_root,
            "The gen-stack corpus path must not resolve outside the repository root.",
        )
        return CorpusLocation(repository_root, corpus_root, "unsupported", (diagnostic,))

    if corpus_root.is_symlink():
        diagnostic = LocationDiagnostic(
            "corpus-symlink",
            corpus_root,
            "The gen-stack corpus must be a real directory, not a compatibility symlink.",
        )
        return CorpusLocation(repository_root, corpus_root, "unsupported", (diagnostic,))

    if not corpus_root.exists():
        root_index = repository_root / "index.md"
        if root_index.is_file() and _mentions_profile_adoption(root_index):
            diagnostic = LocationDiagnostic(
                "unsupported-corpus-placement",
                root_index,
                "A Gen Stack corpus at the repository root is unsupported; place the complete corpus under gen-stack/.",
            )
            return CorpusLocation(
                repository_root, corpus_root, "unsupported", (diagnostic,)
            )
        diagnostic = LocationDiagnostic(
            "corpus-not-adopted",
            corpus_root,
            "No Gen Stack corpus is present at the required repository path gen-stack/.",
        )
        return CorpusLocation(repository_root, corpus_root, "absent", (diagnostic,))

    if not corpus_root.is_dir():
        diagnostic = LocationDiagnostic(
            "corpus-root",
            corpus_root,
            "The required gen-stack path must be a directory.",
        )
        return CorpusLocation(repository_root, corpus_root, "invalid", (diagnostic,))

    root_index = corpus_root / "index.md"
    if not root_index.is_file():
        diagnostic = LocationDiagnostic(
            "root-index",
            root_index,
            "The Gen Stack corpus at gen-stack/ must contain index.md.",
        )
        return CorpusLocation(repository_root, corpus_root, "invalid", (diagnostic,))

    try:
        metadata, body = parse_frontmatter(root_index)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        diagnostic = LocationDiagnostic("root-frontmatter", root_index, str(exc))
        return CorpusLocation(repository_root, corpus_root, "invalid", (diagnostic,))

    diagnostics: list[LocationDiagnostic] = []
    if metadata.get("okf_version") != "0.2":
        diagnostics.append(
            LocationDiagnostic(
                "okf-version",
                root_index,
                'Root frontmatter must declare okf_version: "0.2".',
            )
        )
    if not _has_supported_adoption(body):
        diagnostics.append(
            LocationDiagnostic(
                "profile-adoption",
                root_index,
                f"Root index must explicitly adopt and link {PROFILE_ID} version {PROFILE_VERSION}.",
            )
        )
    if diagnostics:
        return CorpusLocation(
            repository_root, corpus_root, "invalid", tuple(diagnostics)
        )

    return CorpusLocation(repository_root, corpus_root, "recognized")
