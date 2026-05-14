defmodule AgentXM.Examples.PawMatch.CLI do
  @moduledoc """
  PawMatch CLI entry point. Implements the eight subcommands that exercise
  the nine TinyFlags flag seams used by the companion AXM skills.

  Output and error streams, the flag context, and the URL opener are
  configurable so the CLI can be exercised under ExUnit with captured I/O.
  """

  alias AgentXM.Examples.PawMatch.{Charities, Flags, Match, Pets, Variants}
  alias AgentXM.Examples.TinyFlags

  @type opts :: %{
          required(:flags) => TinyFlags.t(),
          required(:context) => map(),
          required(:out) => IO.device(),
          required(:err) => IO.device(),
          required(:open_url) => (String.t() -> :ok | {:error, term()})
        }

  @doc "Escript entry point."
  @spec main([String.t()]) :: no_return()
  def main(args) do
    code = run(args, default_opts())
    System.halt(code)
  end

  @doc """
  Run PawMatch with the given args. `opts` may override `:flags`, `:context`,
  `:out`, `:err`, and `:open_url`; missing keys fall back to the defaults
  returned by `default_opts/0`.
  """
  @spec run([String.t()], map()) :: non_neg_integer()
  def run(args, opts \\ %{}) when is_list(args) do
    opts = Map.merge(default_opts(), opts)

    case args do
      [] ->
        write_usage(opts)
        1

      [sub | rest] ->
        dispatch(sub, rest, opts)
    end
  end

  @doc "Default CLI options. Tests typically override `:out`, `:err`, and `:open_url`."
  @spec default_opts() :: opts()
  def default_opts do
    %{
      flags: Flags.build(),
      context: %{id: default_session_id()},
      out: :stdio,
      err: :stderr,
      open_url: &open_url_default/1
    }
  end

  defp dispatch("browse", rest, opts), do: run_browse(rest, opts)
  defp dispatch("show", rest, opts), do: run_show(rest, opts)
  defp dispatch("match", rest, opts), do: run_match(rest, opts)
  defp dispatch("apply", rest, opts), do: run_apply(rest, opts)
  defp dispatch("fees", _rest, opts), do: run_fees(opts)
  defp dispatch("return-support", _rest, opts), do: run_return_support(opts)
  defp dispatch("donate", rest, opts), do: run_donate(rest, opts)
  defp dispatch(help, _rest, opts) when help in ["-h", "--help", "help"] do
    write_usage(opts)
    0
  end

  defp dispatch(other, _rest, opts) do
    IO.puts(opts.err, "pawmatch: unknown command #{inspect(other)}")
    IO.puts(opts.err, "")
    write_usage(opts)
    2
  end

  defp write_usage(opts) do
    IO.puts(opts.out, "pawmatch — community pet adoption CLI.")
    IO.puts(opts.out, "")
    IO.puts(opts.out, "Commands:")
    IO.puts(opts.out, "  browse [--species <s>]   List adoptable pets")
    IO.puts(opts.out, "  show <pet>               Show details for a pet")
    IO.puts(opts.out, "  match [factors]          Match pets to your lifestyle")
    IO.puts(opts.out, "  apply <pet>              Start an adoption application")
    IO.puts(opts.out, "  fees                     Show adoption fees")
    IO.puts(opts.out, "  return-support           Show return-support information")
    IO.puts(opts.out, "  donate [<slug>] [--focus <f>] [--open]")
    IO.puts(opts.out, "                           Browse animal-welfare charities to support")
  end

  # ── browse ──────────────────────────────────────────────────────────────

  defp run_browse(args, opts) do
    {parsed, _rest, _invalid} =
      OptionParser.parse(args, strict: [species: :string])

    species = Keyword.get(parsed, :species, "")
    browse(species, opts)
  end

  @doc "Run the `browse` command."
  @spec browse(String.t(), opts()) :: non_neg_integer()
  def browse(species, opts) do
    pets = Pets.filter_by_species(species)

    if pets == [] do
      IO.puts(opts.out, "No adoptable pets found for species '#{species}'.")
      0
    else
      with {:ok, highlight} <- TinyFlags.enabled(opts.flags, Flags.long_stay_highlight(), opts.context),
           {:ok, style_str} <- TinyFlags.variant(opts.flags, Flags.pet_card_style(), opts.context),
           {:ok, style} <- Variants.parse_pet_card_style(style_str) do
        if highlight do
          case longest_stay_pet(pets) do
            nil ->
              :ok

            pet ->
              IO.puts(
                opts.out,
                "★ Featured long-stay friend — please consider #{pet.name}!"
              )

              IO.puts(opts.out, "")
          end
        end

        Enum.each(pets, &render_pet(&1, style, opts.out))
        0
      else
        {:error, reason} -> flag_error(reason, opts)
      end
    end
  end

  defp longest_stay_pet(pets) do
    pets
    |> Enum.filter(&Pets.long_stay?/1)
    |> Enum.max_by(& &1.days_in_shelter, fn -> nil end)
  end

  # ── show ────────────────────────────────────────────────────────────────

  defp run_show([], opts) do
    IO.puts(opts.err, "usage: pawmatch show <pet>")
    2
  end

  defp run_show([slug | _], opts), do: show(slug, opts)

  @doc "Run the `show` command."
  @spec show(String.t(), opts()) :: non_neg_integer()
  def show(slug, opts) do
    case Pets.find_by_slug(slug) do
      :error ->
        IO.puts(opts.err, "Unknown pet '#{slug}'. Try 'pawmatch browse'.")
        1

      {:ok, pet} ->
        render_pet(pet, :detailed, opts.out)
        IO.puts(opts.out, "  Needs: #{pet.needs}")
        tag = if Pets.long_stay?(pet), do: " (long-stay)", else: ""
        IO.puts(opts.out, "  Days in shelter: #{pet.days_in_shelter}#{tag}")
        0
    end
  end

  # ── match ───────────────────────────────────────────────────────────────

  defp run_match(args, opts) do
    {parsed, _rest, _invalid} =
      OptionParser.parse(args,
        strict: [
          "has-kids": :boolean,
          "quiet-home": :boolean,
          active: :boolean,
          "first-time": :boolean,
          "multiple-pets": :boolean,
          "small-home": :boolean
        ]
      )

    prefs = %Match{
      has_kids: Keyword.get(parsed, :"has-kids", false),
      quiet_home: Keyword.get(parsed, :"quiet-home", false),
      active: Keyword.get(parsed, :active, false),
      first_time: Keyword.get(parsed, :"first-time", false),
      multiple_pets: Keyword.get(parsed, :"multiple-pets", false),
      small_home: Keyword.get(parsed, :"small-home", false)
    }

    match(prefs, opts)
  end

  @doc "Run the `match` command."
  @spec match(Match.t(), opts()) :: non_neg_integer()
  def match(%Match{} = prefs, opts) do
    with {:ok, strategy_str} <-
           TinyFlags.variant(opts.flags, Flags.recommendation_strategy(), opts.context),
         {:ok, strategy} <- Variants.parse_strategy(strategy_str),
         {:ok, depth_str} <-
           TinyFlags.variant(opts.flags, Flags.match_quiz_depth(), opts.context),
         {:ok, depth} <- Variants.parse_depth(depth_str) do
      factors = Match.factors_for_depth(depth)
      wants = Match.preferred_tags(prefs, factors)

      IO.puts(
        opts.out,
        "Strategy: #{strategy_str} • Quiz depth: #{depth_str} (#{length(factors)} factor(s) considered)"
      )

      if Match.empty?(prefs) do
        IO.puts(
          opts.out,
          "(no preference flags provided — try --has-kids --quiet-home --active --first-time)"
        )
      end

      IO.puts(opts.out, "")

      ranked = rank_pets(Pets.all(), strategy, wants)

      ranked
      |> Enum.take(3)
      |> Enum.each(fn pet ->
        IO.puts(
          opts.out,
          "  • #{pet.name} (#{pet.breed}, #{pet.age_years}y) — #{Enum.join(pet.tags, ", ")}"
        )
      end)

      IO.puts(opts.out, "")
      IO.puts(opts.out, "Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
      0
    else
      {:error, reason} -> flag_error(reason, opts)
    end
  end

  defp rank_pets(pets, :popularity, _wants) do
    Enum.sort_by(pets, &Match.count_tag_matches(&1.tags, Match.popularity_tags()), :desc)
  end

  defp rank_pets(pets, :longest_stay, _wants) do
    Enum.sort_by(pets, & &1.days_in_shelter, :desc)
  end

  defp rank_pets(pets, :match_quiz, wants) do
    Enum.sort_by(pets, &Match.count_tag_matches(&1.tags, wants), :desc)
  end

  # ── apply ───────────────────────────────────────────────────────────────

  defp run_apply([], opts) do
    IO.puts(opts.err, "usage: pawmatch apply <pet>")
    2
  end

  defp run_apply([slug | _], opts), do: apply_for(slug, opts)

  @doc "Run the `apply` command."
  @spec apply_for(String.t(), opts()) :: non_neg_integer()
  def apply_for(slug, opts) do
    case Pets.find_by_slug(slug) do
      :error ->
        IO.puts(opts.err, "Unknown pet '#{slug}'. Try 'pawmatch browse'.")
        1

      {:ok, pet} ->
        with {:ok, followup} <-
               TinyFlags.enabled(opts.flags, Flags.home_check_followup(), opts.context),
             {:ok, suggest_donate} <-
               TinyFlags.enabled(
                 opts.flags,
                 Flags.suggest_donate_after_adoption(),
                 opts.context
               ) do
          IO.puts(opts.out, "Adoption application for #{pet.name}")
          IO.puts(opts.out, "")
          IO.puts(opts.out, "Next steps:")
          IO.puts(opts.out, "  1. Application reviewed by an adoption counselor (1–2 days).")
          IO.puts(opts.out, "  2. Meet-and-greet scheduled at the shelter.")
          IO.puts(opts.out, "  3. 48-hour reflection period before finalizing.")

          IO.puts(
            opts.out,
            "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip."
          )

          if followup do
            IO.puts(
              opts.out,
              "  5. Two-week follow-up check from a counselor to see how you're settling in."
            )
          end

          IO.puts(opts.out, "")
          IO.puts(opts.out, "Returns are always accepted, no questions asked.")

          if suggest_donate do
            IO.puts(opts.out, "")

            IO.puts(
              opts.out,
              "If #{pet.name} brings you joy, please consider donating to a shelter:"
            )

            IO.puts(opts.out, "  pawmatch donate")
          end

          0
        else
          {:error, reason} -> flag_error(reason, opts)
        end
    end
  end

  # ── fees ────────────────────────────────────────────────────────────────

  @doc "Run the `fees` command."
  @spec run_fees(opts()) :: non_neg_integer()
  def run_fees(opts) do
    case TinyFlags.enabled(opts.flags, Flags.fee_breakdown_detailed(), opts.context) do
      {:ok, detailed} ->
        IO.puts(opts.out, "Adoption fees")
        IO.puts(opts.out, "")

        if detailed do
          IO.puts(opts.out, "  Dog adoption — $150 total:")
          IO.puts(opts.out, "    $60   spay / neuter surgery")
          IO.puts(opts.out, "    $45   core vaccinations")
          IO.puts(opts.out, "    $25   microchip and registration")
          IO.puts(opts.out, "    $20   intake exam and deworming")
          IO.puts(opts.out, "")
          IO.puts(opts.out, "  Cat adoption — $90 total:")
          IO.puts(opts.out, "    $50   spay / neuter surgery")
          IO.puts(opts.out, "    $25   core vaccinations")
          IO.puts(opts.out, "    $15   microchip and registration")
          IO.puts(opts.out, "")
          IO.puts(opts.out, "  Small animal — $35 total (intake exam + microchip).")
        else
          IO.puts(opts.out, "  Dog adoption           $150")
          IO.puts(opts.out, "  Cat adoption            $90")
          IO.puts(opts.out, "  Small animal            $35")
          IO.puts(opts.out, "")
          IO.puts(opts.out, "  Fees cover spay/neuter, vaccines, and microchip.")
        end

        IO.puts(opts.out, "")
        IO.puts(opts.out, "No one is turned away for inability to pay — ask about our subsidy fund.")
        0

      {:error, reason} ->
        flag_error(reason, opts)
    end
  end

  # ── return-support ──────────────────────────────────────────────────────

  @doc "Run the `return-support` command."
  @spec run_return_support(opts()) :: non_neg_integer()
  def run_return_support(opts) do
    IO.puts(opts.out, "Return support")
    IO.puts(opts.out, "")
    IO.puts(opts.out, "If your adoption isn't working out, we're here to help.")
    IO.puts(opts.out, "  • Free behavior consultation with our trainers.")
    IO.puts(opts.out, "  • No-judgment returns at any time — your pet stays in our care.")
    IO.puts(opts.out, "  • Connections to low-cost vet and food assistance programs.")
    IO.puts(opts.out, "")

    IO.puts(
      opts.out,
      "Returning a pet is not a failure. Reach out as soon as you'd like support."
    )

    0
  end

  # ── donate ──────────────────────────────────────────────────────────────

  defp run_donate(args, opts) do
    {slug, rest} = split_leading_positional(args)

    {parsed, leftover, _invalid} =
      OptionParser.parse(rest, strict: [focus: :string, open: :boolean])

    slug = if slug == "" and leftover != [], do: hd(leftover), else: slug
    focus_override = Keyword.get(parsed, :focus)
    open? = Keyword.get(parsed, :open, false)

    donate(slug, focus_override, open?, opts)
  end

  @doc "Run the `donate` command."
  @spec donate(String.t(), String.t() | nil, boolean(), opts()) :: non_neg_integer()
  def donate(slug, focus_override, open?, opts) do
    with {:ok, default_focus_str} <-
           TinyFlags.variant(opts.flags, Flags.donate_focus_default(), opts.context),
         {:ok, _default_focus} <- Variants.parse_focus(default_focus_str),
         {:ok, show_ratings} <-
           TinyFlags.enabled(opts.flags, Flags.show_charity_ratings(), opts.context) do
      focus = focus_override || default_focus_str

      if slug != "" do
        case Charities.find_by_slug(slug) do
          :error ->
            IO.puts(opts.err, "Unknown charity '#{slug}'.")
            1

          {:ok, charity} ->
            if open? do
              open_url(charity.url, opts)
            else
              render_charity(charity, show_ratings, opts.out)
              0
            end
        end
      else
        list = Charities.filter_by_focus(focus)
        IO.puts(opts.out, "Animal-welfare charities (focus: #{focus})")
        IO.puts(opts.out, "")

        Enum.each(list, fn charity ->
          render_charity(charity, show_ratings, opts.out)
          IO.puts(opts.out, "")
        end)

        IO.puts(opts.out, Charities.disclaimer())

        if not show_ratings do
          IO.puts(
            opts.out,
            "Ratings hidden — set show-charity-ratings to surface them inline."
          )
        end

        0
      end
    else
      {:error, reason} -> flag_error(reason, opts)
    end
  end

  defp split_leading_positional([]), do: {"", []}
  defp split_leading_positional(["-" <> _ = first | rest]), do: {"", [first | rest]}
  defp split_leading_positional([first | rest]), do: {first, rest}

  # ── helpers ─────────────────────────────────────────────────────────────

  defp render_pet(%Pets{} = pet, style, out) do
    badge = if Pets.long_stay?(pet), do: " ★", else: ""

    case style do
      :compact ->
        IO.puts(
          out,
          "  #{String.pad_trailing(pet.slug, 10)} #{String.pad_trailing(pet.name, 14)} #{String.pad_trailing(pet.species, 10)} #{pet.age_years}y#{badge}"
        )

      :playful ->
        IO.puts(
          out,
          "  🐾 #{pet.name}#{badge} — a #{pet.age_years}-year-old #{String.downcase(pet.breed)} who is #{Enum.join(pet.tags, " & ")}."
        )

      _detailed ->
        IO.puts(out, "  #{pet.name}#{badge}  [#{pet.slug}]")
        IO.puts(out, "    #{pet.breed}, #{pet.age_years} years old")
        IO.puts(out, "    Tags: #{Enum.join(pet.tags, ", ")}")
        IO.puts(out, "")
    end
  end

  defp render_charity(%Charities{} = charity, show_ratings, out) do
    IO.puts(out, "  #{charity.name}  [#{charity.slug}]")
    IO.puts(out, "    Focus: #{charity.focus}")
    IO.puts(out, "    #{charity.description}")
    IO.puts(out, "    Donate: #{charity.url}")

    if show_ratings do
      IO.puts(out, "    Rating: #{charity.rating_note}")
    end
  end

  defp open_url(url, opts) do
    case opts.open_url.(url) do
      :ok ->
        0

      {:error, reason} ->
        IO.puts(opts.err, "Unable to open browser (#{inspect(reason)}). URL: #{url}")
        1
    end
  end

  defp flag_error(reason, opts) do
    IO.puts(opts.err, "pawmatch: #{reason}")
    1
  end

  defp default_session_id do
    Enum.find_value(["USER", "USERNAME", "LOGNAME"], "anonymous", fn name ->
      case System.get_env(name) do
        nil -> nil
        "" -> nil
        value -> value
      end
    end)
  end

  defp open_url_default(url) when is_binary(url) do
    {cmd, args} =
      case :os.type() do
        {:unix, :darwin} -> {"open", [url]}
        {:win32, _} -> {"cmd", ["/c", "start", "", url]}
        _ -> {"xdg-open", [url]}
      end

    try do
      _ = System.cmd(cmd, args)
      :ok
    rescue
      e -> {:error, e}
    end
  end
end
