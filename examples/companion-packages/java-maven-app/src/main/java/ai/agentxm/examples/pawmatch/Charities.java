package ai.agentxm.examples.pawmatch;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/** Static catalogue of animal welfare charities. */
public final class Charities {

    /** A charity record. */
    public record Charity(
            String slug,
            String name,
            String focus,
            String description,
            String url,
            String ratingNote) {}

    public static final List<Charity> ALL = List.of(
            new Charity(
                    "best-friends",
                    "Best Friends Animal Society",
                    "shelters",
                    "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
                    "https://bestfriends.org/donate",
                    "Charity Navigator 4-star"),
            new Charity(
                    "petsmart-charities",
                    "PetSmart Charities",
                    "shelters",
                    "Grants to local shelters; spay/neuter; adoption events.",
                    "https://petsmartcharities.org/donate",
                    "Charity Navigator 4-star (96% program ratio)"),
            new Charity(
                    "brother-wolf",
                    "Brother Wolf Animal Rescue",
                    "rescue",
                    "Local rescue with national-impact outreach programs.",
                    "https://bwar.org/donate",
                    "Charity Navigator 4-star, GuideStar Platinum"),
            new Charity(
                    "animal-welfare-institute",
                    "Animal Welfare Institute",
                    "policy",
                    "Policy and advocacy reducing cruelty inflicted on animals.",
                    "https://awionline.org/donate",
                    "Charity Navigator 4-star"),
            new Charity(
                    "aspca",
                    "ASPCA",
                    "shelters",
                    "Adoption, anti-cruelty programs, and animal welfare advocacy.",
                    "https://www.aspca.org/donate",
                    "Charity Navigator 4-star"));

    public static final String DISCLAIMER =
            "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving.";

    private static final Map<String, Charity> BY_SLUG;

    static {
        Map<String, Charity> bySlug = new LinkedHashMap<>();
        for (Charity charity : ALL) {
            bySlug.put(charity.slug(), charity);
        }
        BY_SLUG = Map.copyOf(bySlug);
    }

    private Charities() {}

    public static Optional<Charity> findBySlug(String slug) {
        return Optional.ofNullable(BY_SLUG.get(slug.toLowerCase(Locale.ROOT)));
    }

    public static List<Charity> filterByFocus(String focus) {
        String target = focus.toLowerCase(Locale.ROOT);
        if (target.equals("all")) {
            return ALL;
        }
        return ALL.stream()
                .filter(c -> c.focus().toLowerCase(Locale.ROOT).equals(target))
                .toList();
    }
}
