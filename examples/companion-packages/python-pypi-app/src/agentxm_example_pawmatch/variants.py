"""Variant enums and kebab-case helpers."""

from enum import StrEnum


class PetCardStyle(StrEnum):
    COMPACT = "compact"
    DETAILED = "detailed"
    PLAYFUL = "playful"


class MatchStrategy(StrEnum):
    POPULARITY = "popularity"
    MATCH_QUIZ = "match-quiz"
    LONGEST_STAY = "longest-stay"


class MatchDepth(StrEnum):
    SHORT = "short"
    STANDARD = "standard"
    THOROUGH = "thorough"


class DonateFocus(StrEnum):
    ALL = "all"
    SHELTERS = "shelters"
    RESCUE = "rescue"
    POLICY = "policy"
