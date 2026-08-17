# Synthetic unknown precedence case

The root instruction file says to run `task test-all` after any change. A file
under `packages/mobile/` says to run only `task test-mobile` after changes in
that package. Both sources appear to be discovered for mobile work, but the
host's composition order, replacement behavior, and conflict precedence are
not documented or observable in the available environment.
