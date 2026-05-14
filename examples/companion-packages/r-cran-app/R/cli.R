# pawmatch: command-line entrypoint.
#
# All commands are implemented as functions that accept argv (a character
# vector), out (a connection or NULL = stdout), and err (a connection or
# NULL = stderr). Each returns an integer exit status.

.USAGE <- paste0(
  "pawmatch — community pet-adoption CLI.\n",
  "\n",
  "Usage: pawmatch <command> [options]\n",
  "\n",
  "Commands:\n",
  "  browse [--species SPECIES]   List adoptable pets\n",
  "  show <pet>                   Show details for a pet\n",
  "  match [match flags]          Match pets to your lifestyle\n",
  "  apply <pet>                  Start an adoption application\n",
  "  fees                         Show adoption fees\n",
  "  return-support               No-judgment return information\n",
  "  donate [--focus FOCUS]       Browse charities to support\n",
  "  donate <slug> --open         Open a charity's donation URL\n"
)

.POPULARITY_TAGS <- c("social", "good-with-kids", "calm", "mellow", "gentle")

# Ordered (factor flag, matching pet tags) pairs — the quiz depth variant
# controls how many factors are considered.
.ALL_FACTORS <- list(
  list(name = "has-kids",       tags = c("good-with-kids", "gentle")),
  list(name = "quiet-home",     tags = c("mellow", "calm", "solo", "lap-cat")),
  list(name = "active",         tags = c("high-energy", "playful")),
  list(name = "first-time",     tags = c("gentle", "calm", "low-energy")),
  list(name = "multiple-pets",  tags = c("social")),
  list(name = "small-home",     tags = c("lap-cat", "solo", "low-energy"))
)

# Internal: write a line to a connection (defaulting to stdout/stderr).
.emit <- function(conn, ...) {
  text <- paste0(...)
  if (is.null(conn)) {
    cat(text, "\n", sep = "")
  } else {
    cat(text, "\n", sep = "", file = conn)
  }
}

# Internal: emit a blank line.
.blank <- function(conn) .emit(conn, "")

# Internal: build a stable evaluation context from the current login.
.context <- function() {
  sid <- Sys.getenv("USER", unset = "")
  if (!nzchar(sid)) sid <- Sys.getenv("USERNAME", unset = "")
  if (!nzchar(sid)) {
    sid <- tryCatch(Sys.info()[["user"]], error = function(e) "")
  }
  if (!nzchar(sid) || is.na(sid)) sid <- "anonymous"
  tinyflags::tf_with_context(session_id = sid)
}

# Internal: parse a simple "--flag value" / "--flag" argv. Returns a list:
#   $opts (named list of flag values; TRUE for boolean flags)
#   $rest (character vector of unconsumed positional args)
.parse_args <- function(argv, value_flags = character(0), bool_flags = character(0)) {
  opts <- list()
  rest <- character(0)
  i <- 1L
  while (i <= length(argv)) {
    a <- argv[[i]]
    if (a %in% paste0("--", value_flags)) {
      name <- substring(a, 3L)
      i <- i + 1L
      if (i > length(argv)) {
        stop(sprintf("Missing value for --%s", name), call. = FALSE)
      }
      opts[[name]] <- argv[[i]]
      i <- i + 1L
    } else if (a %in% paste0("--", bool_flags)) {
      opts[[substring(a, 3L)]] <- TRUE
      i <- i + 1L
    } else {
      rest <- c(rest, a)
      i <- i + 1L
    }
  }
  list(opts = opts, rest = rest)
}

#' Run the pawmatch CLI.
#'
#' @param argv Character vector of command-line arguments (no program name).
#' @param out Connection for normal output (or NULL for stdout).
#' @param err Connection for error output (or NULL for stderr).
#' @return Integer exit status.
#' @export
pawmatch_run <- function(argv = commandArgs(trailingOnly = TRUE), out = NULL, err = NULL) {
  if (length(argv) == 0L || argv[[1L]] %in% c("--help", "-h")) {
    .emit(out, .USAGE)
    return(0L)
  }
  command <- argv[[1L]]
  rest <- if (length(argv) > 1L) argv[-1L] else character(0)
  switch(
    command,
    "browse"         = .cmd_browse(rest, out, err),
    "show"           = .cmd_show(rest, out, err),
    "match"          = .cmd_match(rest, out, err),
    "apply"          = .cmd_apply(rest, out, err),
    "fees"           = .cmd_fees(rest, out, err),
    "return-support" = .cmd_return_support(rest, out, err),
    "donate"         = .cmd_donate(rest, out, err),
    {
      .emit(err, "Unknown command: ", command)
      .emit(err, .USAGE)
      1L
    }
  )
}

.cmd_browse <- function(argv, out, err) {
  parsed <- .parse_args(argv, value_flags = "species")
  species <- parsed$opts$species
  matching <- .pet_filter_species(species)
  if (length(matching) == 0L) {
    .emit(out, "No adoptable pets found for species '", species, "'.")
    return(0L)
  }

  flags <- pawmatch_flags()
  ctx <- .context()

  if (tinyflags::tf_enabled(flags, .FLAG_LONG_STAY_HIGHLIGHT, ctx)) {
    long_stay <- Filter(function(p) p$long_stay, matching)
    if (length(long_stay) > 0L) {
      # Sort descending by days_in_shelter.
      ordered <- long_stay[order(-vapply(long_stay, function(p) p$days_in_shelter, integer(1)))]
      featured <- ordered[[1L]]
      .emit(out, "* Featured long-stay friend — please consider ", featured$name, "!")
      .blank(out)
    }
  }

  style <- tinyflags::tf_variant_value(flags, .FLAG_PET_CARD_STYLE, ctx)
  for (pet in matching) {
    .render_pet(pet, style, out)
  }
  0L
}

.cmd_show <- function(argv, out, err) {
  if (length(argv) == 0L) {
    .emit(err, "Usage: pawmatch show <pet>")
    return(1L)
  }
  slug <- argv[[1L]]
  pet <- .pet_find(slug)
  if (is.null(pet)) {
    .emit(err, "Unknown pet '", slug, "'. Try 'pawmatch browse'.")
    return(1L)
  }
  .render_pet(pet, "detailed", out)
  .emit(out, "  Needs: ", pet$needs)
  suffix <- if (pet$long_stay) " (long-stay)" else ""
  .emit(out, "  Days in shelter: ", pet$days_in_shelter, suffix)
  0L
}

.cmd_match <- function(argv, out, err) {
  preferences <- list(
    "has-kids"      = FALSE,
    "quiet-home"    = FALSE,
    "active"        = FALSE,
    "first-time"    = FALSE,
    "multiple-pets" = FALSE,
    "small-home"    = FALSE
  )
  bool_flags <- names(preferences)
  parsed <- .parse_args(argv, bool_flags = bool_flags)
  for (k in names(parsed$opts)) {
    if (k %in% bool_flags) preferences[[k]] <- TRUE
  }

  flags <- pawmatch_flags()
  ctx <- .context()
  strategy <- tinyflags::tf_variant_value(flags, .FLAG_RECOMMENDATION_STRATEGY, ctx)
  depth <- tinyflags::tf_variant_value(flags, .FLAG_MATCH_QUIZ_DEPTH, ctx)
  factors <- .factors_for_depth(depth)

  wants <- character(0)
  for (factor in factors) {
    if (isTRUE(preferences[[factor$name]])) {
      wants <- c(wants, factor$tags)
    }
  }

  .emit(out, "Strategy: ", strategy, " • Quiz depth: ", depth,
        " (", length(factors), " factor(s) considered)")
  if (!any(unlist(preferences))) {
    .emit(out, "(no preference flags provided — try --has-kids --quiet-home --active --first-time)")
  }
  .blank(out)

  ranked <-
    if (strategy == "popularity") {
      scores <- vapply(.pets_all,
                       function(p) sum(p$tags %in% .POPULARITY_TAGS),
                       integer(1))
      .pets_all[order(-scores)]
    } else if (strategy == "longest-stay") {
      .pets_all[order(-vapply(.pets_all, function(p) p$days_in_shelter, integer(1)))]
    } else {
      scores <- vapply(.pets_all,
                       function(p) sum(p$tags %in% wants),
                       integer(1))
      .pets_all[order(-scores)]
    }

  top <- ranked[seq_len(min(3L, length(ranked)))]
  for (pet in top) {
    .emit(out, "  • ", pet$name, " (", pet$breed, ", ", pet$age_years,
          "y) — ", paste(pet$tags, collapse = ", "))
  }
  .blank(out)
  .emit(out, "Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
  0L
}

.cmd_apply <- function(argv, out, err) {
  if (length(argv) == 0L) {
    .emit(err, "Usage: pawmatch apply <pet>")
    return(1L)
  }
  slug <- argv[[1L]]
  pet <- .pet_find(slug)
  if (is.null(pet)) {
    .emit(err, "Unknown pet '", slug, "'. Try 'pawmatch browse'.")
    return(1L)
  }
  .emit(out, "Adoption application for ", pet$name)
  .blank(out)
  .emit(out, "Next steps:")
  .emit(out, "  1. Application reviewed by an adoption counselor (1-2 days).")
  .emit(out, "  2. Meet-and-greet scheduled at the shelter.")
  .emit(out, "  3. 48-hour reflection period before finalizing.")
  .emit(out, "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.")

  flags <- pawmatch_flags()
  ctx <- .context()
  if (tinyflags::tf_enabled(flags, .FLAG_HOME_CHECK_FOLLOWUP, ctx)) {
    .emit(out, "  5. Two-week follow-up check from a counselor to see how you're settling in.")
  }
  .blank(out)
  .emit(out, "Returns are always accepted, no questions asked.")

  if (tinyflags::tf_enabled(flags, .FLAG_SUGGEST_DONATE_AFTER_ADOPTION, ctx)) {
    .blank(out)
    .emit(out, "If ", pet$name, " brings you joy, please consider donating to a shelter:")
    .emit(out, "  pawmatch donate")
  }
  0L
}

.cmd_fees <- function(argv, out, err) {
  flags <- pawmatch_flags()
  ctx <- .context()
  .emit(out, "Adoption fees")
  .blank(out)
  if (tinyflags::tf_enabled(flags, .FLAG_FEE_BREAKDOWN_DETAILED, ctx)) {
    .emit(out, "  Dog adoption — $150 total:")
    .emit(out, "    $60   spay / neuter surgery")
    .emit(out, "    $45   core vaccinations")
    .emit(out, "    $25   microchip and registration")
    .emit(out, "    $20   intake exam and deworming")
    .blank(out)
    .emit(out, "  Cat adoption — $90 total:")
    .emit(out, "    $50   spay / neuter surgery")
    .emit(out, "    $25   core vaccinations")
    .emit(out, "    $15   microchip and registration")
    .blank(out)
    .emit(out, "  Small animal — $35 total (intake exam + microchip).")
  } else {
    .emit(out, "  Dog adoption           $150")
    .emit(out, "  Cat adoption            $90")
    .emit(out, "  Small animal            $35")
    .blank(out)
    .emit(out, "  Fees cover spay/neuter, vaccines, and microchip.")
  }
  .blank(out)
  .emit(out, "No one is turned away for inability to pay — ask about our subsidy fund.")
  0L
}

.cmd_return_support <- function(argv, out, err) {
  .emit(out, "Return support")
  .blank(out)
  .emit(out, "If your adoption isn't working out, we're here to help.")
  .emit(out, "  • Free behavior consultation with our trainers.")
  .emit(out, "  • No-judgment returns at any time — your pet stays in our care.")
  .emit(out, "  • Connections to low-cost vet and food assistance programs.")
  .blank(out)
  .emit(out, "Returning a pet is not a failure. Reach out as soon as you'd like support.")
  0L
}

.cmd_donate <- function(argv, out, err) {
  parsed <- .parse_args(argv, value_flags = "focus", bool_flags = "open")
  focus <- parsed$opts$focus
  open_flag <- isTRUE(parsed$opts$open)
  charity_slug <- if (length(parsed$rest) > 0L) parsed$rest[[1L]] else NULL

  flags <- pawmatch_flags()
  ctx <- .context()
  default_focus <- tinyflags::tf_variant_value(flags, .FLAG_DONATE_FOCUS_DEFAULT, ctx)
  effective_focus <- if (is.null(focus)) default_focus else focus
  show_ratings <- tinyflags::tf_enabled(flags, .FLAG_SHOW_CHARITY_RATINGS, ctx)

  if (!is.null(charity_slug)) {
    target <- .charity_find(charity_slug)
    if (is.null(target)) {
      .emit(err, "Unknown charity '", charity_slug, "'.")
      return(1L)
    }
    if (open_flag) {
      return(.open_url(target$url, out, err))
    }
    .render_charity(target, show_ratings, out)
    return(0L)
  }

  listing <- .charity_filter_focus(effective_focus)
  .emit(out, "Animal-welfare charities (focus: ", effective_focus, ")")
  .blank(out)
  for (c in listing) {
    .render_charity(c, show_ratings, out)
    .blank(out)
  }
  .emit(out, .charity_disclaimer)
  if (!show_ratings) {
    .emit(out, "Ratings hidden — set show-charity-ratings to surface them inline.")
  }
  0L
}

# ── helpers ──────────────────────────────────────────────────────

.factors_for_depth <- function(depth) {
  take <- switch(
    depth,
    "short"    = 2L,
    "thorough" = 6L,
    4L
  )
  .ALL_FACTORS[seq_len(min(take, length(.ALL_FACTORS)))]
}

.render_pet <- function(pet, style, out) {
  long_stay_badge <- if (pet$long_stay) " *" else ""
  if (style == "compact") {
    .emit(out, sprintf("  %-10s %-14s %-10s %dy%s",
                       pet$slug, pet$name, pet$species,
                       pet$age_years, long_stay_badge))
  } else if (style == "playful") {
    tag_phrase <- paste(pet$tags, collapse = " & ")
    .emit(out, "  paw ", pet$name, long_stay_badge, " — a ",
          pet$age_years, "-year-old ", tolower(pet$breed),
          " who is ", tag_phrase, ".")
  } else {
    .emit(out, "  ", pet$name, long_stay_badge, "  [", pet$slug, "]")
    .emit(out, "    ", pet$breed, ", ", pet$age_years, " years old")
    .emit(out, "    Tags: ", paste(pet$tags, collapse = ", "))
    .blank(out)
  }
}

.render_charity <- function(charity, show_ratings, out) {
  .emit(out, "  ", charity$name, "  [", charity$slug, "]")
  .emit(out, "    Focus: ", charity$focus)
  .emit(out, "    ", charity$description)
  .emit(out, "    Donate: ", charity$url)
  if (show_ratings) {
    .emit(out, "    Rating: ", charity$rating_note)
  }
}

.open_url <- function(url, out, err) {
  os <- tolower(Sys.info()[["sysname"]])
  cmd <- NULL
  args <- character(0)
  if (grepl("darwin", os)) {
    cmd <- "open"; args <- url
  } else if (grepl("linux", os)) {
    cmd <- "xdg-open"; args <- url
  } else if (grepl("windows|mingw|msys", os)) {
    cmd <- "cmd"; args <- c("/c", "start", "", url)
  }
  if (is.null(cmd)) {
    .emit(err, "Unable to open browser on this platform. URL: ", url)
    return(1L)
  }
  ok <- tryCatch({
    system2(cmd, args, stdout = FALSE, stderr = FALSE, wait = FALSE)
    TRUE
  }, error = function(e) FALSE)
  if (!ok) {
    .emit(err, "Unable to open browser. URL: ", url)
    return(1L)
  }
  0L
}
