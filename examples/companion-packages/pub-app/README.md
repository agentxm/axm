## PawMatch (Pub Dart consumer app)

`pawmatch` is a tiny Dart CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `agentxm_example_tinyflags` library —
exactly the codebase the companion AXM skills and subagent in
`../pub-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not packable — it exists to demonstrate consumption, not to
publish.

The app also ships its own companion AXM skill,
[`pub-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/pub-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

Until `agentxm_example_tinyflags` is published to pub.dev, the app depends on
the sibling library directory via a path dependency:

```bash
dart pub get
dart run pawmatch browse
dart run pawmatch show pepper
dart run pawmatch match --has-kids --active
dart run pawmatch apply biscuit
dart run pawmatch fees
dart run pawmatch return-support
dart run pawmatch donate
dart run pawmatch donate brother-wolf --open
dart test
```

## Library dependency

The app consumes `agentxm_example_tinyflags` as a regular Pub dependency:

```yaml
dependencies:
  agentxm_example_tinyflags:
    path: ../pub-lib
  args: ^2.5.0
```

Once `agentxm_example_tinyflags` is published to pub.dev, the `path:` override
can be replaced with a normal version constraint and the dependency will
resolve from the public index.

## Flag seams

Flag definitions live in `lib/src/flags.dart`. Each is wired into at least
one command so the companion skills have realistic targets:

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

Rollouts are deterministic per user (the CLI uses the OS user, falling back to
`USER`/`USERNAME` env vars, as the `sessionId`), so running the same command
twice produces the same flag values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center — not a
retail pet store — following mainstream animal-welfare best practices:

- "Adopt, don't shop"
- Matching over transacting (counselor-style questionnaire, see `match`)
- Hold and meet-and-greet periods are present in the `apply` flow
- Transparent adoption fees (`fees`) that itemize spay/neuter, vaccines,
  microchip
- No-judgment return support (`return-support`)
- Long-stay animals highlighted in `browse`

## Donate command

`donate` shows a curated, static list of well-known, highly-rated
animal-welfare organizations with their official donation URLs. The CLI never
processes payments. Every output includes a disclaimer to verify ratings
independently before giving. See `lib/src/charities.dart`.
