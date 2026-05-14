# PawMatch (npm JavaScript consumer app)

`pawmatch` is a tiny npm JavaScript CLI for a fictional community pet adoption
center. It is a reference _consumer_ of the `@agentxm/example-tinyflags`
library — exactly the codebase the companion AXM skills and subagent in
`../javascript-npm-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable (`"private": true`) — it exists to demonstrate
consumption, not to publish.

The app also ships its own companion AXM skill,
[`javascript-npm-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/javascript-npm-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
npm install
npm start -- browse
npm start -- show pepper
npm start -- match --has-kids --active
npm start -- apply biscuit
npm start -- fees
npm start -- return-support
npm start -- donate
npm start -- donate brother-wolf --open
```

After `npm install`, the `pawmatch` binary is also available via
`./node_modules/.bin/pawmatch`.

## Test

```bash
npm test
```

The smoke test under `test/pawmatch.test.js` runs `node ./src/index.js fees`
and asserts that the process exits with code 0.

## Library dependency

The library `@agentxm/example-tinyflags` has not yet been published to
npmjs.org, so the app references the sibling library directly via a `file:`
dependency:

```json
{
  "dependencies": {
    "@agentxm/example-tinyflags": "file:../javascript-npm-lib"
  }
}
```

TODO: once the library is published, switch to a version range
(e.g. `"@agentxm/example-tinyflags": "^0.1.0"`). `npm publish` is
intentionally left to the user — the library should be published from
`../javascript-npm-lib/` first.

## Flag seams

Flag definitions live in `src/flags.js`. Each is wired into at least one
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

Rollouts are deterministic per user (the CLI derives `sessionId` from
`process.env.USER` / `USERNAME` / `LOGNAME`), so running the same command
twice produces the same flag values.

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
independently before giving. See `src/charities.js`.
