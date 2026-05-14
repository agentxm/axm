# tinyflags: evaluation context and deterministic bucketing.

#' Build an evaluation context.
#'
#' Threads a stable identifier through flag evaluation. Pass any combination
#' of `user_id`, `account_id`, or `session_id`. The first non-NULL value is
#' used as the bucketing key, in that order.
#'
#' @param user_id Optional character / integer user identifier.
#' @param account_id Optional account identifier.
#' @param session_id Optional session identifier.
#' @return A list with class `tf_context`.
#' @export
tf_with_context <- function(user_id = NULL, account_id = NULL, session_id = NULL) {
  structure(
    list(user_id = user_id, account_id = account_id, session_id = session_id),
    class = "tf_context"
  )
}

# Internal: pick the stable bucket key from a context (or fall back to
# "anonymous"). Accepts NULL, a tf_context, or a plain named list.
.tf_context_key <- function(context) {
  if (is.null(context)) {
    return("anonymous")
  }
  if (!is.list(context)) {
    return("anonymous")
  }
  for (key in c("user_id", "account_id", "session_id")) {
    val <- context[[key]]
    if (!is.null(val) && length(val) == 1L && !is.na(val) && nzchar(as.character(val))) {
      return(as.character(val))
    }
  }
  "anonymous"
}

#' Compute the deterministic 0..99 bucket for a flag name and context.
#'
#' @param flag_name Character flag name.
#' @param context A `tf_context` or named list (or NULL).
#' @return Integer in 0..99.
#' @export
tf_bucket <- function(flag_name, context = NULL) {
  if (!is.character(flag_name) || length(flag_name) != 1L) {
    stop("tf_bucket requires a single flag_name string", call. = FALSE)
  }
  key <- .tf_context_key(context)
  digest_hex <- digest::digest(paste0(flag_name, ":", key), algo = "sha1", serialize = FALSE)
  # Take first 8 hex chars and modulo 100.
  prefix <- substr(digest_hex, 1L, 8L)
  as.integer(strtoi(prefix, base = 16L) %% 100L)
}
