package ai.agentxm.examples.pawmatch

data class Pet(
    val slug: String,
    val name: String,
    val species: String,
    val breed: String,
    val ageYears: Int,
    val daysInShelter: Int,
    val tags: List<String>,
    val needs: String,
)

object Pets {
    private const val LONG_STAY_THRESHOLD = 120

    val all: List<Pet> = listOf(
        Pet(
            slug = "biscuit",
            name = "Biscuit",
            species = "dog",
            breed = "Beagle mix",
            ageYears = 4,
            daysInShelter = 12,
            tags = listOf("playful", "social", "good-with-kids"),
            needs = "Daily walks; loves squeaky toys.",
        ),
        Pet(
            slug = "pepper",
            name = "Pepper",
            species = "cat",
            breed = "Domestic Shorthair",
            ageYears = 8,
            daysInShelter = 247,
            tags = listOf("mellow", "lap-cat", "solo"),
            needs = "Quiet home preferred; no other cats.",
        ),
        Pet(
            slug = "marigold",
            name = "Marigold",
            species = "dog",
            breed = "Senior Labrador",
            ageYears = 11,
            daysInShelter = 89,
            tags = listOf("calm", "gentle", "low-energy"),
            needs = "Joint supplements; short walks only.",
        ),
        Pet(
            slug = "tofu",
            name = "Tofu",
            species = "rabbit",
            breed = "Holland Lop",
            ageYears = 2,
            daysInShelter = 31,
            tags = listOf("curious", "social"),
            needs = "Roomy enclosure and unlimited hay.",
        ),
        Pet(
            slug = "otis",
            name = "Otis",
            species = "dog",
            breed = "Pittie mix",
            ageYears = 5,
            daysInShelter = 156,
            tags = listOf("gentle", "good-with-kids", "no-cats"),
            needs = "Cat-free home; loves toddlers.",
        ),
        Pet(
            slug = "juniper",
            name = "Juniper",
            species = "cat",
            breed = "Tortoiseshell",
            ageYears = 3,
            daysInShelter = 22,
            tags = listOf("vocal", "spunky", "solo"),
            needs = "Only cat in the household, please.",
        ),
        Pet(
            slug = "maple",
            name = "Maple",
            species = "dog",
            breed = "Mini Australian Shepherd",
            ageYears = 1,
            daysInShelter = 6,
            tags = listOf("high-energy", "smart", "needs-training"),
            needs = "Training class strongly recommended.",
        ),
        Pet(
            slug = "clover",
            name = "Clover & Sage",
            species = "guinea-pig",
            breed = "Bonded pair",
            ageYears = 1,
            daysInShelter = 18,
            tags = listOf("social", "bonded-pair"),
            needs = "Must adopt together — bonded for life.",
        ),
    )

    private val bySlug: Map<String, Pet> = all.associateBy { it.slug }

    fun isLongStay(pet: Pet): Boolean = pet.daysInShelter >= LONG_STAY_THRESHOLD

    fun findBySlug(slug: String): Pet? = bySlug[slug.lowercase()]

    fun filterBySpecies(species: String?): List<Pet> {
        if (species == null) return all
        val target = species.lowercase()
        return all.filter { it.species.lowercase() == target }
    }
}
