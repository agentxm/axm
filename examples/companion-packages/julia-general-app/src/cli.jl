module Cli

using AgentXMExampleTinyFlags
using ..Pets
using ..Charities
using ..Flags

export run_cli

const USAGE = """
pawmatch — community pet-adoption CLI.

Usage: pawmatch <command> [options]

Commands:
  browse [--species SPECIES]   List adoptable pets
  show <pet>                   Show details for a pet
  match [match flags]          Match pets to your lifestyle
  apply <pet>                  Start an adoption application
  fees                         Show adoption fees
  return-support               No-judgment return information
  donate [--focus FOCUS]       Browse charities to support
  donate <slug> --open         Open a charity's donation URL
"""

const POPULARITY_TAGS = ["social", "good-with-kids", "calm", "mellow", "gentle"]

# Ordered (factor flag, matching pet tags) tuples — the quiz depth variant
# controls how many factors are considered.
const ALL_FACTORS = [
    ("has-kids",       ["good-with-kids", "gentle"]),
    ("quiet-home",     ["mellow", "calm", "solo", "lap-cat"]),
    ("active",         ["high-energy", "playful"]),
    ("first-time",     ["gentle", "calm", "low-energy"]),
    ("multiple-pets",  ["social"]),
    ("small-home",     ["lap-cat", "solo", "low-energy"]),
]

"""
    run_cli(argv; stdout=stdout, stderr=stderr) -> Int

Run the PawMatch CLI against `argv`. Returns the exit status as an `Int`.
"""
function run_cli(argv; stdout::IO=Base.stdout, stderr::IO=Base.stderr)
    argv = Vector{String}(argv)
    if isempty(argv) || argv[1] == "--help" || argv[1] == "-h"
        println(stdout, USAGE)
        return 0
    end

    command = popfirst!(argv)
    if command == "browse"
        return cmd_browse(argv, stdout, stderr)
    elseif command == "show"
        return cmd_show(argv, stdout, stderr)
    elseif command == "match"
        return cmd_match(argv, stdout, stderr)
    elseif command == "apply"
        return cmd_apply(argv, stdout, stderr)
    elseif command == "fees"
        return cmd_fees(argv, stdout, stderr)
    elseif command == "return-support"
        return cmd_return_support(argv, stdout, stderr)
    elseif command == "donate"
        return cmd_donate(argv, stdout, stderr)
    else
        println(stderr, "Unknown command: ", command)
        println(stderr, USAGE)
        return 1
    end
end

# ── Argument helpers ─────────────────────────────────────────────────

"""
Pop a `--key VALUE` (or `--key=VALUE`) option out of `argv`, returning the
value or `nothing`. Modifies `argv` in place.
"""
function take_option!(argv::Vector{String}, key::AbstractString)
    i = 1
    while i <= length(argv)
        arg = argv[i]
        if arg == key
            i + 1 > length(argv) && return nothing
            value = argv[i + 1]
            deleteat!(argv, i:(i + 1))
            return value
        elseif startswith(arg, key * "=")
            value = arg[(length(key) + 2):end]
            deleteat!(argv, i)
            return value
        end
        i += 1
    end
    return nothing
end

"""
Pop a `--flag` boolean switch out of `argv`. Modifies `argv` in place.
"""
function take_switch!(argv::Vector{String}, key::AbstractString)
    idx = findfirst(==(key), argv)
    idx === nothing && return false
    deleteat!(argv, idx)
    return true
end

# ── Commands ─────────────────────────────────────────────────────────

function cmd_browse(argv::Vector{String}, stdout::IO, _stderr::IO)
    species = take_option!(argv, "--species")
    matching = Pets.filter_by_species(species)
    if isempty(matching)
        println(stdout, "No adoptable pets found for species '", species, "'.")
        return 0
    end

    registry = Flags.build_registry()
    ctx = context()

    if tf_bool(registry, Flags.LONG_STAY_HIGHLIGHT; context=ctx)
        long_stays = sort(filter(Pets.long_stay, matching); by=p -> -p.days_in_shelter)
        if !isempty(long_stays)
            featured = long_stays[1]
            println(stdout, "* Featured long-stay friend — please consider ", featured.name, "!")
            println(stdout)
        end
    end

    style = tf_variant(registry, Flags.PET_CARD_STYLE; context=ctx)
    for pet in matching
        render_pet(pet, style, stdout)
    end
    return 0
end

function cmd_show(argv::Vector{String}, stdout::IO, stderr::IO)
    isempty(argv) && (println(stderr, "Usage: pawmatch show <pet>"); return 1)
    slug = popfirst!(argv)
    pet = Pets.find_by_slug(slug)
    if pet === nothing
        println(stderr, "Unknown pet '", slug, "'. Try 'pawmatch browse'.")
        return 1
    end

    render_pet(pet, "detailed", stdout)
    println(stdout, "  Needs: ", pet.needs)
    suffix = Pets.long_stay(pet) ? " (long-stay)" : ""
    println(stdout, "  Days in shelter: ", pet.days_in_shelter, suffix)
    return 0
end

function cmd_match(argv::Vector{String}, stdout::IO, _stderr::IO)
    preferences = Dict{String,Bool}(
        "has-kids"      => take_switch!(argv, "--has-kids"),
        "quiet-home"    => take_switch!(argv, "--quiet-home"),
        "active"        => take_switch!(argv, "--active"),
        "first-time"    => take_switch!(argv, "--first-time"),
        "multiple-pets" => take_switch!(argv, "--multiple-pets"),
        "small-home"    => take_switch!(argv, "--small-home"),
    )

    registry = Flags.build_registry()
    ctx = context()
    strategy = tf_variant(registry, Flags.RECOMMENDATION_STRATEGY; context=ctx)
    depth = tf_variant(registry, Flags.MATCH_QUIZ_DEPTH; context=ctx)
    factors = factors_for_depth(depth)

    wants = String[]
    for (factor, tags) in factors
        preferences[factor] && append!(wants, tags)
    end

    println(stdout, "Strategy: ", strategy, " • Quiz depth: ", depth,
        " (", length(factors), " factor(s) considered)")
    if !any(values(preferences))
        println(stdout,
            "(no preference flags provided — try --has-kids --quiet-home --active --first-time)")
    end
    println(stdout)

    ranked = if strategy == "popularity"
        sort(Pets.ALL; by=p -> -count(t -> t in POPULARITY_TAGS, p.tags))
    elseif strategy == "longest-stay"
        sort(Pets.ALL; by=p -> -p.days_in_shelter)
    else
        sort(Pets.ALL; by=p -> -count(t -> t in wants, p.tags))
    end

    for pet in first(ranked, 3)
        println(stdout, "  • ", pet.name, " (", pet.breed, ", ", pet.age_years, "y) — ",
            join(pet.tags, ", "))
    end

    println(stdout)
    println(stdout, "Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
    return 0
end

function cmd_apply(argv::Vector{String}, stdout::IO, stderr::IO)
    isempty(argv) && (println(stderr, "Usage: pawmatch apply <pet>"); return 1)
    slug = popfirst!(argv)
    pet = Pets.find_by_slug(slug)
    if pet === nothing
        println(stderr, "Unknown pet '", slug, "'. Try 'pawmatch browse'.")
        return 1
    end

    println(stdout, "Adoption application for ", pet.name)
    println(stdout)
    println(stdout, "Next steps:")
    println(stdout, "  1. Application reviewed by an adoption counselor (1-2 days).")
    println(stdout, "  2. Meet-and-greet scheduled at the shelter.")
    println(stdout, "  3. 48-hour reflection period before finalizing.")
    println(stdout, "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.")

    registry = Flags.build_registry()
    ctx = context()
    if tf_bool(registry, Flags.HOME_CHECK_FOLLOWUP; context=ctx)
        println(stdout,
            "  5. Two-week follow-up check from a counselor to see how you're settling in.")
    end

    println(stdout)
    println(stdout, "Returns are always accepted, no questions asked.")

    if tf_bool(registry, Flags.SUGGEST_DONATE_AFTER_ADOPTION; context=ctx)
        println(stdout)
        println(stdout, "If ", pet.name, " brings you joy, please consider donating to a shelter:")
        println(stdout, "  pawmatch donate")
    end
    return 0
end

function cmd_fees(_argv::Vector{String}, stdout::IO, _stderr::IO)
    registry = Flags.build_registry()
    ctx = context()

    println(stdout, "Adoption fees")
    println(stdout)
    if tf_bool(registry, Flags.FEE_BREAKDOWN_DETAILED; context=ctx)
        println(stdout, "  Dog adoption — \$150 total:")
        println(stdout, "    \$60   spay / neuter surgery")
        println(stdout, "    \$45   core vaccinations")
        println(stdout, "    \$25   microchip and registration")
        println(stdout, "    \$20   intake exam and deworming")
        println(stdout)
        println(stdout, "  Cat adoption — \$90 total:")
        println(stdout, "    \$50   spay / neuter surgery")
        println(stdout, "    \$25   core vaccinations")
        println(stdout, "    \$15   microchip and registration")
        println(stdout)
        println(stdout, "  Small animal — \$35 total (intake exam + microchip).")
    else
        println(stdout, "  Dog adoption           \$150")
        println(stdout, "  Cat adoption            \$90")
        println(stdout, "  Small animal            \$35")
        println(stdout)
        println(stdout, "  Fees cover spay/neuter, vaccines, and microchip.")
    end

    println(stdout)
    println(stdout, "No one is turned away for inability to pay — ask about our subsidy fund.")
    return 0
end

function cmd_return_support(_argv::Vector{String}, stdout::IO, _stderr::IO)
    println(stdout, "Return support")
    println(stdout)
    println(stdout, "If your adoption isn't working out, we're here to help.")
    println(stdout, "  • Free behavior consultation with our trainers.")
    println(stdout, "  • No-judgment returns at any time — your pet stays in our care.")
    println(stdout, "  • Connections to low-cost vet and food assistance programs.")
    println(stdout)
    println(stdout, "Returning a pet is not a failure. Reach out as soon as you'd like support.")
    return 0
end

function cmd_donate(argv::Vector{String}, stdout::IO, stderr::IO)
    focus = take_option!(argv, "--focus")
    open_flag = take_switch!(argv, "--open")
    charity_slug = isempty(argv) ? nothing : popfirst!(argv)

    registry = Flags.build_registry()
    ctx = context()
    default_focus = tf_variant(registry, Flags.DONATE_FOCUS_DEFAULT; context=ctx)
    effective_focus = focus === nothing ? default_focus : focus
    show_ratings = tf_bool(registry, Flags.SHOW_CHARITY_RATINGS; context=ctx)

    if charity_slug !== nothing
        target = Charities.find_by_slug(charity_slug)
        if target === nothing
            println(stderr, "Unknown charity '", charity_slug, "'.")
            return 1
        end
        if open_flag
            return open_url(target.url, stdout, stderr)
        end
        render_charity(target, show_ratings, stdout)
        return 0
    end

    listing = Charities.filter_by_focus(effective_focus)
    println(stdout, "Animal-welfare charities (focus: ", effective_focus, ")")
    println(stdout)
    for c in listing
        render_charity(c, show_ratings, stdout)
        println(stdout)
    end
    println(stdout, Charities.DISCLAIMER)
    if !show_ratings
        println(stdout, "Ratings hidden — set show-charity-ratings to surface them inline.")
    end
    return 0
end

# ── Helpers ──────────────────────────────────────────────────────────

function context()
    sid = something(
        get(ENV, "USER", nothing),
        get(ENV, "USERNAME", nothing),
        get(ENV, "LOGNAME", nothing),
        "anonymous",
    )
    return Context(session_id=sid)
end

function factors_for_depth(depth::AbstractString)
    take = depth == "short" ? 2 :
           depth == "thorough" ? 6 : 4
    return ALL_FACTORS[1:min(take, length(ALL_FACTORS))]
end

function render_pet(pet, style::AbstractString, stdout::IO)
    badge = Pets.long_stay(pet) ? " *" : ""
    if style == "compact"
        println(stdout, "  ",
            rpad(pet.slug, 10), " ",
            rpad(pet.name, 14), " ",
            rpad(pet.species, 10), " ",
            pet.age_years, "y", badge)
    elseif style == "playful"
        tag_phrase = join(pet.tags, " & ")
        println(stdout, "  paw ", pet.name, badge, " — a ", pet.age_years,
            "-year-old ", lowercase(pet.breed), " who is ", tag_phrase, ".")
    else
        println(stdout, "  ", pet.name, badge, "  [", pet.slug, "]")
        println(stdout, "    ", pet.breed, ", ", pet.age_years, " years old")
        println(stdout, "    Tags: ", join(pet.tags, ", "))
        println(stdout)
    end
end

function render_charity(charity, show_ratings::Bool, stdout::IO)
    println(stdout, "  ", charity.name, "  [", charity.slug, "]")
    println(stdout, "    Focus: ", charity.focus)
    println(stdout, "    ", charity.description)
    println(stdout, "    Donate: ", charity.url)
    if show_ratings
        println(stdout, "    Rating: ", charity.rating_note)
    end
end

function open_url(url::AbstractString, _stdout::IO, stderr::IO)
    cmd = if Sys.isapple()
        `open $url`
    elseif Sys.islinux()
        `xdg-open $url`
    elseif Sys.iswindows()
        `cmd /c start "" $url`
    else
        nothing
    end

    if cmd === nothing
        println(stderr, "Unable to open browser on this platform. URL: ", url)
        return 1
    end

    try
        run(pipeline(cmd; stdout=devnull, stderr=devnull); wait=false)
        return 0
    catch err
        println(stderr, "Unable to open browser (", typeof(err), "). URL: ", url)
        return 1
    end
end

end # module Cli
