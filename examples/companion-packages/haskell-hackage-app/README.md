# PawMatch (Hackage consumer app)

`pawmatch` is a tiny Haskell CLI for a fictional community pet adoption
center. It is a reference _consumer_ of the `agentxm-example-tinyflags`
library — exactly the codebase the companion AXM skills and subagent in
`../haskell-hackage-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable — it exists to demonstrate consumption, not
to ship to Hackage.

The app also ships its own companion AXM skill,
[`haskell-hackage-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/haskell-hackage-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find
and apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

Until `agentxm-example-tinyflags` is published to Hackage, the bundled
`cabal.project` pulls it from the sibling library directory:

```bash
cabal update
cabal build
cabal test
cabal run pawmatch -- browse
cabal run pawmatch -- show pepper
cabal run pawmatch -- match --has-kids --active
cabal run pawmatch -- apply biscuit
cabal run pawmatch -- fees
cabal run pawmatch -- return-support
cabal run pawmatch -- donate
cabal run pawmatch -- donate brother-wolf --open
```

The `--open` flag prints the URL rather than actually launching a browser
— shipping code would call out to `open`/`xdg-open`/`start`.

## Library dependency

The `.cabal` file declares `agentxm-example-tinyflags` as a build
dependency. `cabal.project` overrides the source so cabal resolves it
locally:

```
packages:
  .
  ../haskell-hackage-lib
```

Once `agentxm-example-tinyflags` is published to Hackage, remove the
sibling-package line and the dependency will resolve from the public
index.

## Flag seams

Flag definitions live in `src/AgentXM/Example/PawMatch/Flags.hs`. Each is
wired into at least one command so the companion skills have realistic
targets:

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

Rollouts are deterministic per session id. The CLI reads `PAWMATCH_USER`
from the environment as the session id, falling back to `"anonymous"`, so
running the same command twice produces the same flag values.

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
ratings independently before giving. See
`src/AgentXM/Example/PawMatch/Charities.hs`.
