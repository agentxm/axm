"""Shared model and mechanics for the Gen Stack application profile."""

from .corpus import Concept, load_concepts, parse_frontmatter
from .location import CORPUS_DIRECTORY, CorpusLocation, inspect_repository
from .inspection import (
    InspectionFailure,
    InspectionPlane,
    SCHEMA_VERSION,
    diff_envelope,
    load_snapshot,
    standalone_failure_envelope,
)
from .profile import PROFILE_ID, PROFILE_VERSION

__all__ = [
    "Concept",
    "CORPUS_DIRECTORY",
    "CorpusLocation",
    "InspectionFailure",
    "InspectionPlane",
    "PROFILE_ID",
    "PROFILE_VERSION",
    "SCHEMA_VERSION",
    "diff_envelope",
    "inspect_repository",
    "load_concepts",
    "load_snapshot",
    "standalone_failure_envelope",
    "parse_frontmatter",
]
