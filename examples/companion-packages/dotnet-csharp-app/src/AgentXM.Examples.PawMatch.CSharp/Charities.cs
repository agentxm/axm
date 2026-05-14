using System.Collections.Immutable;

namespace AgentXM.Examples.PawMatch.CSharp;

internal sealed record Charity(
    string Slug,
    string Name,
    string Focus,
    string Description,
    string Url,
    string RatingNote);

internal static class Charities
{
    public static readonly ImmutableArray<Charity> All =
    [
        new("best-friends", "Best Friends Animal Society", "shelters",
            "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
            "https://bestfriends.org/donate",
            "Charity Navigator 4-star"),
        new("petsmart-charities", "PetSmart Charities", "shelters",
            "Grants to local shelters; spay/neuter; adoption events.",
            "https://petsmartcharities.org/donate",
            "Charity Navigator 4-star (96% program ratio)"),
        new("brother-wolf", "Brother Wolf Animal Rescue", "rescue",
            "Local rescue with national-impact outreach programs.",
            "https://bwar.org/donate",
            "Charity Navigator 4-star, GuideStar Platinum"),
        new("animal-welfare-institute", "Animal Welfare Institute", "policy",
            "Policy and advocacy reducing cruelty inflicted on animals.",
            "https://awionline.org/donate",
            "Charity Navigator 4-star"),
        new("aspca", "ASPCA", "shelters",
            "Adoption, anti-cruelty programs, and animal welfare advocacy.",
            "https://www.aspca.org/donate",
            "Charity Navigator 4-star"),
    ];

    public const string Disclaimer =
        "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving.";

    public static Charity? FindBySlug(string slug) =>
        All.FirstOrDefault(c => string.Equals(c.Slug, slug, StringComparison.OrdinalIgnoreCase));

    public static IEnumerable<Charity> FilterByFocus(string focus) =>
        string.Equals(focus, "all", StringComparison.OrdinalIgnoreCase)
            ? All
            : All.Where(c => string.Equals(c.Focus, focus, StringComparison.OrdinalIgnoreCase));
}
