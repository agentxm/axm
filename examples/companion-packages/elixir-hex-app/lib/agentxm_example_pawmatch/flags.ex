defmodule AgentXM.Examples.PawMatch.Flags do
  @moduledoc """
  Package-level TinyFlags flag set used by the PawMatch CLI. Definitions
  intentionally mirror the other companion-package ports so the companion
  skills see the same seams in every ecosystem.
  """

  alias AgentXM.Examples.TinyFlags
  alias AgentXM.Examples.TinyFlags.{BooleanFlag, VariantFlag}

  # Boolean flag names.
  def home_check_followup, do: "home-check-followup"
  def fee_breakdown_detailed, do: "fee-breakdown-detailed"
  def long_stay_highlight, do: "long-stay-highlight"
  def suggest_donate_after_adoption, do: "suggest-donate-after-adoption"
  def show_charity_ratings, do: "show-charity-ratings"

  # Variant flag names.
  def recommendation_strategy, do: "recommendation-strategy"
  def match_quiz_depth, do: "match-quiz-depth"
  def pet_card_style, do: "pet-card-style"
  def donate_focus_default, do: "donate-focus-default"

  @doc "Build the PawMatch flag set."
  @spec build() :: TinyFlags.t()
  def build do
    TinyFlags.new!(%{
      home_check_followup() => BooleanFlag.new!(default: false, rollout: 25),
      fee_breakdown_detailed() => BooleanFlag.new!(default: true),
      long_stay_highlight() => BooleanFlag.new!(default: true),
      suggest_donate_after_adoption() => BooleanFlag.new!(default: false, rollout: 50),
      show_charity_ratings() => BooleanFlag.new!(default: true),
      recommendation_strategy() =>
        VariantFlag.new!(
          ["popularity", "match-quiz", "longest-stay"],
          default: "match-quiz",
          rollout: %{"longest-stay" => 20}
        ),
      match_quiz_depth() =>
        VariantFlag.new!(["short", "standard", "thorough"], default: "standard"),
      pet_card_style() =>
        VariantFlag.new!(["compact", "detailed", "playful"], default: "detailed"),
      donate_focus_default() =>
        VariantFlag.new!(["all", "shelters", "rescue"], default: "all")
    })
  end
end
