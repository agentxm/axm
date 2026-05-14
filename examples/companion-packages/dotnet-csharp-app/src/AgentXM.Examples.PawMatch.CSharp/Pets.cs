using System.Collections.Immutable;

namespace AgentXM.Examples.PawMatch.CSharp;

internal sealed record Pet(
    string Slug,
    string Name,
    string Species,
    string Breed,
    int AgeYears,
    int DaysInShelter,
    ImmutableArray<string> Tags,
    string Needs)
{
    public bool IsLongStay => DaysInShelter >= 120;
}

internal static class Pets
{
    public static readonly ImmutableArray<Pet> All =
    [
        new("biscuit", "Biscuit", "dog", "Beagle mix", 4, 12,
            ["playful", "social", "good-with-kids"],
            "Daily walks; loves squeaky toys."),
        new("pepper", "Pepper", "cat", "Domestic Shorthair", 8, 247,
            ["mellow", "lap-cat", "solo"],
            "Quiet home preferred; no other cats."),
        new("marigold", "Marigold", "dog", "Senior Labrador", 11, 89,
            ["calm", "gentle", "low-energy"],
            "Joint supplements; short walks only."),
        new("tofu", "Tofu", "rabbit", "Holland Lop", 2, 31,
            ["curious", "social"],
            "Roomy enclosure and unlimited hay."),
        new("otis", "Otis", "dog", "Pittie mix", 5, 156,
            ["gentle", "good-with-kids", "no-cats"],
            "Cat-free home; loves toddlers."),
        new("juniper", "Juniper", "cat", "Tortoiseshell", 3, 22,
            ["vocal", "spunky", "solo"],
            "Only cat in the household, please."),
        new("maple", "Maple", "dog", "Mini Australian Shepherd", 1, 6,
            ["high-energy", "smart", "needs-training"],
            "Training class strongly recommended."),
        new("clover", "Clover & Sage", "guinea-pig", "Bonded pair", 1, 18,
            ["social", "bonded-pair"],
            "Must adopt together — bonded for life."),
    ];

    public static Pet? FindBySlug(string slug) =>
        All.FirstOrDefault(p => string.Equals(p.Slug, slug, StringComparison.OrdinalIgnoreCase));

    public static IEnumerable<Pet> FilterBySpecies(string? species) =>
        species is null
            ? All
            : All.Where(p => string.Equals(p.Species, species, StringComparison.OrdinalIgnoreCase));
}
