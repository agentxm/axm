using System.Collections.Frozen;
using System.Collections.Immutable;
using System.CommandLine;
using System.CommandLine.Help;
using System.Diagnostics;
using AgentXM.Examples.TinyFlags.CSharp;
using TinyFlagsClient = AgentXM.Examples.TinyFlags.CSharp.TinyFlags;

namespace AgentXM.Examples.PawMatch.CSharp;

internal sealed class PawMatchCli
{
    private static readonly ImmutableArray<(string Flag, ImmutableArray<string> Tags)> AllFactors =
    [
        ("has-kids", ["good-with-kids", "gentle"]),
        ("quiet-home", ["mellow", "calm", "solo", "lap-cat"]),
        ("active", ["high-energy", "playful"]),
        ("first-time", ["gentle", "calm", "low-energy"]),
        ("multiple-pets", ["social"]),
        ("small-home", ["lap-cat", "solo", "low-energy"]),
    ];

    private static readonly FrozenSet<string> PopularityTags =
        new[] { "social", "good-with-kids", "calm", "mellow", "gentle" }
            .ToFrozenSet(StringComparer.Ordinal);

    private readonly TinyFlagsClient flags;
    private readonly EvaluationContext context;
    private readonly TextWriter @out;
    private readonly TextWriter err;

    public PawMatchCli(
        TinyFlagsClient? flags = null,
        EvaluationContext? context = null,
        TextWriter? @out = null,
        TextWriter? err = null)
    {
        this.flags = flags ?? PawMatchFlags.Create();
        this.context = context ?? new EvaluationContext(SessionId: Environment.UserName);
        this.@out = @out ?? Console.Out;
        this.err = err ?? Console.Error;
    }

    public RootCommand BuildRootCommand()
    {
        var speciesOption = new Option<string?>("--species")
        {
            Description = "Filter by species (dog|cat|rabbit|guinea-pig).",
        };
        var browse = new Command("browse", "Browse adoptable pets.");
        browse.Options.Add(speciesOption);
        browse.SetAction(result => Browse(result.GetValue(speciesOption)));

        var showPet = new Argument<string>("pet")
        {
            Description = "Pet slug (see 'pawmatch browse').",
        };
        var show = new Command("show", "Show details for a pet.");
        show.Arguments.Add(showPet);
        show.SetAction(result => Show(result.GetValue(showPet) ?? string.Empty));

        var hasKids = new Option<bool>("--has-kids") { Description = "Family with children." };
        var quietHome = new Option<bool>("--quiet-home") { Description = "Quiet, calm household." };
        var active = new Option<bool>("--active") { Description = "Active, outdoor lifestyle." };
        var firstTime = new Option<bool>("--first-time") { Description = "First-time pet adopter." };
        var multiplePets = new Option<bool>("--multiple-pets") { Description = "Other pets at home." };
        var smallHome = new Option<bool>("--small-home") { Description = "Small home or apartment." };
        var match = new Command("match", "Match pets to your lifestyle.");
        match.Options.Add(hasKids);
        match.Options.Add(quietHome);
        match.Options.Add(active);
        match.Options.Add(firstTime);
        match.Options.Add(multiplePets);
        match.Options.Add(smallHome);
        match.SetAction(result => Match(new MatchPreferences(
            HasKids: result.GetValue(hasKids),
            QuietHome: result.GetValue(quietHome),
            Active: result.GetValue(active),
            FirstTime: result.GetValue(firstTime),
            MultiplePets: result.GetValue(multiplePets),
            SmallHome: result.GetValue(smallHome))));

        var applyPet = new Argument<string>("pet") { Description = "Pet slug to apply for." };
        var apply = new Command("apply", "Start an adoption application.");
        apply.Arguments.Add(applyPet);
        apply.SetAction(result => Apply(result.GetValue(applyPet) ?? string.Empty));

        var fees = new Command("fees", "Show adoption fees.");
        fees.SetAction(_ => Fees());

        var returnSupport = new Command("return-support", "Return support information.");
        returnSupport.SetAction(_ => ReturnSupport());

        var charityArg = new Argument<string?>("charity")
        {
            Description = "Charity slug (optional — omit to list charities).",
            Arity = ArgumentArity.ZeroOrOne,
        };
        var focusOption = new Option<string?>("--focus")
        {
            Description = "Charity focus (all|shelters|rescue|policy).",
        };
        var openOption = new Option<bool>("--open")
        {
            Description = "Open the charity's donation URL in a browser.",
        };
        var donate = new Command("donate", "Browse animal-welfare charities to support.");
        donate.Arguments.Add(charityArg);
        donate.Options.Add(focusOption);
        donate.Options.Add(openOption);
        donate.SetAction(result => Donate(
            result.GetValue(charityArg),
            result.GetValue(focusOption),
            result.GetValue(openOption)));

        var root = new RootCommand("pawmatch — community pet adoption CLI.");
        root.Subcommands.Add(browse);
        root.Subcommands.Add(show);
        root.Subcommands.Add(match);
        root.Subcommands.Add(apply);
        root.Subcommands.Add(fees);
        root.Subcommands.Add(returnSupport);
        root.Subcommands.Add(donate);
        root.SetAction(result =>
        {
            new HelpAction().Invoke(result);
            return 0;
        });
        return root;
    }

    private int Browse(string? species)
    {
        var pets = Pets.FilterBySpecies(species).ToList();
        if (pets.Count == 0)
        {
            @out.WriteLine($"No adoptable pets found for species '{species}'.");
            return 0;
        }

        if (flags.Enabled(PawMatchFlags.LongStayHighlight, context))
        {
            var longStay = pets
                .Where(p => p.IsLongStay)
                .OrderByDescending(p => p.DaysInShelter)
                .FirstOrDefault();
            if (longStay is not null)
            {
                @out.WriteLine($"★ Featured long-stay friend — please consider {longStay.Name}!");
                @out.WriteLine();
            }
        }

        var style = Variants.Parse<PetCardStyle>(flags.Variant(PawMatchFlags.PetCardStyle, context));
        foreach (var pet in pets)
        {
            RenderPet(pet, style);
        }
        return 0;
    }

    private int Show(string slug)
    {
        var pet = Pets.FindBySlug(slug);
        if (pet is null)
        {
            err.WriteLine($"Unknown pet '{slug}'. Try 'pawmatch browse'.");
            return 1;
        }

        RenderPet(pet, PetCardStyle.Detailed);
        @out.WriteLine($"  Needs: {pet.Needs}");
        @out.WriteLine($"  Days in shelter: {pet.DaysInShelter}{(pet.IsLongStay ? " (long-stay)" : string.Empty)}");
        return 0;
    }

    private int Match(MatchPreferences preferences)
    {
        var strategy = Variants.Parse<MatchStrategy>(flags.Variant(PawMatchFlags.RecommendationStrategy, context));
        var depth = Variants.Parse<MatchDepth>(flags.Variant(PawMatchFlags.MatchQuizDepth, context));
        var factors = FactorsForDepth(depth);
        var userFlags = preferences.ToFlagSet();
        var wantsBuilder = new HashSet<string>(StringComparer.Ordinal);
        foreach (var factor in factors)
        {
            if (!userFlags.Contains(factor.Flag)) continue;
            foreach (var tag in factor.Tags)
            {
                wantsBuilder.Add(tag);
            }
        }
        var wants = wantsBuilder.ToFrozenSet(StringComparer.Ordinal);

        @out.WriteLine($"Strategy: {Variants.ToKebab(strategy)} • Quiz depth: {Variants.ToKebab(depth)} ({factors.Length} factor(s) considered)");
        if (preferences.IsEmpty)
        {
            @out.WriteLine("(no preference flags provided — try --has-kids --quiet-home --active --first-time)");
        }
        @out.WriteLine();

        IEnumerable<Pet> ranked = strategy switch
        {
            MatchStrategy.Popularity => Pets.All.OrderByDescending(p => p.Tags.Count(PopularityTags.Contains)),
            MatchStrategy.LongestStay => Pets.All.OrderByDescending(p => p.DaysInShelter),
            _ => Pets.All.OrderByDescending(p => p.Tags.Count(wants.Contains)),
        };

        foreach (var pet in ranked.Take(3))
        {
            @out.WriteLine($"  • {pet.Name} ({pet.Breed}, {pet.AgeYears}y) — {string.Join(", ", pet.Tags)}");
        }

        @out.WriteLine();
        @out.WriteLine("Adoption is a conversation — book a meet-and-greet to see if it's a fit.");
        return 0;
    }

    private int Apply(string slug)
    {
        var pet = Pets.FindBySlug(slug);
        if (pet is null)
        {
            err.WriteLine($"Unknown pet '{slug}'. Try 'pawmatch browse'.");
            return 1;
        }

        @out.WriteLine($"Adoption application for {pet.Name}");
        @out.WriteLine();
        @out.WriteLine("""
            Next steps:
              1. Application reviewed by an adoption counselor (1–2 days).
              2. Meet-and-greet scheduled at the shelter.
              3. 48-hour reflection period before finalizing.
              4. Take-home day — fees cover spay/neuter, vaccines, and microchip.
            """);

        if (flags.Enabled(PawMatchFlags.HomeCheckFollowup, context))
        {
            @out.WriteLine("  5. Two-week follow-up check from a counselor to see how you're settling in.");
        }

        @out.WriteLine();
        @out.WriteLine("Returns are always accepted, no questions asked.");

        if (flags.Enabled(PawMatchFlags.SuggestDonateAfterAdoption, context))
        {
            @out.WriteLine();
            @out.WriteLine($"If {pet.Name} brings you joy, please consider donating to a shelter:");
            @out.WriteLine("  pawmatch donate");
        }
        return 0;
    }

    private int Fees()
    {
        @out.WriteLine("Adoption fees");
        @out.WriteLine();
        if (flags.Enabled(PawMatchFlags.FeeBreakdownDetailed, context))
        {
            @out.WriteLine("""
                  Dog adoption — $150 total:
                    $60   spay / neuter surgery
                    $45   core vaccinations
                    $25   microchip and registration
                    $20   intake exam and deworming

                  Cat adoption — $90 total:
                    $50   spay / neuter surgery
                    $25   core vaccinations
                    $15   microchip and registration

                  Small animal — $35 total (intake exam + microchip).
                """);
        }
        else
        {
            @out.WriteLine("""
                  Dog adoption           $150
                  Cat adoption            $90
                  Small animal            $35

                  Fees cover spay/neuter, vaccines, and microchip.
                """);
        }

        @out.WriteLine();
        @out.WriteLine("No one is turned away for inability to pay — ask about our subsidy fund.");
        return 0;
    }

    private int ReturnSupport()
    {
        @out.WriteLine("""
            Return support

            If your adoption isn't working out, we're here to help.
              • Free behavior consultation with our trainers.
              • No-judgment returns at any time — your pet stays in our care.
              • Connections to low-cost vet and food assistance programs.

            Returning a pet is not a failure. Reach out as soon as you'd like support.
            """);
        return 0;
    }

    private int Donate(string? charitySlug, string? focusOverride, bool open)
    {
        var defaultFocus = Variants.Parse<DonateFocus>(flags.Variant(PawMatchFlags.DonateFocusDefault, context));
        var focus = focusOverride ?? Variants.ToKebab(defaultFocus);
        var showRatings = flags.Enabled(PawMatchFlags.ShowCharityRatings, context);

        if (charitySlug is not null)
        {
            var charity = Charities.FindBySlug(charitySlug);
            if (charity is null)
            {
                err.WriteLine($"Unknown charity '{charitySlug}'.");
                return 1;
            }

            if (open)
            {
                return OpenUrl(charity.Url);
            }

            RenderCharity(charity, showRatings);
            return 0;
        }

        var list = Charities.FilterByFocus(focus).ToList();
        @out.WriteLine($"Animal-welfare charities (focus: {focus})");
        @out.WriteLine();
        foreach (var charity in list)
        {
            RenderCharity(charity, showRatings);
            @out.WriteLine();
        }

        @out.WriteLine(Charities.Disclaimer);
        if (!showRatings)
        {
            @out.WriteLine("Ratings hidden — set show-charity-ratings to surface them inline.");
        }
        return 0;
    }

    private void RenderPet(Pet pet, PetCardStyle style)
    {
        var longStayBadge = pet.IsLongStay ? " ★" : string.Empty;
        switch (style)
        {
            case PetCardStyle.Compact:
                @out.WriteLine($"  {pet.Slug,-10} {pet.Name,-14} {pet.Species,-10} {pet.AgeYears}y{longStayBadge}");
                break;
            case PetCardStyle.Playful:
                @out.WriteLine($"  🐾 {pet.Name}{longStayBadge} — a {pet.AgeYears}-year-old {pet.Breed.ToLowerInvariant()} who is {string.Join(" & ", pet.Tags)}.");
                break;
            case PetCardStyle.Detailed:
            default:
                @out.WriteLine($"  {pet.Name}{longStayBadge}  [{pet.Slug}]");
                @out.WriteLine($"    {pet.Breed}, {pet.AgeYears} years old");
                @out.WriteLine($"    Tags: {string.Join(", ", pet.Tags)}");
                @out.WriteLine();
                break;
        }
    }

    private void RenderCharity(Charity charity, bool showRatings)
    {
        @out.WriteLine($"  {charity.Name}  [{charity.Slug}]");
        @out.WriteLine($"    Focus: {charity.Focus}");
        @out.WriteLine($"    {charity.Description}");
        @out.WriteLine($"    Donate: {charity.Url}");
        if (showRatings)
        {
            @out.WriteLine($"    Rating: {charity.RatingNote}");
        }
    }

    private int OpenUrl(string url)
    {
        try
        {
            ProcessStartInfo psi;
            if (OperatingSystem.IsWindows())
            {
                psi = new ProcessStartInfo(url) { UseShellExecute = true };
            }
            else if (OperatingSystem.IsMacOS())
            {
                psi = new ProcessStartInfo("open", url);
            }
            else if (OperatingSystem.IsLinux())
            {
                psi = new ProcessStartInfo("xdg-open", url);
            }
            else
            {
                psi = new ProcessStartInfo(url) { UseShellExecute = true };
            }
            Process.Start(psi);
            return 0;
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException or PlatformNotSupportedException)
        {
            err.WriteLine($"Unable to open browser ({ex.GetType().Name}). URL: {url}");
            return 1;
        }
    }

    private static ReadOnlySpan<(string Flag, ImmutableArray<string> Tags)> FactorsForDepth(MatchDepth depth)
    {
        var take = depth switch
        {
            MatchDepth.Short => 2,
            MatchDepth.Thorough => 6,
            _ => 4,
        };
        return AllFactors.AsSpan()[..take];
    }
}
