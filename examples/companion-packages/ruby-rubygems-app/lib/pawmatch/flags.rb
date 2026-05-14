# frozen_string_literal: true

require "tiny_flags"

module Pawmatch
  module Flags
    HOME_CHECK_FOLLOWUP           = "home-check-followup"
    FEE_BREAKDOWN_DETAILED        = "fee-breakdown-detailed"
    LONG_STAY_HIGHLIGHT           = "long-stay-highlight"
    SUGGEST_DONATE_AFTER_ADOPTION = "suggest-donate-after-adoption"
    SHOW_CHARITY_RATINGS          = "show-charity-ratings"
    RECOMMENDATION_STRATEGY       = "recommendation-strategy"
    MATCH_QUIZ_DEPTH              = "match-quiz-depth"
    PET_CARD_STYLE                = "pet-card-style"
    DONATE_FOCUS_DEFAULT          = "donate-focus-default"

    def self.build_registry
      TinyFlags::Registry.new(
        HOME_CHECK_FOLLOWUP           => TinyFlags::BooleanFlag.new(default: false, rollout: 25),
        FEE_BREAKDOWN_DETAILED        => TinyFlags::BooleanFlag.new(default: true),
        LONG_STAY_HIGHLIGHT           => TinyFlags::BooleanFlag.new(default: true),
        SUGGEST_DONATE_AFTER_ADOPTION => TinyFlags::BooleanFlag.new(default: false, rollout: 50),
        SHOW_CHARITY_RATINGS          => TinyFlags::BooleanFlag.new(default: true),
        RECOMMENDATION_STRATEGY       => TinyFlags::VariantFlag.new(
          variants: %w[popularity match-quiz longest-stay],
          default: "match-quiz",
          rollout: { "longest-stay" => 20 }
        ),
        MATCH_QUIZ_DEPTH => TinyFlags::VariantFlag.new(
          variants: %w[short standard thorough],
          default: "standard"
        ),
        PET_CARD_STYLE => TinyFlags::VariantFlag.new(
          variants: %w[compact detailed playful],
          default: "detailed"
        ),
        DONATE_FOCUS_DEFAULT => TinyFlags::VariantFlag.new(
          variants: %w[all shelters rescue],
          default: "all"
        )
      )
    end
  end
end
