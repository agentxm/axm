defmodule AgentXM.Examples.TinyFlags.BooleanFlag do
  @moduledoc """
  A feature flag whose treatment is `true` or `false`.

  Construct one with `new/1`. Without `:default` the default is `false`. Without
  `:rollout` the default value is returned for every caller. With `:rollout`,
  the value flips to `not default` for the percentage of callers selected by
  deterministic bucketing on the caller `id`.
  """

  @enforce_keys [:default]
  defstruct default: false, rollout: nil

  @typedoc "An integer rollout percentage in the closed range 0..100."
  @type rollout :: 0..100 | nil

  @type t :: %__MODULE__{default: boolean(), rollout: rollout()}

  @doc """
  Construct a boolean flag.

  Options:

    * `:default` — default value (defaults to `false`).
    * `:rollout` — integer percentage in `0..100`. When set, the value flips
      to `not default` for that share of callers.
  """
  @spec new(keyword()) :: {:ok, t()} | {:error, term()}
  def new(opts \\ []) when is_list(opts) do
    default = Keyword.get(opts, :default, false)
    rollout = Keyword.get(opts, :rollout)

    cond do
      not is_boolean(default) ->
        {:error, "BooleanFlag: :default must be a boolean"}

      not valid_rollout?(rollout) ->
        {:error, "BooleanFlag: :rollout must be an integer in 0..100 or nil"}

      true ->
        {:ok, %__MODULE__{default: default, rollout: rollout}}
    end
  end

  @doc "Like `new/1` but raises `ArgumentError` on invalid input."
  @spec new!(keyword()) :: t()
  def new!(opts \\ []) do
    case new(opts) do
      {:ok, flag} -> flag
      {:error, reason} -> raise ArgumentError, reason
    end
  end

  defp valid_rollout?(nil), do: true
  defp valid_rollout?(pct) when is_integer(pct) and pct >= 0 and pct <= 100, do: true
  defp valid_rollout?(_other), do: false
end
