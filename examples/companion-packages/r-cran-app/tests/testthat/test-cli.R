# Capture pawmatch_run's stdout/stderr into in-memory text connections and
# return a list(status, out, err).
run_cli <- function(args) {
  out_con <- textConnection("out_buf", open = "w", local = TRUE)
  err_con <- textConnection("err_buf", open = "w", local = TRUE)
  on.exit({
    close(out_con); close(err_con)
  }, add = TRUE)
  status <- pawmatch::pawmatch_run(args, out = out_con, err = err_con)
  list(
    status = status,
    out = paste(out_buf, collapse = "\n"),
    err = paste(err_buf, collapse = "\n")
  )
}

test_that("no args prints usage", {
  r <- run_cli(character(0))
  expect_equal(r$status, 0L)
  expect_match(r$out, "pawmatch", fixed = TRUE)
  expect_match(r$out, "Commands:", fixed = TRUE)
})

test_that("fees exits 0", {
  r <- run_cli("fees")
  expect_equal(r$status, 0L)
  expect_match(r$out, "Adoption fees", fixed = TRUE)
})

test_that("browse lists pets", {
  r <- run_cli("browse")
  expect_equal(r$status, 0L)
  expect_match(r$out, "Biscuit", fixed = TRUE)
})

test_that("browse --species filters", {
  r <- run_cli(c("browse", "--species", "cat"))
  expect_equal(r$status, 0L)
  expect_match(r$out, "Pepper", fixed = TRUE)
  expect_false(grepl("Biscuit", r$out, fixed = TRUE))
})

test_that("browse unknown species says none found", {
  r <- run_cli(c("browse", "--species", "dragon"))
  expect_equal(r$status, 0L)
  expect_match(r$out, "No adoptable pets found", fixed = TRUE)
})

test_that("show known pet succeeds", {
  r <- run_cli(c("show", "pepper"))
  expect_equal(r$status, 0L)
  expect_match(r$out, "Pepper", fixed = TRUE)
  expect_match(r$out, "Needs:", fixed = TRUE)
})

test_that("show unknown pet errors", {
  r <- run_cli(c("show", "nope"))
  expect_equal(r$status, 1L)
  expect_match(r$err, "Unknown pet", fixed = TRUE)
})

test_that("match prints strategy and depth", {
  r <- run_cli(c("match", "--has-kids", "--active"))
  expect_equal(r$status, 0L)
  expect_match(r$out, "Strategy:", fixed = TRUE)
  expect_match(r$out, "Quiz depth:", fixed = TRUE)
})

test_that("apply known pet shows next steps", {
  r <- run_cli(c("apply", "biscuit"))
  expect_equal(r$status, 0L)
  expect_match(r$out, "Adoption application for Biscuit", fixed = TRUE)
  expect_match(r$out, "Meet-and-greet", fixed = TRUE)
})

test_that("apply unknown pet errors", {
  r <- run_cli(c("apply", "nope"))
  expect_equal(r$status, 1L)
  expect_match(r$err, "Unknown pet", fixed = TRUE)
})

test_that("return-support prints policy", {
  r <- run_cli("return-support")
  expect_equal(r$status, 0L)
  expect_match(r$out, "Return support", fixed = TRUE)
  expect_match(r$out, "No-judgment", fixed = TRUE)
})

test_that("donate lists charities", {
  r <- run_cli("donate")
  expect_equal(r$status, 0L)
  expect_match(r$out, "Animal-welfare charities", fixed = TRUE)
  expect_match(r$out, "Best Friends", fixed = TRUE)
})

test_that("donate --focus filters", {
  r <- run_cli(c("donate", "--focus", "rescue"))
  expect_equal(r$status, 0L)
  expect_match(r$out, "Brother Wolf", fixed = TRUE)
  expect_false(grepl("Best Friends Animal Society", r$out, fixed = TRUE))
})

test_that("donate <slug> shows a single charity", {
  r <- run_cli(c("donate", "brother-wolf"))
  expect_equal(r$status, 0L)
  expect_match(r$out, "Brother Wolf", fixed = TRUE)
})

test_that("donate unknown slug errors", {
  r <- run_cli(c("donate", "not-a-charity"))
  expect_equal(r$status, 1L)
  expect_match(r$err, "Unknown charity", fixed = TRUE)
})

test_that("unknown command errors", {
  r <- run_cli("teleport")
  expect_equal(r$status, 1L)
  expect_match(r$err, "Unknown command", fixed = TRUE)
})
