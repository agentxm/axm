# tinyflags: flag constructors and validation.
#
# Two flag kinds:
#   * tf_bool(default, rollout = NULL) -- on/off with optional percentage rollout.
#   * tf_variant(variants, default, rollout = NULL) -- named treatment with
#     optional per-variant percentage allocations.
#
# All flag objects are plain lists with class attributes ("tf_bool" or
# "tf_variant") and are validated at construction time.

# Internal: validate that a percentage is an integer-valued numeric in 0..100.
# Logical values are rejected (matches the Ruby/Python reference behaviour).
.tf_validate_percentage <- function(value, label) {
  if (is.logical(value)) {
    stop(sprintf("%s must be an integer from 0 to 100", label), call. = FALSE)
  }
  if (length(value) != 1L || !is.numeric(value) || is.na(value)) {
    stop(sprintf("%s must be an integer from 0 to 100", label), call. = FALSE)
  }
  if (!isTRUE(value == as.integer(value))) {
    stop(sprintf("%s must be an integer from 0 to 100", label), call. = FALSE)
  }
  intval <- as.integer(value)
  if (intval < 0L || intval > 100L) {
    stop(sprintf("%s must be an integer from 0 to 100", label), call. = FALSE)
  }
  intval
}

#' Construct a boolean feature flag.
#'
#' @param default Logical, length 1. Default value when no rollout is set.
#' @param rollout Optional integer percentage in 0..100. When set, the flag
#'   evaluates to TRUE for that share of contexts (deterministic per context).
#' @return A `tf_bool` object.
#' @export
tf_bool <- function(default = FALSE, rollout = NULL) {
  if (!is.logical(default) || length(default) != 1L || is.na(default)) {
    stop("tf_bool default must be TRUE or FALSE", call. = FALSE)
  }
  rollout_int <- if (is.null(rollout)) NULL else .tf_validate_percentage(rollout, "tf_bool rollout")
  structure(
    list(default = default, rollout = rollout_int),
    class = "tf_bool"
  )
}

#' Construct a variant feature flag.
#'
#' @param variants Character vector of allowed variant names (non-empty, unique).
#' @param default Character. Must be one of `variants`.
#' @param rollout Optional named list/vector of integer percentages, totalling
#'   <= 100. Each name must be one of `variants`.
#' @return A `tf_variant` object.
#' @export
tf_variant <- function(variants, default, rollout = NULL) {
  if (!is.character(variants) || length(variants) == 0L) {
    stop("tf_variant requires at least one variant", call. = FALSE)
  }
  if (anyNA(variants) || any(nchar(variants) == 0L)) {
    stop("tf_variant variants must be unique non-empty strings", call. = FALSE)
  }
  if (length(unique(variants)) != length(variants)) {
    stop("tf_variant variants must be unique non-empty strings", call. = FALSE)
  }
  if (!is.character(default) || length(default) != 1L || is.na(default)) {
    stop("tf_variant default must be a single string", call. = FALSE)
  }
  if (!(default %in% variants)) {
    stop("tf_variant default must be one of the variants", call. = FALSE)
  }

  rollout_norm <- NULL
  if (!is.null(rollout)) {
    if (is.list(rollout)) {
      rollout <- unlist(rollout)
    }
    nm <- names(rollout)
    if (is.null(nm) || any(nchar(nm) == 0L)) {
      stop("tf_variant rollout must be a named numeric vector", call. = FALSE)
    }
    rollout_norm <- integer(0)
    total <- 0L
    for (i in seq_along(rollout)) {
      name_i <- nm[[i]]
      if (!(name_i %in% variants)) {
        stop(sprintf("tf_variant rollout references unknown variant: %s", name_i), call. = FALSE)
      }
      pct <- .tf_validate_percentage(rollout[[i]], sprintf("rollout for '%s'", name_i))
      rollout_norm[name_i] <- pct
      total <- total + pct
    }
    if (total > 100L) {
      stop("tf_variant rollout percentages cannot exceed 100", call. = FALSE)
    }
  }

  structure(
    list(variants = variants, default = default, rollout = rollout_norm),
    class = "tf_variant"
  )
}
