# pawmatch: animal welfare charity directory.

#' Charity directory.
#'
#' Curated, static list of well-known animal welfare organizations.
#' Example data — verify current ratings on Charity Navigator or
#' GuideStar before giving.
#' @export
pawmatch_charities <- function() {
  .charities_all
}

.make_charity <- function(slug, name, focus, description, url, rating_note) {
  list(
    slug = slug,
    name = name,
    focus = focus,
    description = description,
    url = url,
    rating_note = rating_note
  )
}

.charities_all <- list(
  .make_charity("best-friends", "Best Friends Animal Society", "shelters",
                "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
                "https://bestfriends.org/donate",
                "Charity Navigator 4-star"),
  .make_charity("petsmart-charities", "PetSmart Charities", "shelters",
                "Grants to local shelters; spay/neuter; adoption events.",
                "https://petsmartcharities.org/donate",
                "Charity Navigator 4-star (96% program ratio)"),
  .make_charity("brother-wolf", "Brother Wolf Animal Rescue", "rescue",
                "Local rescue with national-impact outreach programs.",
                "https://bwar.org/donate",
                "Charity Navigator 4-star, GuideStar Platinum"),
  .make_charity("animal-welfare-institute", "Animal Welfare Institute", "policy",
                "Policy and advocacy reducing cruelty inflicted on animals.",
                "https://awionline.org/donate",
                "Charity Navigator 4-star"),
  .make_charity("aspca", "ASPCA", "shelters",
                "Adoption, anti-cruelty programs, and animal welfare advocacy.",
                "https://www.aspca.org/donate",
                "Charity Navigator 4-star")
)

.charity_disclaimer <- paste0(
  "Curated example list — verify current ratings on Charity Navigator or ",
  "GuideStar before giving."
)

.charity_find <- function(slug) {
  if (is.null(slug) || !nzchar(slug)) {
    return(NULL)
  }
  target <- tolower(slug)
  for (c in .charities_all) {
    if (tolower(c$slug) == target) {
      return(c)
    }
  }
  NULL
}

.charity_filter_focus <- function(focus) {
  if (is.null(focus) || !nzchar(focus) || tolower(focus) == "all") {
    return(.charities_all)
  }
  target <- tolower(focus)
  Filter(function(c) tolower(c$focus) == target, .charities_all)
}
