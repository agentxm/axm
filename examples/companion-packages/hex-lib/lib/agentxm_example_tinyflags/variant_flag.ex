defmodule AgentXM.Examples.TinyFlags.VariantFlag do
  @moduledoc """
  A feature flag whose treatment is one of a fixed set of named variants.

  Variants are listed in declaration order. Without `:default` the first
  variant is the default. Without `:rollout` the default variant is returned
  for every caller. With `:rollout`, percentages of traffic are allocated to
  variants by deterministic bucketing; the total must not exceed 100, every
  rollout key must be a declared variant, and each percentage must be in
  `0..100`.
  """

  @enforce_keys [:variants, :default]
  defstruct variants: [], default: nil, rollout: nil

  @type t :: %__MODULE__{
          variants: [String.t(), ...],
          default: String.t(),
          rollout: %{optional(String.t()) => 0..100} | nil
        }

  @doc """
  Construct a variant flag.

  `variants` is a non-empty list of non-empty, unique strings.

  Options:

    * `:default` — default variant (must be one of `variants`).
    * `:rollout` — map of `variant => percentage` allocating traffic.
  """
  @spec new([String.t(), ...], keyword()) :: {:ok, t()} | {:error, term()}
  def new(variants, opts \\ [])

  def new(variants, opts) when is_list(variants) and is_list(opts) do
    with {:ok, ordered} <- validate_variants(variants),
         {:ok, default} <- resolve_default(ordered, Keyword.get(opts, :default)),
         {:ok, rollout} <- validate_rollout(ordered, Keyword.get(opts, :rollout)) do
      {:ok, %__MODULE__{variants: ordered, default: default, rollout: rollout}}
    end
  end

  def new(_variants, _opts), do: {:error, "VariantFlag: variants must be a list"}

  @doc "Like `new/2` but raises `ArgumentError` on invalid input."
  @spec new!([String.t(), ...], keyword()) :: t()
  def new!(variants, opts \\ []) do
    case new(variants, opts) do
      {:ok, flag} -> flag
      {:error, reason} -> raise ArgumentError, reason
    end
  end

  # ── validation ─────────────────────────────────────────────────────────

  defp validate_variants([]), do: {:error, "VariantFlag: variants must not be empty"}

  defp validate_variants(variants) do
    Enum.reduce_while(variants, {:ok, [], MapSet.new()}, fn
      v, _acc when not is_binary(v) ->
        {:halt, {:error, "VariantFlag: variant names must be strings"}}

      "", _acc ->
        {:halt, {:error, "VariantFlag: variant names must be non-empty"}}

      v, {:ok, acc, seen} ->
        if MapSet.member?(seen, v) do
          {:halt, {:error, "VariantFlag: duplicate variant #{inspect(v)}"}}
        else
          {:cont, {:ok, [v | acc], MapSet.put(seen, v)}}
        end
    end)
    |> case do
      {:ok, reversed, _seen} -> {:ok, Enum.reverse(reversed)}
      {:error, _reason} = error -> error
    end
  end

  defp resolve_default([first | _rest], nil), do: {:ok, first}

  defp resolve_default(variants, default) when is_binary(default) do
    if default in variants do
      {:ok, default}
    else
      {:error, "VariantFlag: default #{inspect(default)} is not a declared variant"}
    end
  end

  defp resolve_default(_variants, _other),
    do: {:error, "VariantFlag: :default must be a string"}

  defp validate_rollout(_variants, nil), do: {:ok, nil}

  defp validate_rollout(variants, rollout) when is_map(rollout) do
    Enum.reduce_while(rollout, {:ok, %{}, 0}, fn {variant, pct}, {:ok, acc, total} ->
      cond do
        not (is_binary(variant) and variant in variants) ->
          {:halt,
           {:error, "VariantFlag: rollout references unknown variant #{inspect(variant)}"}}

        not (is_integer(pct) and pct >= 0 and pct <= 100) ->
          {:halt,
           {:error,
            "VariantFlag: rollout[#{inspect(variant)}] percentage must be an integer in 0..100"}}

        true ->
          {:cont, {:ok, Map.put(acc, variant, pct), total + pct}}
      end
    end)
    |> case do
      {:ok, _validated, total} when total > 100 ->
        {:error, "VariantFlag: rollout total #{total} exceeds 100"}

      {:ok, validated, _total} ->
        {:ok, validated}

      {:error, _reason} = error ->
        error
    end
  end

  defp validate_rollout(_variants, _other),
    do: {:error, "VariantFlag: :rollout must be a map or nil"}
end
