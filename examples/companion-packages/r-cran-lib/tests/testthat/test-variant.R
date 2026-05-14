test_that("tf_variant default is used when no rollout", {
  flags <- tf_registry(
    search_ranking = tf_variant(
      variants = c("classic", "semantic"),
      default = "classic"
    )
  )
  expect_equal(
    tf_variant_value(flags, "search_ranking", tf_with_context(user_id = "user-1")),
    "classic"
  )
})

test_that("tf_variant rollout 0 returns the default", {
  flags <- tf_registry(
    search_ranking = tf_variant(
      variants = c("classic", "semantic"),
      default = "classic",
      rollout = c(semantic = 0)
    )
  )
  expect_equal(
    tf_variant_value(flags, "search_ranking", tf_with_context(user_id = "user-1")),
    "classic"
  )
})

test_that("tf_variant full allocation returns the variant", {
  flags <- tf_registry(
    search_ranking = tf_variant(
      variants = c("classic", "semantic"),
      default = "classic",
      rollout = c(semantic = 100)
    )
  )
  expect_equal(
    tf_variant_value(flags, "search_ranking", tf_with_context(user_id = "user-1")),
    "semantic"
  )
})

test_that("tf_variant is deterministic per context", {
  flags <- tf_registry(
    search_ranking = tf_variant(
      variants = c("classic", "semantic", "personalized"),
      default = "classic",
      rollout = c(semantic = 33, personalized = 33)
    )
  )
  ctx <- tf_with_context(user_id = "user-1")
  expect_equal(
    tf_variant_value(flags, "search_ranking", ctx),
    tf_variant_value(flags, "search_ranking", ctx)
  )
})

test_that("tf_variant rejects invalid configurations", {
  expect_error(
    tf_variant(variants = character(0), default = "classic"),
    "at least one variant"
  )
  expect_error(
    tf_variant(variants = c("classic", "semantic"), default = "personalized"),
    "default must be one of the variants"
  )
  expect_error(
    tf_variant(
      variants = c("classic", "semantic"),
      default = "classic",
      rollout = c(semantic = 80, classic = 30)
    ),
    "cannot exceed 100"
  )
  expect_error(
    tf_variant(
      variants = c("classic", "semantic"),
      default = "classic",
      rollout = c(personalized = 10)
    ),
    "unknown variant"
  )
})

test_that("tf_evaluate dispatches by flag kind", {
  flags <- tf_registry(
    checkout_redesign = tf_bool(default = TRUE),
    search_ranking = tf_variant(
      variants = c("classic", "semantic"),
      default = "classic"
    )
  )
  expect_true(tf_evaluate(flags, "checkout_redesign"))
  expect_equal(tf_evaluate(flags, "search_ranking"), "classic")
})

test_that("unknown flag lookup raises", {
  flags <- tf_registry()
  expect_error(tf_enabled(flags, "missing"), "Unknown tinyflags flag")
})
