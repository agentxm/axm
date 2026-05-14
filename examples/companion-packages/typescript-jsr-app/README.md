# PawMatch (JSR TypeScript consumer app)

`pawmatch` is a tiny JSR TypeScript CLI for a fictional community pet
adoption center. It is a reference _consumer_ of the
`@agentxm/example-tinyflags` library — exactly the codebase the companion
AXM skills and subagent in `../typescript-jsr-lib/.axm/extensions/` are
designed to operate on.

`pawmatch` is not publishable — it exists to demonstrate consumption, not
to publish.

The app also ships its own companion AXM skill,
[`typescript-jsr-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/typescript-jsr-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
deno task start -- browse
deno task start -- show pepper
deno task start -- match --has-kids --active
deno task start -- apply biscuit
deno task start -- fees
deno task start -- return-support
deno task start -- donate
deno task start -- donate brother-wolf --open
```

## Test

```bash
deno task test
```

The smoke test under `test/pawmatch_test.ts` runs the CLI's `fees` command
and asserts that the process exits with code 0.

## Library dependency

The library `@agentxm/example-tinyflags` is consumed from JSR with an exact
version specifier so that `axm discover` produces a versioned purl:

```json
{
  "imports": {
    "@agentxm/example-tinyflags": "jsr:@agentxm/example-tinyflags@0.1.0"
  }
}
```

Range specifiers (`^`, `~`, `>=`) degrade to a versionless purl in the AXM
JSR detector and lose the package-author recommendation link.

## Flag seams

Flag definitions live in `src/flags.ts`. Each is wired into at least one
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
`Deno.env.get("USER")` / `USERNAME` / `LOGNAME`), so running the same
command twice produces the same flag values.

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
animal-welfare organizations with their official donation URLs. The CLI
never processes payments. Every output includes a disclaimer to verify
ratings independently before giving. See `src/charities.ts`.
