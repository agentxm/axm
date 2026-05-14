defmodule AgentXM.Examples.PawMatch.Match do
  @moduledoc """
  Lifestyle preferences and matching helpers used by `pawmatch match`.
  """

  @type t :: %__MODULE__{
          has_kids: boolean(),
          quiet_home: boolean(),
          active: boolean(),
          first_time: boolean(),
          multiple_pets: boolean(),
          small_home: boolean()
        }

  defstruct has_kids: false,
            quiet_home: false,
            active: false,
            first_time: false,
            multiple_pets: false,
            small_home: false

  @factors [
    {:has_kids, "has-kids", ["good-with-kids", "gentle"]},
    {:quiet_home, "quiet-home", ["mellow", "calm", "solo", "lap-cat"]},
    {:active, "active", ["high-energy", "playful"]},
    {:first_time, "first-time", ["gentle", "calm", "low-energy"]},
    {:multiple_pets, "multiple-pets", ["social"]},
    {:small_home, "small-home", ["lap-cat", "solo", "low-energy"]}
  ]

  @popularity_tags MapSet.new(["social", "good-with-kids", "calm", "mellow", "gentle"])

  @doc "Return the preference factors used at the given match-quiz depth."
  @spec factors_for_depth(:short | :standard | :thorough) :: [
          {atom(), String.t(), [String.t()]}
        ]
  def factors_for_depth(:short), do: Enum.take(@factors, 2)
  def factors_for_depth(:thorough), do: @factors
  def factors_for_depth(_), do: Enum.take(@factors, 4)

  @doc "True when no preference flags were supplied."
  @spec empty?(t()) :: boolean()
  def empty?(%__MODULE__{} = prefs) do
    not (prefs.has_kids or prefs.quiet_home or prefs.active or prefs.first_time or
           prefs.multiple_pets or prefs.small_home)
  end

  @doc "Compute the set of preferred tags, given preferences and depth factors."
  @spec preferred_tags(t(), [{atom(), String.t(), [String.t()]}]) :: MapSet.t(String.t())
  def preferred_tags(%__MODULE__{} = prefs, factors) do
    Enum.reduce(factors, MapSet.new(), fn {field, _flag_name, tags}, acc ->
      if Map.get(prefs, field) do
        Enum.reduce(tags, acc, &MapSet.put(&2, &1))
      else
        acc
      end
    end)
  end

  @doc "The popularity tag set used by the popularity strategy."
  def popularity_tags, do: @popularity_tags

  @doc "Count how many of `tags` are in the target set."
  @spec count_tag_matches([String.t()], MapSet.t(String.t())) :: non_neg_integer()
  def count_tag_matches(tags, target) do
    Enum.count(tags, &MapSet.member?(target, &1))
  end
end
