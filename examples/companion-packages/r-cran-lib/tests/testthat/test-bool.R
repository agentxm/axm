test_that("tf_bool default is used when no rollout", {
  flags <- tf_registry(
    checkout_redesign = tf_bool(default = TRUE)
  )
  expect_true(tf_enabled(flags, "checkout_redesign", tf_with_context(user_id = "user-1")))
})

test_that("tf_bool rollout 0 is always off", {
  flags <- tf_registry(
    experiment = tf_bool(default = FALSE, rollout = 0)
  )
  expect_false(tf_enabled(flags, "experiment", tf_with_context(user_id = "user-1")))
  expect_false(tf_enabled(flags, "experiment", tf_with_context(user_id = "user-42")))
})

test_that("tf_bool rollout 100 is always on", {
  flags <- tf_registry(
    experiment = tf_bool(default = FALSE, rollout = 100)
  )
  expect_true(tf_enabled(flags, "experiment", tf_with_context(user_id = "user-1")))
  expect_true(tf_enabled(flags, "experiment", tf_with_context(user_id = "user-42")))
})

test_that("tf_bool rollout is deterministic per context", {
  flags <- tf_registry(
    experiment = tf_bool(default = FALSE, rollout = 50)
  )
  ctx <- tf_with_context(user_id = "user-1")
  first <- tf_enabled(flags, "experiment", ctx)
  second <- tf_enabled(flags, "experiment", ctx)
  third <- tf_enabled(flags, "experiment", ctx)
  expect_equal(first, second)
  expect_equal(first, third)
})

test_that("tf_bool rollout 50% lands roughly in the expected band", {
  flags <- tf_registry(
    experiment = tf_bool(default = FALSE, rollout = 50)
  )
  on_count <- sum(vapply(
    0:199,
    function(i) tf_enabled(flags, "experiment", tf_with_context(user_id = paste0("user-", i))),
    logical(1)
  ))
  expect_gte(on_count, 70)
  expect_lte(on_count, 130)
})

test_that("tf_bool rejects out-of-range rollouts", {
  expect_error(tf_bool(rollout = 101), "must be an integer from 0 to 100")
  expect_error(tf_bool(rollout = -1), "must be an integer from 0 to 100")
  expect_error(tf_bool(rollout = TRUE), "must be an integer from 0 to 100")
})
