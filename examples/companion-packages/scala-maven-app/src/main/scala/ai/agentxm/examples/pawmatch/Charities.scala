package ai.agentxm.examples.pawmatch

/** A charity record. */
final case class Charity(
    slug: String,
    name: String,
    focus: String,
    description: String,
    url: String,
    ratingNote: String,
)

/** Static catalogue of animal welfare charities. */
object Charities:
  val all: List[Charity] = List(
    Charity(
      slug = "best-friends",
      name = "Best Friends Animal Society",
      focus = "shelters",
      description =
        "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
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

  val Disclaimer: String =
    "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving."

  private val bySlug: Map[String, Charity] = all.map(c => c.slug -> c).toMap

  def findBySlug(slug: String): Option[Charity] = bySlug.get(slug.toLowerCase)

  def filterByFocus(focus: String): List[Charity] =
    if focus.equalsIgnoreCase("all") then all
    else
      val target = focus.toLowerCase
      all.filter(_.focus.toLowerCase == target)
