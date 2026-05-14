## PawMatch (RubyGems consumer app)

`pawmatch` is a tiny Ruby CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `agentxm-example-tinyflags` gem — exactly
the codebase the companion AXM skills and subagent in
`../ruby-rubygems-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not packable — it exists to demonstrate consumption, not to
publish to RubyGems.

The app also ships its own companion AXM skill,
[`ruby-rubygems-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/ruby-rubygems-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

Until `agentxm-example-tinyflags` is published to rubygems.org, the bundled
Gemfile pulls it from the sibling library directory:

```bash
bundle install
bundle exec rake test
bundle exec pawmatch browse
bundle exec pawmatch show pepper
bundle exec pawmatch match --has-kids --active
bundle exec pawmatch apply biscuit
bundle exec pawmatch fees
bundle exec pawmatch return-support
bundle exec pawmatch donate
bundle exec pawmatch donate brother-wolf --open
```

Without Bundler — run directly against the sibling library on the load path:

```bash
ruby -Ilib -I../ruby-rubygems-lib/lib bin/pawmatch browse
ruby -Ilib -I../ruby-rubygems-lib/lib -Itest test/cli_test.rb
```

## Library dependency

The gemspec consumes `agentxm-example-tinyflags` as a runtime dependency:

```ruby
spec.add_runtime_dependency "agentxm-example-tinyflags", "0.1.0"
```

The Gemfile temporarily overrides the source so Bundler resolves the gem
locally:

```ruby
gem "agentxm-example-tinyflags", path: "../ruby-rubygems-lib"
```

Once `agentxm-example-tinyflags` is published to rubygems.org, the `path:`
override can be removed and Bundler will resolve from the public index.

## Flag seams

Flag definitions live in `lib/pawmatch/flags.rb`. Each is wired into at least
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

Rollouts are deterministic per user (the CLI uses `Etc.getlogin` as the
`session_id`), so running the same command twice produces the same flag
values.

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
ratings independently before giving. See `lib/pawmatch/charities.rb`.
