#!/usr/bin/env Rscript
# pawmatch CLI entrypoint.
#
# Installed location: <pawmatch>/scripts/pawmatch.R (via R's `inst/` packaging).
# Run during development from the package root with:
#   Rscript inst/scripts/pawmatch.R browse
#
# Once the package is installed, the same script is callable as:
#   Rscript -e 'pawmatch::pawmatch_run(commandArgs(trailingOnly = TRUE))' -- browse
suppressPackageStartupMessages({
  library(tinyflags)
  library(pawmatch)
})

status <- pawmatch::pawmatch_run(commandArgs(trailingOnly = TRUE))
quit(status = as.integer(status))
