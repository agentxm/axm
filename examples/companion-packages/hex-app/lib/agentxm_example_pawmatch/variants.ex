defmodule AgentXM.Examples.PawMatch.Variants do
  @moduledoc """
  Validated atom values for each TinyFlags variant flag. The TinyFlags engine
  returns variant strings; CLI command modules parse them into atoms so
  `case` statements stay exhaustive.
  """

  @pet_card_styles ~w(compact detailed playful)
  @strategies ~w(popularity match-quiz longest-stay)
  @depths ~w(short standard thorough)
  @focuses ~w(all shelters rescue)

  @doc "Parse a `pet-card-style` variant string into an atom."
  @spec parse_pet_card_style(String.t()) :: {:ok, :compact | :detailed | :playful} | {:error, term()}
  def parse_pet_card_style("compact"), do: {:ok, :compact}
  def parse_pet_card_style("detailed"), do: {:ok, :detailed}
  def parse_pet_card_style("playful"), do: {:ok, :playful}

  def parse_pet_card_style(other),
    do: {:error, "unknown pet-card-style variant #{inspect(other)}"}

  @doc "Parse a `recommendation-strategy` variant string into an atom."
  @spec parse_strategy(String.t()) ::
          {:ok, :popularity | :match_quiz | :longest_stay} | {:error, term()}
  def parse_strategy("popularity"), do: {:ok, :popularity}
  def parse_strategy("match-quiz"), do: {:ok, :match_quiz}
  def parse_strategy("longest-stay"), do: {:ok, :longest_stay}

  def parse_strategy(other),
    do: {:error, "unknown recommendation-strategy variant #{inspect(other)}"}

  @doc "Parse a `match-quiz-depth` variant string into an atom."
  @spec parse_depth(String.t()) :: {:ok, :short | :standard | :thorough} | {:error, term()}
  def parse_depth("short"), do: {:ok, :short}
  def parse_depth("standard"), do: {:ok, :standard}
  def parse_depth("thorough"), do: {:ok, :thorough}

  def parse_depth(other), do: {:error, "unknown match-quiz-depth variant #{inspect(other)}"}

  @doc "Parse a `donate-focus-default` variant string into an atom."
  @spec parse_focus(String.t()) :: {:ok, :all | :shelters | :rescue} | {:error, term()}
  def parse_focus("all"), do: {:ok, :all}
  def parse_focus("shelters"), do: {:ok, :shelters}
  def parse_focus("rescue"), do: {:ok, :rescue}

  def parse_focus(other), do: {:error, "unknown donate-focus-default variant #{inspect(other)}"}

  @doc "All known pet-card styles, for documentation."
  def pet_card_styles, do: @pet_card_styles

  @doc "All known recommendation strategies, for documentation."
  def strategies, do: @strategies

  @doc "All known match-quiz depths, for documentation."
  def depths, do: @depths

  @doc "All known donate focuses, for documentation."
  def focuses, do: @focuses
end
