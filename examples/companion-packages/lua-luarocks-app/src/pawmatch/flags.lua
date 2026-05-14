--- PawMatch flag definitions wiring into the TinyFlags library.
--
-- Each flag is wired into at least one command's code path so the
-- companion skills (add-flag, rollout-review, cleanup-flag) have realistic
-- targets.

local tinyflags = require("tinyflags")

local M = {}

M.HOME_CHECK_FOLLOWUP            = "home-check-followup"
M.FEE_BREAKDOWN_DETAILED         = "fee-breakdown-detailed"
M.LONG_STAY_HIGHLIGHT            = "long-stay-highlight"
M.SUGGEST_DONATE_AFTER_ADOPTION  = "suggest-donate-after-adoption"
M.SHOW_CHARITY_RATINGS           = "show-charity-ratings"
M.RECOMMENDATION_STRATEGY        = "recommendation-strategy"
M.MATCH_QUIZ_DEPTH               = "match-quiz-depth"
M.PET_CARD_STYLE                 = "pet-card-style"
M.DONATE_FOCUS_DEFAULT           = "donate-focus-default"

function M.build_registry()
  return tinyflags.Registry({
    [M.HOME_CHECK_FOLLOWUP]            = tinyflags.BooleanFlag({ default = false, rollout = 25 }),
    [M.FEE_BREAKDOWN_DETAILED]         = tinyflags.BooleanFlag({ default = true }),
    [M.LONG_STAY_HIGHLIGHT]            = tinyflags.BooleanFlag({ default = true }),
    [M.SUGGEST_DONATE_AFTER_ADOPTION]  = tinyflags.BooleanFlag({ default = false, rollout = 50 }),
    [M.SHOW_CHARITY_RATINGS]           = tinyflags.BooleanFlag({ default = true }),
    [M.RECOMMENDATION_STRATEGY] = tinyflags.VariantFlag({
      variants = { "popularity", "match-quiz", "longest-stay" },
      default = "match-quiz",
      rollout = { ["longest-stay"] = 20 },
    }),
    [M.MATCH_QUIZ_DEPTH] = tinyflags.VariantFlag({
      variants = { "short", "standard", "thorough" },
      default = "standard",
    }),
    [M.PET_CARD_STYLE] = tinyflags.VariantFlag({
      variants = { "compact", "detailed", "playful" },
      default = "detailed",
    }),
    [M.DONATE_FOCUS_DEFAULT] = tinyflags.VariantFlag({
      variants = { "all", "shelters", "rescue" },
      default = "all",
    }),
  })
end

return M
