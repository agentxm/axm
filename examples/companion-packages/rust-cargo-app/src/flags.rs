//! TinyFlags definitions for the PawMatch CLI. Mirrors the other ecosystem
//! ports so the companion skills see the same seams everywhere.

use tinyflags::{Flag, Flags};

pub const FLAG_HOME_CHECK_FOLLOWUP: &str = "home-check-followup";
pub const FLAG_FEE_BREAKDOWN_DETAILED: &str = "fee-breakdown-detailed";
pub const FLAG_LONG_STAY_HIGHLIGHT: &str = "long-stay-highlight";
pub const FLAG_SUGGEST_DONATE_AFTER_ADOPT: &str = "suggest-donate-after-adoption";
pub const FLAG_SHOW_CHARITY_RATINGS: &str = "show-charity-ratings";
pub const FLAG_RECOMMENDATION_STRATEGY: &str = "recommendation-strategy";
pub const FLAG_MATCH_QUIZ_DEPTH: &str = "match-quiz-depth";
pub const FLAG_PET_CARD_STYLE: &str = "pet-card-style";
pub const FLAG_DONATE_FOCUS_DEFAULT: &str = "donate-focus-default";

/// Build the package-level [`Flags`] set used by the CLI.
pub fn new_flags() -> Flags {
    Flags::builder()
        .add(
            FLAG_HOME_CHECK_FOLLOWUP,
            Flag::boolean()
                .default(false)
                .rollout(25)
                .build()
                .expect("home-check-followup definition"),
        )
        .add(
            FLAG_FEE_BREAKDOWN_DETAILED,
            Flag::boolean()
                .default(true)
                .build()
                .expect("fee-breakdown-detailed definition"),
        )
        .add(
            FLAG_LONG_STAY_HIGHLIGHT,
            Flag::boolean()
                .default(true)
                .build()
                .expect("long-stay-highlight definition"),
        )
        .add(
            FLAG_SUGGEST_DONATE_AFTER_ADOPT,
            Flag::boolean()
                .default(false)
                .rollout(50)
                .build()
                .expect("suggest-donate-after-adoption definition"),
        )
        .add(
            FLAG_SHOW_CHARITY_RATINGS,
            Flag::boolean()
                .default(true)
                .build()
                .expect("show-charity-ratings definition"),
        )
        .add(
            FLAG_RECOMMENDATION_STRATEGY,
            Flag::variant(["popularity", "match-quiz", "longest-stay"])
                .default("match-quiz")
                .rollout([("longest-stay", 20)])
                .build()
                .expect("recommendation-strategy definition"),
        )
        .add(
            FLAG_MATCH_QUIZ_DEPTH,
            Flag::variant(["short", "standard", "thorough"])
                .default("standard")
                .build()
                .expect("match-quiz-depth definition"),
        )
        .add(
            FLAG_PET_CARD_STYLE,
            Flag::variant(["compact", "detailed", "playful"])
                .default("detailed")
                .build()
                .expect("pet-card-style definition"),
        )
        .add(
            FLAG_DONATE_FOCUS_DEFAULT,
            Flag::variant(["all", "shelters", "rescue"])
                .default("all")
                .build()
                .expect("donate-focus-default definition"),
        )
        .build()
        .expect("flags definitions should be valid")
}
