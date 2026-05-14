## PawMatch (R / CRAN consumer app)

`pawmatch` is a tiny R CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `tinyflags` R package — exactly the
codebase the companion AXM skills and subagent in
`../r-cran-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not CRAN-publishable — it exists to demonstrate consumption,
not to publish to CRAN.

The app also ships its own companion AXM skill,
[`r-cran-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/r-cran-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find
and apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

Until `tinyflags` is published to CRAN, install the sibling library from
source first:

```bash
R CMD INSTALL ../r-cran-lib
R CMD INSTALL .

Rscript -e 'testthat::test_local()'
Rscript inst/scripts/pawmatch.R browse
Rscript inst/scripts/pawmatch.R show pepper
Rscript inst/scripts/pawmatch.R match --has-kids --active
Rscript inst/scripts/pawmatch.R apply biscuit
Rscript inst/scripts/pawmatch.R fees
Rscript inst/scripts/pawmatch.R return-support
Rscript inst/scripts/pawmatch.R donate
Rscript inst/scripts/pawmatch.R donate brother-wolf --open
```

After installation, the script is also reachable via the installed
package's `scripts/` directory:

```bash
Rscript "$(Rscript -e 'cat(system.file("scripts/pawmatch.R", package = "pawmatch"))')" browse
```

## Library dependency

The `DESCRIPTION` consumes `tinyflags` as a runtime dependency:

```
Imports: tinyflags
```

Once `tinyflags` is published to CRAN, `install.packages("tinyflags")`
resolves it from the public index. During development, install from the
sibling library directory.

## Flag seams

Flag definitions live in `R/flags.R`. Each is wired into at least one
command so the companion skills have realistic targets:

| Flag                            | Type    | Used in  |
| ------------------------------- | ------- | -------- |
| `home-check-followup`           | bool    | `apply`  |
| `fee-breakdown-detailed`        | bool    | `fees`   |
| `long-stay-highlight`           | bool    | `browse` |
| `suggest-donate-after-adoption` | bool    | `apply`  |
| `show-charity-ratings`          | bool    | `donate` |
| `recommendation-strategy`       | variant | `match`  |
| `match-quiz-depth`              | variant | `match`  |
| `pet-card-style`                | variant | `browse` |
| `donate-focus-default`          | variant | `donate` |

Rollouts are deterministic per user (the CLI uses the login as the
`session_id`), so running the same command twice produces the same flag
values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center —
not a retail pet store — following mainstream animal-welfare best
practices:

- "Adopt, don't shop"
- Matching over transacting (counselor-style questionnaire, see `match`)
- Hold and meet-and-greet periods are present in the `apply` flow
- Transparent adoption fees (`fees`) that itemize spay/neuter, vaccines,
  microchip
- No-judgment return support (`return-support`)
- Long-stay animals highlighted in `browse`

## Donate command

`donate` shows a curated, static list of well-known, highly-rated
animal-welfare organizations with their official donation URLs. The CLI
never processes payments. Every output includes a disclaimer to verify
ratings independently before giving. See `R/charities.R`.
