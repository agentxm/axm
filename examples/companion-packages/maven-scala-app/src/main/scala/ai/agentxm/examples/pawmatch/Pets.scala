package ai.agentxm.examples.pawmatch

/** A pet record. */
final case class Pet(
    slug: String,
    name: String,
    species: String,
    breed: String,
    ageYears: Int,
    daysInShelter: Int,
    tags: List[String],
    needs: String,
)

/** Static catalogue of adoptable pets. */
object Pets:
  private val LongStayThreshold = 120

  val all: List[Pet] = List(
    Pet(
      slug = "biscuit",
      name = "Biscuit",
      species = "dog",
      breed = "Beagle mix",
      ageYears = 4,
      daysInShelter = 12,
      tags = List("playful", "social", "good-with-kids"),
      needs = "Daily walks; loves squeaky toys.",
    ),
    Pet(
      slug = "pepper",
      name = "Pepper",
      species = "cat",
      breed = "Domestic Shorthair",
      ageYears = 8,
      daysInShelter = 247,
      tags = List("mellow", "lap-cat", "solo"),
      needs = "Quiet home preferred; no other cats.",
    ),
    Pet(
      slug = "marigold",
      name = "Marigold",
      species = "dog",
      breed = "Senior Labrador",
      ageYears = 11,
      daysInShelter = 89,
      tags = List("calm", "gentle", "low-energy"),
      needs = "Joint supplements; short walks only.",
    ),
    Pet(
      slug = "tofu",
      name = "Tofu",
      species = "rabbit",
      breed = "Holland Lop",
      ageYears = 2,
      daysInShelter = 31,
      tags = List("curious", "social"),
      needs = "Roomy enclosure and unlimited hay.",
    ),
    Pet(
      slug = "otis",
      name = "Otis",
      species = "dog",
      breed = "Pittie mix",
      ageYears = 5,
      daysInShelter = 156,
      tags = List("gentle", "good-with-kids", "no-cats"),
      needs = "Cat-free home; loves toddlers.",
    ),
    Pet(
      slug = "juniper",
      name = "Juniper",
      species = "cat",
      breed = "Tortoiseshell",
      ageYears = 3,
      daysInShelter = 22,
      tags = List("vocal", "spunky", "solo"),
      needs = "Only cat in the household, please.",
    ),
    Pet(
      slug = "maple",
      name = "Maple",
      species = "dog",
      breed = "Mini Australian Shepherd",
      ageYears = 1,
      daysInShelter = 6,
      tags = List("high-energy", "smart", "needs-training"),
      needs = "Training class strongly recommended.",
    ),
    Pet(
      slug = "clover",
      name = "Clover & Sage",
      species = "guinea-pig",
      breed = "Bonded pair",
      ageYears = 1,
      daysInShelter = 18,
      tags = List("social", "bonded-pair"),
      needs = "Must adopt together — bonded for life.",
    ),
  )

  private val bySlug: Map[String, Pet] = all.map(p => p.slug -> p).toMap

  def isLongStay(pet: Pet): Boolean = pet.daysInShelter >= LongStayThreshold

  def findBySlug(slug: String): Option[Pet] = bySlug.get(slug.toLowerCase)

  def filterBySpecies(species: Option[String]): List[Pet] =
    species match
      case None => all
      case Some(s) =>
        val target = s.toLowerCase
        all.filter(_.species.toLowerCase == target)
