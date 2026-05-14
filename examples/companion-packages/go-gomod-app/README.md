# PawMatch (Go consumer app)

`pawmatch` is a tiny Go CLI for a fictional community pet adoption center. It
is a reference _consumer_ of the `github.com/agentxm/example-tinyflags`
library — exactly the codebase the companion AXM skills and subagent in
`../go-gomod-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable — it exists to demonstrate consumption, not to
publish.

The app also ships its own companion AXM skill,
[`go-gomod-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/go-gomod-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
go run ./cmd/pawmatch browse
go run ./cmd/pawmatch show pepper
go run ./cmd/pawmatch match --has-kids --active
go run ./cmd/pawmatch apply biscuit
go run ./cmd/pawmatch fees
go run ./cmd/pawmatch return-support
go run ./cmd/pawmatch donate
go run ./cmd/pawmatch donate brother-wolf --open
```

Build a standalone binary with:

```bash
go build -o pawmatch ./cmd/pawmatch
./pawmatch browse
```

## Test

```bash
go vet ./...
go test ./...
```

The Go stdlib `testing` suite under `internal/pawmatch/cli_test.go` exercises
every subcommand using buffered `io.Writer` outputs and a stub `OpenURL`.

## Library dependency

The library `github.com/agentxm/example-tinyflags` has not yet been published
to a public Go proxy, so the app references the sibling library directly via
a `replace` directive in `go.mod`:

```text
require github.com/agentxm/example-tinyflags v0.0.0-00010101000000-000000000000

replace github.com/agentxm/example-tinyflags => ../go-gomod-lib
```

TODO: once the library is published, switch to a version (e.g. `v0.1.0`) and
drop the `replace`.

## Flag seams

Flag definitions live in `internal/pawmatch/flags.go`. Each is wired into at
least one command so the companion skills have realistic targets:

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

Rollouts are deterministic per user (the CLI derives `tinyflags.Context.ID`
from `$USER` / `$USERNAME` / `$LOGNAME`), so running the same command twice
produces the same flag values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center — not a
retail pet store — following mainstream animal-welfare best practices:

- "Adopt, don't shop"
- Matching over transacting (counselor-style questionnaire, see `match`)
- Hold and meet-and-greet periods are present in the `apply` flow
- Transparent adoption fees (`fees`) that itemize spay/neuter, vaccines, microchip
- No-judgment return support (`return-support`)
- Long-stay animals highlighted in `browse`

## Donate command

`donate` shows a curated, static list of well-known, highly-rated
animal-welfare organizations with their official donation URLs. The CLI never
processes payments. Every output includes a disclaimer to verify ratings
independently before giving. See `internal/pawmatch/charities.go`.
