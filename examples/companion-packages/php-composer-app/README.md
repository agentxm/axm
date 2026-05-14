# PawMatch (Composer PHP consumer app)

`pawmatch` is a tiny Composer PHP CLI for a fictional community pet adoption
center. It is a reference _consumer_ of the `agentxm/example-tinyflags`
library — exactly the codebase the companion AXM skills and subagent in
`../php-composer-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable (`"type": "project"`) — it exists to
demonstrate consumption, not to publish.

The app also ships its own companion AXM skill,
[`php-composer-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/php-composer-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
composer install
composer start -- browse
composer start -- show pepper
composer start -- match --has-kids --active
composer start -- apply biscuit
composer start -- fees
composer start -- return-support
composer start -- donate
composer start -- donate brother-wolf --open
```

After `composer install`, the `pawmatch` binary is also available via
`./vendor/bin/pawmatch`.

## Test

```bash
composer test
```

The tests under `tests/PawMatchCliTest.php` exercise the CLI in-process with
in-memory streams and assert non-zero exit on invalid input.

## Library dependency

The library `agentxm/example-tinyflags` has not yet been published to
Packagist, so the app references the sibling library directly via a `path`
repository:

```json
{
  "repositories": [{ "type": "path", "url": "../php-composer-lib" }],
  "require": {
    "agentxm/example-tinyflags": "*"
  }
}
```

TODO: once the library is published, remove the `repositories` entry and
switch to a version range (e.g. `"agentxm/example-tinyflags": "^0.1.0"`).
Publishing to Packagist is intentionally left to the user — the library
should be published from `../php-composer-lib/` first.

## Flag seams

Flag definitions live in `src/PawMatchFlags.php`. Each is wired into at
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

Rollouts are deterministic per user (the CLI derives `sessionId` from
`$_SERVER['USER']` / `USERNAME` / `LOGNAME`), so running the same command
twice produces the same flag values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center — not
a retail pet store — following mainstream animal-welfare best practices:

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
ratings independently before giving. See `src/Charities.php`.
