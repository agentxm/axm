package ai.agentxm.examples.pawmatch;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/** Static catalogue of adoptable pets. */
public final class Pets {

    private static final int LONG_STAY_THRESHOLD = 120;

    /** A pet record. */
    public record Pet(
            String slug,
            String name,
            String species,
            String breed,
            int ageYears,
            int daysInShelter,
            List<String> tags,
            String needs) {}

    public static final List<Pet> ALL = List.of(
            new Pet(
                    "biscuit",
                    "Biscuit",
                    "dog",
                    "Beagle mix",
                    4,
                    12,
                    List.of("playful", "social", "good-with-kids"),
                    "Daily walks; loves squeaky toys."),
            new Pet(
                    "pepper",
                    "Pepper",
                    "cat",
                    "Domestic Shorthair",
                    8,
                    247,
                    List.of("mellow", "lap-cat", "solo"),
                    "Quiet home preferred; no other cats."),
            new Pet(
                    "marigold",
                    "Marigold",
                    "dog",
                    "Senior Labrador",
                    11,
                    89,
                    List.of("calm", "gentle", "low-energy"),
                    "Joint supplements; short walks only."),
            new Pet(
                    "tofu",
                    "Tofu",
                    "rabbit",
                    "Holland Lop",
                    2,
                    31,
                    List.of("curious", "social"),
                    "Roomy enclosure and unlimited hay."),
            new Pet(
                    "otis",
                    "Otis",
                    "dog",
                    "Pittie mix",
                    5,
                    156,
                    List.of("gentle", "good-with-kids", "no-cats"),
                    "Cat-free home; loves toddlers."),
            new Pet(
                    "juniper",
                    "Juniper",
                    "cat",
                    "Tortoiseshell",
                    3,
                    22,
                    List.of("vocal", "spunky", "solo"),
                    "Only cat in the household, please."),
            new Pet(
                    "maple",
                    "Maple",
                    "dog",
                    "Mini Australian Shepherd",
                    1,
                    6,
                    List.of("high-energy", "smart", "needs-training"),
                    "Training class strongly recommended."),
            new Pet(
                    "clover",
                    "Clover & Sage",
                    "guinea-pig",
                    "Bonded pair",
                    1,
                    18,
                    List.of("social", "bonded-pair"),
                    "Must adopt together — bonded for life."));

    private static final Map<String, Pet> BY_SLUG;

    static {
        Map<String, Pet> bySlug = new LinkedHashMap<>();
        for (Pet pet : ALL) {
            bySlug.put(pet.slug(), pet);
        }
        BY_SLUG = Map.copyOf(bySlug);
    }

    private Pets() {}

    public static boolean isLongStay(Pet pet) {
        return pet.daysInShelter() >= LONG_STAY_THRESHOLD;
    }

    public static Optional<Pet> findBySlug(String slug) {
        return Optional.ofNullable(BY_SLUG.get(slug.toLowerCase(Locale.ROOT)));
    }

    public static List<Pet> filterBySpecies(Optional<String> species) {
        if (species.isEmpty()) {
            return ALL;
        }
        String target = species.get().toLowerCase(Locale.ROOT);
        return ALL.stream()
                .filter(p -> p.species().toLowerCase(Locale.ROOT).equals(target))
                .toList();
    }
}
