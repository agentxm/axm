package ai.agentxm.examples.pawmatch

import ai.agentxm.examples.tinyflags.{Flags, booleanFlag, createFlags, variantFlag}

/** Flag keys used by the PawMatch CLI. */
object FlagKeys:
  val HomeCheckFollowup = "home-check-followup"
  val FeeBreakdownDetailed = "fee-breakdown-detailed"
  val LongStayHighlight = "long-stay-highlight"
  val SuggestDonateAfterAdoption = "suggest-donate-after-adoption"
  val ShowCharityRatings = "show-charity-ratings"
  val RecommendationStrategy = "recommendation-strategy"
  val MatchQuizDepth = "match-quiz-depth"
  val PetCardStyle = "pet-card-style"
  val DonateFocusDefault = "donate-focus-default"

/** Canonical PawMatch [[Flags]] bundle. */
def createPawMatchFlags(): Flags = createFlags(
  FlagKeys.HomeCheckFollowup -> booleanFlag(default = false, rollout = Some(25)),
  FlagKeys.FeeBreakdownDetailed -> booleanFlag(default = true),
  FlagKeys.LongStayHighlight -> booleanFlag(default = true),
  FlagKeys.SuggestDonateAfterAdoption -> booleanFlag(default = false, rollout = Some(50)),
  FlagKeys.ShowCharityRatings -> booleanFlag(default = true),
  FlagKeys.RecommendationStrategy -> variantFlag(
    variants = List("popularity", "match-quiz", "longest-stay"),
    default = Some("match-quiz"),
    rollout = Some(Map("longest-stay" -> 20)),
  ),
  FlagKeys.MatchQuizDepth -> variantFlag(
    variants = List("short", "standard", "thorough"),
    default = Some("standard"),
  ),
  FlagKeys.PetCardStyle -> variantFlag(
    variants = List("compact", "detailed", "playful"),
    default = Some("detailed"),
  ),
  FlagKeys.DonateFocusDefault -> variantFlag(
    variants = List("all", "shelters", "rescue"),
    default = Some("all"),
  ),
)
