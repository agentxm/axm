# pawmatch: adoptable pet catalogue.

#' Pet catalogue and lookup helpers.
#'
#' All pets are static, fictional example data for the PawMatch CLI demo.
#' @export
pawmatch_pets <- function() {
  .pets_all
}

# Long-stay threshold: any pet in the shelter 120+ days.
.pet_long_stay_days <- 120L

.make_pet <- function(slug, name, species, breed, age_years, days_in_shelter, tags, needs) {
  list(
    slug = slug,
    name = name,
    species = species,
    breed = breed,
    age_years = age_years,
    days_in_shelter = days_in_shelter,
    tags = tags,
    needs = needs,
    long_stay = days_in_shelter >= .pet_long_stay_days
  )
}

.pets_all <- list(
  .make_pet("biscuit", "Biscuit", "dog", "Beagle mix", 4L, 12L,
            c("playful", "social", "good-with-kids"),
            "Daily walks; loves squeaky toys."),
  .make_pet("pepper", "Pepper", "cat", "Domestic Shorthair", 8L, 247L,
            c("mellow", "lap-cat", "solo"),
            "Quiet home preferred; no other cats."),
  .make_pet("marigold", "Marigold", "dog", "Senior Labrador", 11L, 89L,
            c("calm", "gentle", "low-energy"),
            "Joint supplements; short walks only."),
  .make_pet("tofu", "Tofu", "rabbit", "Holland Lop", 2L, 31L,
            c("curious", "social"),
            "Roomy enclosure and unlimited hay."),
  .make_pet("otis", "Otis", "dog", "Pittie mix", 5L, 156L,
            c("gentle", "good-with-kids", "no-cats"),
            "Cat-free home; loves toddlers."),
  .make_pet("juniper", "Juniper", "cat", "Tortoiseshell", 3L, 22L,
            c("vocal", "spunky", "solo"),
            "Only cat in the household, please."),
  .make_pet("maple", "Maple", "dog", "Mini Australian Shepherd", 1L, 6L,
            c("high-energy", "smart", "needs-training"),
            "Training class strongly recommended."),
  .make_pet("clover", "Clover & Sage", "guinea-pig", "Bonded pair", 1L, 18L,
            c("social", "bonded-pair"),
            "Must adopt together — bonded for life.")
)

# Internal helpers.
.pet_find <- function(slug) {
  if (is.null(slug) || !nzchar(slug)) {
    return(NULL)
  }
  target <- tolower(slug)
  for (pet in .pets_all) {
    if (tolower(pet$slug) == target) {
      return(pet)
    }
  }
  NULL
}

.pet_filter_species <- function(species) {
  if (is.null(species) || !nzchar(species)) {
    return(.pets_all)
  }
  target <- tolower(species)
  Filter(function(p) tolower(p$species) == target, .pets_all)
}
