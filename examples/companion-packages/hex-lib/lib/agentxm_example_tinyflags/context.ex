defmodule AgentXM.Examples.TinyFlags.Context do
  @moduledoc """
  Evaluation context for deterministic rollout bucketing.

  A context is a plain map. The bucketing key is taken from the first present
  of `:id`, `"id"`, `:user_id`, or `"user_id"`. An empty or missing identifier
  buckets every caller to the same `"anonymous"` slot — supply a stable id to
  get per-caller bucketing.
  """

  @typedoc "A context map carrying the caller identity."
  @type t :: %{optional(atom() | String.t()) => String.t()}

  @doc """
  Compute the rollout bucket (0..99) for the given flag name and context.

  Implements the same FNV-1a 32-bit hash used by the other TinyFlags ports so
  bucketing is identical across language ecosystems.
  """
  @spec bucket_for(String.t(), t() | map()) :: 0..99
  def bucket_for(name, context) when is_binary(name) and is_map(context) do
    key = context_id(context)
    rem(fnv1a(name <> ":" <> key), 100)
  end

  defp context_id(context) do
    context
    |> get_first([:id, "id", :user_id, "user_id"])
    |> case do
      value when is_binary(value) and value != "" -> value
      _ -> "anonymous"
    end
  end

  defp get_first(_context, []), do: nil

  defp get_first(context, [key | rest]) do
    case Map.fetch(context, key) do
      {:ok, value} -> value
      :error -> get_first(context, rest)
    end
  end

  @offset 2_166_136_261
  @prime 16_777_619
  @uint32 0xFFFFFFFF

  defp fnv1a(value) do
    value
    |> :binary.bin_to_list()
    |> Enum.reduce(@offset, fn byte, hash ->
      Bitwise.band(Bitwise.bxor(hash, byte) * @prime, @uint32)
    end)
  end
end
