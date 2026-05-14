"""Variant enums and kebab-case helpers."""

from enum import Enum


class PetCardStyle(str, Enum):
    COMPACT = "compact"
    DETAILED = "detailed"
    PLAYFUL = "playful"


class MatchStrategy(str, Enum):
    POPULARITY = "popularity"
    MATCH_QUIZ = "match-quiz"
    LONGEST_STAY = "longest-stay"


class MatchDepth(str, Enum):
    SHORT = "short"
    STANDARD = "standard"
    THOROUGH = "thorough"


class DonateFocus(str, Enum):
    ALL = "all"
    SHELTERS = "shelters"
    RESCUE = "rescue"
    POLICY = "policy"
