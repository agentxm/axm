import {
  booleanFlag,
  tinyFlags,
  type TinyFlagsClient,
  variantFlag,
} from "@agentxm/example-tinyflags";

export const FLAG_HOME_CHECK_FOLLOWUP = "home-check-followup";
export const FLAG_FEE_BREAKDOWN_DETAILED = "fee-breakdown-detailed";
export const FLAG_LONG_STAY_HIGHLIGHT = "long-stay-highlight";
export const FLAG_SUGGEST_DONATE_AFTER_ADOPTION = "suggest-donate-after-adoption";
export const FLAG_SHOW_CHARITY_RATINGS = "show-charity-ratings";
export const FLAG_RECOMMENDATION_STRATEGY = "recommendation-strategy";
export const FLAG_MATCH_QUIZ_DEPTH = "match-quiz-depth";
export const FLAG_PET_CARD_STYLE = "pet-card-style";
export const FLAG_DONATE_FOCUS_DEFAULT = "donate-focus-default";

export function createPawMatchFlags(): TinyFlagsClient {
  return tinyFlags({
    [FLAG_HOME_CHECK_FOLLOWUP]: booleanFlag({ default: false, rollout: 25 }),
    [FLAG_FEE_BREAKDOWN_DETAILED]: booleanFlag({ default: true }),
    [FLAG_LONG_STAY_HIGHLIGHT]: booleanFlag({ default: true }),
    [FLAG_SUGGEST_DONATE_AFTER_ADOPTION]: booleanFlag({ default: false, rollout: 50 }),
    [FLAG_SHOW_CHARITY_RATINGS]: booleanFlag({ default: true }),
    [FLAG_RECOMMENDATION_STRATEGY]: variantFlag(["popularity", "match-quiz", "longest-stay"], {
      default: "match-quiz",
      rollout: { "longest-stay": 20 },
    }),
    [FLAG_MATCH_QUIZ_DEPTH]: variantFlag(["short", "standard", "thorough"], {
      default: "standard",
    }),
    [FLAG_PET_CARD_STYLE]: variantFlag(["compact", "detailed", "playful"], {
      default: "detailed",
    }),
    [FLAG_DONATE_FOCUS_DEFAULT]: variantFlag(["all", "shelters", "rescue"], {
      default: "all",
    }),
  });
}
