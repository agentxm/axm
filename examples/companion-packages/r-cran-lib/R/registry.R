# tinyflags: registry and evaluation.

#' Construct a frozen registry of named flag definitions.
#'
#' Pass flags as named arguments. Each value must be a `tf_bool` or
#' `tf_variant` object. Names must be unique non-empty strings.
#'
#' @param ... Named flag definitions.
#' @return A `tf_registry` object.
#' @export
tf_registry <- function(...) {
  defs <- list(...)
  if (length(defs) > 0L) {
    nm <- names(defs)
    if (is.null(nm) || any(!nzchar(nm)) || anyNA(nm)) {
      stop("tf_registry requires named flag definitions", call. = FALSE)
    }
    if (length(unique(nm)) != length(nm)) {
      stop("tf_registry flag names must be unique", call. = FALSE)
    }
    for (i in seq_along(defs)) {
      flag <- defs[[i]]
      if (!(inherits(flag, "tf_bool") || inherits(flag, "tf_variant"))) {
        stop(sprintf("Definition for '%s' must be a tf_bool or tf_variant", nm[[i]]), call. = FALSE)
      }
    }
  }
  structure(list(definitions = defs), class = "tf_registry")
}

# Internal: look up a flag definition or error out.
.tf_lookup <- function(registry, name) {
  if (!inherits(registry, "tf_registry")) {
    stop("First argument must be a tf_registry", call. = FALSE)
  }
  if (!is.character(name) || length(name) != 1L) {
    stop("Flag name must be a single string", call. = FALSE)
  }
  flag <- registry$definitions[[name]]
  if (is.null(flag)) {
    stop(sprintf("Unknown tinyflags flag: %s", name), call. = FALSE)
  }
  flag
}

#' Evaluate a boolean flag against a context.
#'
#' @param registry A `tf_registry`.
#' @param name Flag name.
#' @param context A `tf_context` or NULL.
#' @return Logical scalar.
#' @export
tf_enabled <- function(registry, name, context = NULL) {
  flag <- .tf_lookup(registry, name)
  if (!inherits(flag, "tf_bool")) {
    stop(sprintf("tinyflags flag '%s' is not a boolean flag", name), call. = FALSE)
  }
  if (is.null(flag$rollout)) {
    return(flag$default)
  }
  tf_bucket(name, context) < flag$rollout
}

#' Evaluate a variant flag against a context.
#'
#' @param registry A `tf_registry`.
#' @param name Flag name.
#' @param context A `tf_context` or NULL.
#' @return Character scalar (one of the variants).
#' @export
tf_variant_value <- function(registry, name, context = NULL) {
  flag <- .tf_lookup(registry, name)
  if (!inherits(flag, "tf_variant")) {
    stop(sprintf("tinyflags flag '%s' is not a variant flag", name), call. = FALSE)
  }
  if (is.null(flag$rollout) || length(flag$rollout) == 0L) {
    return(flag$default)
  }
  bucket <- tf_bucket(name, context)
  upper <- 0L
  for (variant_name in names(flag$rollout)) {
    upper <- upper + flag$rollout[[variant_name]]
    if (bucket < upper) {
      return(variant_name)
    }
  }
  flag$default
}

#' Evaluate any flag, dispatching on its kind.
#'
#' @param registry A `tf_registry`.
#' @param name Flag name.
#' @param context A `tf_context` or NULL.
#' @return Logical (for boolean flags) or character (for variant flags).
#' @export
tf_evaluate <- function(registry, name, context = NULL) {
  flag <- .tf_lookup(registry, name)
  if (inherits(flag, "tf_bool")) {
    tf_enabled(registry, name, context)
  } else {
    tf_variant_value(registry, name, context)
  }
}
