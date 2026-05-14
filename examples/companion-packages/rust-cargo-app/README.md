# PawMatch (Rust consumer app)

`pawmatch` is a tiny Rust CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `agentxm-example-tinyflags` crate —
exactly the codebase the companion AXM skills and subagent in
`../rust-cargo-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable (`publish = false` in `Cargo.toml`) — it exists
to demonstrate consumption, not to publish.

The app also ships its own companion AXM skill,
[`rust-cargo-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/rust-cargo-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
cargo run -- browse
cargo run -- show pepper
cargo run -- match --has-kids --active
cargo run -- apply biscuit
cargo run -- fees
cargo run -- return-support
cargo run -- donate
cargo run -- donate brother-wolf --open
```

Build a release binary with:

```bash
cargo build --release
./target/release/pawmatch browse
```

## Test

```bash
cargo test
cargo clippy --all-targets -- -D warnings
```

The integration suite under `tests/cli.rs` exercises every subcommand using
in-memory `Vec<u8>` writers and a stub `OpenUrl` closure.

## Library dependency

The app consumes `agentxm-example-tinyflags` from crates.io:

```toml
[dependencies]
agentxm-example-tinyflags = "0.1.0"
```

This lets Cargo install the library into `$CARGO_HOME/registry/src/...`, where
`axm discover` can read `[package.metadata.axm]` from the published manifest and
surface the companion pack recommendation.

## Flag seams

Flag definitions live in `src/flags.rs`. Each is wired into at least one
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

Rollouts are deterministic per user (the CLI derives `Context::new(...)` from
`$USER` / `$USERNAME` / `$LOGNAME`), so running the same command twice
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
independently before giving. See `src/charities.rs`.
