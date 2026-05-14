# pawmatch: TinyFlags feature flag registry.

# Flag name constants. Each is wired into at least one CLI command so the
# companion TinyFlags skills have realistic targets.
.FLAG_HOME_CHECK_FOLLOWUP           <- "home-check-followup"
.FLAG_FEE_BREAKDOWN_DETAILED        <- "fee-breakdown-detailed"
.FLAG_LONG_STAY_HIGHLIGHT           <- "long-stay-highlight"
.FLAG_SUGGEST_DONATE_AFTER_ADOPTION <- "suggest-donate-after-adoption"
.FLAG_SHOW_CHARITY_RATINGS          <- "show-charity-ratings"
.FLAG_RECOMMENDATION_STRATEGY       <- "recommendation-strategy"
.FLAG_MATCH_QUIZ_DEPTH              <- "match-quiz-depth"
.FLAG_PET_CARD_STYLE                <- "pet-card-style"
.FLAG_DONATE_FOCUS_DEFAULT          <- "donate-focus-default"

#' Build the PawMatch TinyFlags registry.
#' @export
pawmatch_flags <- function() {
  tinyflags::tf_registry(
    "home-check-followup"           = tinyflags::tf_bool(default = FALSE, rollout = 25L),
    "fee-breakdown-detailed"        = tinyflags::tf_bool(default = TRUE),
    "long-stay-highlight"           = tinyflags::tf_bool(default = TRUE),
    "suggest-donate-after-adoption" = tinyflags::tf_bool(default = FALSE, rollout = 50L),
    "show-charity-ratings"          = tinyflags::tf_bool(default = TRUE),
    "recommendation-strategy"       = tinyflags::tf_variant(
      variants = c("popularity", "match-quiz", "longest-stay"),
      default = "match-quiz",
      rollout = c("longest-stay" = 20L)
    ),
    "match-quiz-depth" = tinyflags::tf_variant(
      variants = c("short", "standard", "thorough"),
      default = "standard"
    ),
    "pet-card-style" = tinyflags::tf_variant(
      variants = c("compact", "detailed", "playful"),
      default = "detailed"
    ),
    "donate-focus-default" = tinyflags::tf_variant(
      variants = c("all", "shelters", "rescue"),
      default = "all"
    )
  )
}
