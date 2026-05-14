"""TinyFlags definitions for PawMatch."""

from agentxm_example_tinyflags import BooleanFlag, Flag, TinyFlags, VariantFlag

HOME_CHECK_FOLLOWUP = "home-check-followup"
FEE_BREAKDOWN_DETAILED = "fee-breakdown-detailed"
LONG_STAY_HIGHLIGHT = "long-stay-highlight"
SUGGEST_DONATE_AFTER_ADOPTION = "suggest-donate-after-adoption"
SHOW_CHARITY_RATINGS = "show-charity-ratings"
RECOMMENDATION_STRATEGY = "recommendation-strategy"
MATCH_QUIZ_DEPTH = "match-quiz-depth"
PET_CARD_STYLE = "pet-card-style"
DONATE_FOCUS_DEFAULT = "donate-focus-default"


def create_flags() -> TinyFlags:
    """Build the TinyFlags client with PawMatch's flag definitions."""
    definitions: dict[str, Flag] = {
        HOME_CHECK_FOLLOWUP: BooleanFlag(default=False, rollout=25),
        FEE_BREAKDOWN_DETAILED: BooleanFlag(default=True),
        LONG_STAY_HIGHLIGHT: BooleanFlag(default=True),
        SUGGEST_DONATE_AFTER_ADOPTION: BooleanFlag(default=False, rollout=50),
        SHOW_CHARITY_RATINGS: BooleanFlag(default=True),
        RECOMMENDATION_STRATEGY: VariantFlag(
            variants=("popularity", "match-quiz", "longest-stay"),
            default="match-quiz",
            rollout={"longest-stay": 20},
        ),
        MATCH_QUIZ_DEPTH: VariantFlag(
            variants=("short", "standard", "thorough"),
            default="standard",
        ),
        PET_CARD_STYLE: VariantFlag(
            variants=("compact", "detailed", "playful"),
            default="detailed",
        ),
        DONATE_FOCUS_DEFAULT: VariantFlag(
            variants=("all", "shelters", "rescue"),
            default="all",
        ),
    }
    return TinyFlags(definitions)
