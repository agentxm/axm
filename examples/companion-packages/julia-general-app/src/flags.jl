module Flags

using AgentXMExampleTinyFlags

export build_registry,
    HOME_CHECK_FOLLOWUP,
    FEE_BREAKDOWN_DETAILED,
    LONG_STAY_HIGHLIGHT,
    SUGGEST_DONATE_AFTER_ADOPTION,
    SHOW_CHARITY_RATINGS,
    RECOMMENDATION_STRATEGY,
    MATCH_QUIZ_DEPTH,
    PET_CARD_STYLE,
    DONATE_FOCUS_DEFAULT

const HOME_CHECK_FOLLOWUP           = "home-check-followup"
const FEE_BREAKDOWN_DETAILED        = "fee-breakdown-detailed"
const LONG_STAY_HIGHLIGHT           = "long-stay-highlight"
const SUGGEST_DONATE_AFTER_ADOPTION = "suggest-donate-after-adoption"
const SHOW_CHARITY_RATINGS          = "show-charity-ratings"
const RECOMMENDATION_STRATEGY       = "recommendation-strategy"
const MATCH_QUIZ_DEPTH              = "match-quiz-depth"
const PET_CARD_STYLE                = "pet-card-style"
const DONATE_FOCUS_DEFAULT          = "donate-focus-default"

"""
    build_registry() -> Registry

Build the TinyFlags `Registry` used by the PawMatch CLI. Each flag is wired
into at least one command — see the README for the per-command map.
"""
function build_registry()
    return Registry(Dict(
        HOME_CHECK_FOLLOWUP           => BooleanFlag(default=false, rollout=25),
        FEE_BREAKDOWN_DETAILED        => BooleanFlag(default=true),
        LONG_STAY_HIGHLIGHT           => BooleanFlag(default=true),
        SUGGEST_DONATE_AFTER_ADOPTION => BooleanFlag(default=false, rollout=50),
        SHOW_CHARITY_RATINGS          => BooleanFlag(default=true),
        RECOMMENDATION_STRATEGY       => VariantFlag(
            variants=["popularity", "match-quiz", "longest-stay"],
            default="match-quiz",
            rollout=Dict("longest-stay" => 20),
        ),
        MATCH_QUIZ_DEPTH => VariantFlag(
            variants=["short", "standard", "thorough"],
            default="standard",
        ),
        PET_CARD_STYLE => VariantFlag(
            variants=["compact", "detailed", "playful"],
            default="detailed",
        ),
        DONATE_FOCUS_DEFAULT => VariantFlag(
            variants=["all", "shelters", "rescue"],
            default="all",
        ),
    ))
end

end # module Flags
