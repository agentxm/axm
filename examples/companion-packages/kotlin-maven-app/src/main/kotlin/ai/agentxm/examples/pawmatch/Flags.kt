package ai.agentxm.examples.pawmatch

import ai.agentxm.examples.tinyflags.Flags
import ai.agentxm.examples.tinyflags.booleanFlag
import ai.agentxm.examples.tinyflags.createFlags
import ai.agentxm.examples.tinyflags.variantFlag

object FlagKeys {
    const val HOME_CHECK_FOLLOWUP = "home-check-followup"
    const val FEE_BREAKDOWN_DETAILED = "fee-breakdown-detailed"
    const val LONG_STAY_HIGHLIGHT = "long-stay-highlight"
    const val SUGGEST_DONATE_AFTER_ADOPTION = "suggest-donate-after-adoption"
    const val SHOW_CHARITY_RATINGS = "show-charity-ratings"
    const val RECOMMENDATION_STRATEGY = "recommendation-strategy"
    const val MATCH_QUIZ_DEPTH = "match-quiz-depth"
    const val PET_CARD_STYLE = "pet-card-style"
    const val DONATE_FOCUS_DEFAULT = "donate-focus-default"
}

fun createPawMatchFlags(): Flags = createFlags(
    FlagKeys.HOME_CHECK_FOLLOWUP to booleanFlag(default = false, rollout = 25),
    FlagKeys.FEE_BREAKDOWN_DETAILED to booleanFlag(default = true),
    FlagKeys.LONG_STAY_HIGHLIGHT to booleanFlag(default = true),
    FlagKeys.SUGGEST_DONATE_AFTER_ADOPTION to booleanFlag(default = false, rollout = 50),
    FlagKeys.SHOW_CHARITY_RATINGS to booleanFlag(default = true),
    FlagKeys.RECOMMENDATION_STRATEGY to variantFlag(
        variants = listOf("popularity", "match-quiz", "longest-stay"),
        default = "match-quiz",
        rollout = mapOf("longest-stay" to 20),
    ),
    FlagKeys.MATCH_QUIZ_DEPTH to variantFlag(
        variants = listOf("short", "standard", "thorough"),
        default = "standard",
    ),
    FlagKeys.PET_CARD_STYLE to variantFlag(
        variants = listOf("compact", "detailed", "playful"),
        default = "detailed",
    ),
    FlagKeys.DONATE_FOCUS_DEFAULT to variantFlag(
        variants = listOf("all", "shelters", "rescue"),
        default = "all",
    ),
)
