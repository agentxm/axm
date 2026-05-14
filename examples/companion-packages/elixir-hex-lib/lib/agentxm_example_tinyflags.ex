defmodule AgentXM.Examples.TinyFlags do
  @moduledoc """
  Tiny feature flags library used by AXM companion package examples.

  Flags are defined with `AgentXM.Examples.TinyFlags.BooleanFlag.new/1` or
  `AgentXM.Examples.TinyFlags.VariantFlag.new/2` and evaluated through a
  flag set built with `new/1`. Rollout decisions are deterministic for a
  given `{flag_name, context_id}` pair so the same caller always sees the
  same answer.

  ## Example

      flags =
        AgentXM.Examples.TinyFlags.new!(%{
          "checkout-redesign" =>
            AgentXM.Examples.TinyFlags.BooleanFlag.new!(default: true),
          "search-ranking" =>
            AgentXM.Examples.TinyFlags.VariantFlag.new!(
              ["classic", "semantic"],
              default: "classic",
              rollout: %{"semantic" => 100}
            )
        })

      AgentXM.Examples.TinyFlags.enabled?(flags, "checkout-redesign", %{id: "user-1"})
      # => true

      AgentXM.Examples.TinyFlags.variant(flags, "search-ranking", %{id: "user-1"})
      # => {:ok, "semantic"}
  """

  alias AgentXM.Examples.TinyFlags.{BooleanFlag, Context, VariantFlag}

  @typedoc "A flag set built with `new/1` or `new!/1`."
  @type t :: %__MODULE__{definitions: %{optional(String.t()) => BooleanFlag.t() | VariantFlag.t()}}

  defstruct definitions: %{}

  @doc """
  Build a flag set from a map of flag name to definition.

  Returns `{:error, reason}` if the map is invalid (nil, non-map, or contains a
  blank flag name).
  """
  @spec new(map()) :: {:ok, t()} | {:error, term()}
  def new(definitions) when is_map(definitions) do
    Enum.reduce_while(definitions, {:ok, %{}}, fn
      {name, _flag}, _acc when not is_binary(name) ->
        {:halt, {:error, "tinyflags: flag names must be strings"}}

      {"", _flag}, _acc ->
        {:halt, {:error, "tinyflags: flag names must be non-empty"}}

      {name, %BooleanFlag{} = flag}, {:ok, acc} ->
        {:cont, {:ok, Map.put(acc, name, flag)}}

      {name, %VariantFlag{} = flag}, {:ok, acc} ->
        {:cont, {:ok, Map.put(acc, name, flag)}}

      {name, _flag}, _acc ->
        {:halt, {:error, "tinyflags: flag #{inspect(name)} is not a BooleanFlag or VariantFlag"}}
    end)
    |> case do
      {:ok, table} -> {:ok, %__MODULE__{definitions: table}}
      {:error, _reason} = error -> error
    end
  end

  def new(_other), do: {:error, "tinyflags: definitions must be a map"}

  @doc "Like `new/1` but raises `ArgumentError` on invalid input."
  @spec new!(map()) :: t()
  def new!(definitions) do
    case new(definitions) do
      {:ok, flags} -> flags
      {:error, reason} -> raise ArgumentError, reason
    end
  end

  @doc "Return the registered flag names in lexicographic order."
  @spec names(t()) :: [String.t()]
  def names(%__MODULE__{definitions: table}), do: table |> Map.keys() |> Enum.sort()

  @doc """
  Return the boolean treatment for the named flag.

  Returns `{:error, reason}` when the flag is unknown or is not a boolean flag.
  """
  @spec enabled(t(), String.t(), Context.t() | map()) :: {:ok, boolean()} | {:error, term()}
  def enabled(%__MODULE__{} = flags, name, context \\ %{}) do
    with {:ok, %BooleanFlag{} = flag} <- fetch_kind(flags, name, :boolean) do
      result =
        case flag.rollout do
          nil -> flag.default
          pct -> Context.bucket_for(name, context) < pct
        end

      {:ok, result}
    end
  end

  @doc """
  Convenience wrapper that returns the boolean directly. Raises on error.
  """
  @spec enabled?(t(), String.t(), Context.t() | map()) :: boolean()
  def enabled?(%__MODULE__{} = flags, name, context \\ %{}) do
    case enabled(flags, name, context) do
      {:ok, value} -> value
      {:error, reason} -> raise ArgumentError, reason
    end
  end

  @doc """
  Return the named variant treatment for the named flag.

  Returns `{:error, reason}` when the flag is unknown or is not a variant flag.
  """
  @spec variant(t(), String.t(), Context.t() | map()) :: {:ok, String.t()} | {:error, term()}
  def variant(%__MODULE__{} = flags, name, context \\ %{}) do
    with {:ok, %VariantFlag{} = flag} <- fetch_kind(flags, name, :variant) do
      result =
        case flag.rollout do
          nil ->
            flag.default

          rollout when map_size(rollout) == 0 ->
            flag.default

          rollout ->
            bucket = Context.bucket_for(name, context)
            pick_variant(flag.variants, rollout, bucket, flag.default)
        end

      {:ok, result}
    end
  end

  @doc """
  Evaluate a flag without knowing its kind ahead of time. Returns a
  `{:boolean, bool}` or `{:variant, name}` tuple.
  """
  @spec evaluate(t(), String.t(), Context.t() | map()) ::
          {:ok, {:boolean, boolean()} | {:variant, String.t()}} | {:error, term()}
  def evaluate(%__MODULE__{} = flags, name, context \\ %{}) do
    case fetch(flags, name) do
      {:ok, %BooleanFlag{}} ->
        with {:ok, value} <- enabled(flags, name, context) do
          {:ok, {:boolean, value}}
        end

      {:ok, %VariantFlag{}} ->
        with {:ok, value} <- variant(flags, name, context) do
          {:ok, {:variant, value}}
        end

      {:error, _reason} = error ->
        error
    end
  end

  @doc "Return `{:ok, flag}` or `{:error, reason}` if the flag is unknown."
  @spec fetch(t(), String.t()) ::
          {:ok, BooleanFlag.t() | VariantFlag.t()} | {:error, term()}
  def fetch(%__MODULE__{definitions: table}, name) do
    case Map.fetch(table, name) do
      {:ok, flag} -> {:ok, flag}
      :error -> {:error, "tinyflags: unknown flag #{inspect(name)}"}
    end
  end

  # ── helpers ────────────────────────────────────────────────────────────

  defp fetch_kind(flags, name, :boolean) do
    case fetch(flags, name) do
      {:ok, %BooleanFlag{} = flag} -> {:ok, flag}
      {:ok, _flag} -> {:error, "tinyflags: flag #{inspect(name)} is not a boolean flag"}
      {:error, _reason} = error -> error
    end
  end

  defp fetch_kind(flags, name, :variant) do
    case fetch(flags, name) do
      {:ok, %VariantFlag{} = flag} -> {:ok, flag}
      {:ok, _flag} -> {:error, "tinyflags: flag #{inspect(name)} is not a variant flag"}
      {:error, _reason} = error -> error
    end
  end

  # Walk variants in declaration order so allocation is stable. Variants
  # missing from the rollout map are skipped.
  defp pick_variant([], _rollout, _bucket, default), do: default

  defp pick_variant([variant | rest], rollout, bucket, default) do
    case Map.fetch(rollout, variant) do
      :error ->
        pick_variant(rest, rollout, bucket, default)

      {:ok, pct} ->
        if bucket < pct do
          variant
        else
          pick_variant(rest, rollout, bucket - pct, default)
        end
    end
  end
end
