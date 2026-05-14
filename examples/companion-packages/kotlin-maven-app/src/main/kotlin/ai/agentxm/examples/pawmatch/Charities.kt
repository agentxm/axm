package ai.agentxm.examples.pawmatch

data class Charity(
    val slug: String,
    val name: String,
    val focus: String,
    val description: String,
    val url: String,
    val ratingNote: String,
)

object Charities {
    val all: List<Charity> = listOf(
        Charity(
            slug = "best-friends",
            name = "Best Friends Animal Society",
            focus = "shelters",
            description = "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
            url = "https://bestfriends.org/donate",
            ratingNote = "Charity Navigator 4-star",
        ),
        Charity(
            slug = "petsmart-charities",
            name = "PetSmart Charities",
            focus = "shelters",
            description = "Grants to local shelters; spay/neuter; adoption events.",
            url = "https://petsmartcharities.org/donate",
            ratingNote = "Charity Navigator 4-star (96% program ratio)",
        ),
        Charity(
            slug = "brother-wolf",
            name = "Brother Wolf Animal Rescue",
            focus = "rescue",
            description = "Local rescue with national-impact outreach programs.",
            url = "https://bwar.org/donate",
            ratingNote = "Charity Navigator 4-star, GuideStar Platinum",
        ),
        Charity(
            slug = "animal-welfare-institute",
            name = "Animal Welfare Institute",
            focus = "policy",
            description = "Policy and advocacy reducing cruelty inflicted on animals.",
            url = "https://awionline.org/donate",
            ratingNote = "Charity Navigator 4-star",
        ),
        Charity(
            slug = "aspca",
            name = "ASPCA",
            focus = "shelters",
            description = "Adoption, anti-cruelty programs, and animal welfare advocacy.",
            url = "https://www.aspca.org/donate",
            ratingNote = "Charity Navigator 4-star",
        ),
    )

    const val DISCLAIMER: String =
        "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving."

    private val bySlug: Map<String, Charity> = all.associateBy { it.slug }

    fun findBySlug(slug: String): Charity? = bySlug[slug.lowercase()]

    fun filterByFocus(focus: String): List<Charity> {
        if (focus.equals("all", ignoreCase = true)) return all
        val target = focus.lowercase()
        return all.filter { it.focus.lowercase() == target }
    }
}
