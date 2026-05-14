using System.Diagnostics;
using AgentXM.Examples.PawMatch.CSharp;
using AgentXM.Examples.TinyFlags.CSharp;

if (args.Length == 0 || args[0] is "-h" or "--help" or "help")
{
    PrintHelp();
    return 0;
}

var flags = PawMatchFlags.Create();
var parsed = ParseArgs(args.AsSpan(1));
var context = new EvaluationContext(SessionId: Environment.UserName);

return args[0].ToLowerInvariant() switch
{
    "browse" => Browse(),
    "show" => Show(),
    "match" => Match(),
    "apply" => Apply(),
    "fees" => Fees(),
    "return-support" => ReturnSupport(),
    "donate" => Donate(),
    _ => UnknownCommand(args[0]),
};

int Browse()
{
    var species = parsed.GetValueOrDefault("species");
    var pets = Pets.FilterBySpecies(species).ToList();
    if (pets.Count == 0)
    {
        Console.WriteLine($"No adoptable pets found for species '{species}'.");
        return 0;
    }

    if (flags.Enabled(PawMatchFlags.LongStayHighlight, context))
    {
        var longStay = pets.Where(p => p.IsLongStay).OrderByDescending(p => p.DaysInShelter).FirstOrDefault();
        if (longStay is not null)
        {
            Console.WriteLine($"★ Featured long-stay friend — please consider {longStay.Name}!");
            Console.WriteLine();
        }
    }

    var style = flags.Variant(PawMatchFlags.PetCardStyle, context);
    foreach (var pet in pets)
    {
        RenderPet(pet, style);
    }

    return 0;
}

int Show()
{
    if (parsed.Positional.Count == 0)
    {
        Console.Error.WriteLine("Usage: pawmatch show <pet>");
        return 1;
    }

    var pet = Pets.FindBySlug(parsed.Positional[0]);
    if (pet is null)
    {
        Console.Error.WriteLine($"Unknown pet '{parsed.Positional[0]}'. Try 'pawmatch browse'.");
        return 1;
    }

    RenderPet(pet, "detailed");
    Console.WriteLine($"  Needs: {pet.Needs}");
    Console.WriteLine($"  Days in shelter: {pet.DaysInShelter}{(pet.IsLongStay ? " (long-stay)" : string.Empty)}");
    return 0;
}

int Match()
{
    var strategy = flags.Variant(PawMatchFlags.RecommendationStrategy, context);
    var depth = flags.Variant(PawMatchFlags.MatchQuizDepth, context);
    var factors = QuizFactors(depth);
    var wants = factors.SelectMany(f => parsed.HasFlag(f.Flag) ? f.Tags : []).ToHashSet();

    Console.WriteLine($"Strategy: {strategy} • Quiz depth: {depth} ({factors.Count} factor(s) considered)");
    if (wants.Count == 0)
    {
        Console.WriteLine("(no preference flags provided — try --has-kids --quiet-home --active --first-time)");
    }
    Console.WriteLine();

    IEnumerable<Pet> ranked = strategy switch
    {
        "popularity" => Pets.All.OrderByDescending(p =>
            p.Tags.Count(t => t is "social" or "good-with-kids" or "calm" or "mellow" or "gentle")),
        "longest-stay" => Pets.All.OrderByDescending(p => p.DaysInShelter),
        _ => Pets.All.OrderByDescending(p => p.Tags.Count(wants.Contains)),
    };

    foreach (var pet in ranked.Take(3))
    {
        Console.WriteLine($"  • {pet.Name} ({pet.Breed}, {pet.AgeYears}y) — {string.Join(", ", pet.Tags)}");
    }

    Console.WriteLine();
    Console.WriteLine("Adoption is a conversation — book a meet-and-greet to see if it's a fit.");
    return 0;
}

int Apply()
{
    if (parsed.Positional.Count == 0)
    {
        Console.Error.WriteLine("Usage: pawmatch apply <pet>");
        return 1;
    }

    var pet = Pets.FindBySlug(parsed.Positional[0]);
    if (pet is null)
    {
        Console.Error.WriteLine($"Unknown pet '{parsed.Positional[0]}'. Try 'pawmatch browse'.");
        return 1;
    }

    Console.WriteLine($"Adoption application for {pet.Name}");
    Console.WriteLine();
    Console.WriteLine("Next steps:");
    Console.WriteLine("  1. Application reviewed by an adoption counselor (1–2 days).");
    Console.WriteLine("  2. Meet-and-greet scheduled at the shelter.");
    Console.WriteLine("  3. 48-hour reflection period before finalizing.");
    Console.WriteLine("  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.");

    if (flags.Enabled(PawMatchFlags.HomeCheckFollowup, context))
    {
        Console.WriteLine("  5. Two-week follow-up check from a counselor to see how you're settling in.");
    }

    Console.WriteLine();
    Console.WriteLine("Returns are always accepted, no questions asked.");

    if (flags.Enabled(PawMatchFlags.SuggestDonateAfterAdoption, context))
    {
        Console.WriteLine();
        Console.WriteLine($"If {pet.Name} brings you joy, please consider donating to a shelter:");
        Console.WriteLine("  pawmatch donate");
    }

    return 0;
}

int Fees()
{
    Console.WriteLine("Adoption fees");
    Console.WriteLine();
    if (flags.Enabled(PawMatchFlags.FeeBreakdownDetailed, context))
    {
        Console.WriteLine("  Dog adoption — $150 total:");
        Console.WriteLine("    $60   spay / neuter surgery");
        Console.WriteLine("    $45   core vaccinations");
        Console.WriteLine("    $25   microchip and registration");
        Console.WriteLine("    $20   intake exam and deworming");
        Console.WriteLine();
        Console.WriteLine("  Cat adoption — $90 total:");
        Console.WriteLine("    $50   spay / neuter surgery");
        Console.WriteLine("    $25   core vaccinations");
        Console.WriteLine("    $15   microchip and registration");
        Console.WriteLine();
        Console.WriteLine("  Small animal — $35 total (intake exam + microchip).");
    }
    else
    {
        Console.WriteLine("  Dog adoption           $150");
        Console.WriteLine("  Cat adoption            $90");
        Console.WriteLine("  Small animal            $35");
        Console.WriteLine();
        Console.WriteLine("  Fees cover spay/neuter, vaccines, and microchip.");
    }

    Console.WriteLine();
    Console.WriteLine("No one is turned away for inability to pay — ask about our subsidy fund.");
    return 0;
}

int ReturnSupport()
{
    Console.WriteLine("Return support");
    Console.WriteLine();
    Console.WriteLine("If your adoption isn't working out, we're here to help.");
    Console.WriteLine("  • Free behavior consultation with our trainers.");
    Console.WriteLine("  • No-judgment returns at any time — your pet stays in our care.");
    Console.WriteLine("  • Connections to low-cost vet and food assistance programs.");
    Console.WriteLine();
    Console.WriteLine("Returning a pet is not a failure. Reach out as soon as you'd like support.");
    return 0;
}

int Donate()
{
    var defaultFocus = flags.Variant(PawMatchFlags.DonateFocusDefault, context);
    var focus = parsed.GetValueOrDefault("focus") ?? defaultFocus;
    var showRatings = flags.Enabled(PawMatchFlags.ShowCharityRatings, context);

    if (parsed.Positional.Count > 0)
    {
        var charity = Charities.FindBySlug(parsed.Positional[0]);
        if (charity is null)
        {
            Console.Error.WriteLine($"Unknown charity '{parsed.Positional[0]}'.");
            return 1;
        }

        if (parsed.HasFlag("open"))
        {
            return OpenUrl(charity.Url);
        }

        RenderCharity(charity, showRatings);
        return 0;
    }

    var list = Charities.FilterByFocus(focus).ToList();
    Console.WriteLine($"Animal-welfare charities (focus: {focus})");
    Console.WriteLine();
    foreach (var charity in list)
    {
        RenderCharity(charity, showRatings);
        Console.WriteLine();
    }

    Console.WriteLine(Charities.Disclaimer);
    if (!showRatings)
    {
        Console.WriteLine("Ratings hidden — set show-charity-ratings to surface them inline.");
    }
    return 0;
}

int UnknownCommand(string command)
{
    Console.Error.WriteLine($"Unknown command: {command}");
    Console.Error.WriteLine();
    PrintHelp();
    return 1;
}

static void PrintHelp()
{
    Console.WriteLine("pawmatch — community pet adoption CLI");
    Console.WriteLine();
    Console.WriteLine("Usage:");
    Console.WriteLine("  pawmatch browse [--species dog|cat|rabbit|guinea-pig]");
    Console.WriteLine("  pawmatch show <pet>");
    Console.WriteLine("  pawmatch match [--has-kids] [--quiet-home] [--active] [--first-time] [--multiple-pets] [--small-home]");
    Console.WriteLine("  pawmatch apply <pet>");
    Console.WriteLine("  pawmatch fees");
    Console.WriteLine("  pawmatch return-support");
    Console.WriteLine("  pawmatch donate [--focus all|shelters|rescue|policy]");
    Console.WriteLine("  pawmatch donate <slug> [--open]");
}

static void RenderPet(Pet pet, string style)
{
    var longStayBadge = pet.IsLongStay ? " ★" : string.Empty;
    switch (style)
    {
        case "compact":
            Console.WriteLine($"  {pet.Slug,-10} {pet.Name,-14} {pet.Species,-10} {pet.AgeYears}y{longStayBadge}");
            break;
        case "playful":
            Console.WriteLine($"  🐾 {pet.Name}{longStayBadge} — a {pet.AgeYears}-year-old {pet.Breed.ToLowerInvariant()} who is {string.Join(" & ", pet.Tags)}.");
            break;
        default:
            Console.WriteLine($"  {pet.Name}{longStayBadge}  [{pet.Slug}]");
            Console.WriteLine($"    {pet.Breed}, {pet.AgeYears} years old");
            Console.WriteLine($"    Tags: {string.Join(", ", pet.Tags)}");
            Console.WriteLine();
            break;
    }
}

static void RenderCharity(Charity charity, bool showRatings)
{
    Console.WriteLine($"  {charity.Name}  [{charity.Slug}]");
    Console.WriteLine($"    Focus: {charity.Focus}");
    Console.WriteLine($"    {charity.Description}");
    Console.WriteLine($"    Donate: {charity.Url}");
    if (showRatings)
    {
        Console.WriteLine($"    Rating: {charity.RatingNote}");
    }
}

static int OpenUrl(string url)
{
    try
    {
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        return 0;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Unable to open browser ({ex.GetType().Name}). URL: {url}");
        return 1;
    }
}

static IReadOnlyList<(string Flag, string[] Tags)> QuizFactors(string depth)
{
    var all = new (string Flag, string[] Tags)[]
    {
        ("has-kids", ["good-with-kids", "gentle"]),
        ("quiet-home", ["mellow", "calm", "solo", "lap-cat"]),
        ("active", ["high-energy", "playful"]),
        ("first-time", ["gentle", "calm", "low-energy"]),
        ("multiple-pets", ["social"]),
        ("small-home", ["lap-cat", "solo", "low-energy"]),
    };

    var take = depth switch
    {
        "short" => 2,
        "thorough" => 6,
        _ => 4,
    };

    return all.Take(take).ToList();
}

static ParsedArgs ParseArgs(ReadOnlySpan<string> args)
{
    var positional = new List<string>();
    var options = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);

    for (var i = 0; i < args.Length; i++)
    {
        var arg = args[i];
        if (!arg.StartsWith("--", StringComparison.Ordinal))
        {
            positional.Add(arg);
            continue;
        }

        var key = arg[2..];
        if (i + 1 < args.Length && !args[i + 1].StartsWith("--", StringComparison.Ordinal))
        {
            options[key] = args[i + 1];
            i++;
        }
        else
        {
            options[key] = null;
        }
    }

    return new ParsedArgs(positional, options);
}

internal sealed record ParsedArgs(List<string> Positional, Dictionary<string, string?> Options)
{
    public string? GetValueOrDefault(string key) =>
        Options.TryGetValue(key, out var value) ? value : null;

    public bool HasFlag(string key) => Options.ContainsKey(key);
}
