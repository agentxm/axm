# Rust TinyFlags

This example shows how a Cargo crate can ship companion AXM extensions for its
users. The crate is a small feature flag library named
`agentxm-example-tinyflags` and is imported as `tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Cargo
crate uses the `agentxm-example-*` distribution-name prefix.

The crate ships AXM recommendations in an `axm.json` sidecar at the crate
root:

```json
{
  "recommendedExtensions": ["@examples/packs/cargo-tinyflags@^0.1.0"]
}
```

When this crate is added as a dependency, `axm discover` can read
`$CARGO_HOME/registry/src/<index>/agentxm-example-tinyflags-<version>/axm.json`
and surface the companion pack as a package-author recommendation.

A working consumer is in `../cargo-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── Cargo.toml                  Cargo manifest
├── axm.json                    Companion-extension recommendations
└── src/                        Library sources with inline `#[cfg(test)] mod tests`
    ├── lib.rs
    ├── error.rs
    └── flag.rs
```

## Build & test

```bash
cargo build
cargo test
```

`cargo test` runs the inline `#[cfg(test)] mod tests` suite plus the doc-test
under `src/lib.rs`.

## Library

The library exposes:

- `Flag::boolean()` / `Flag::variant(values)` — builder constructors that
  validate inputs in `build()`.
- `Flags::builder()` — assemble the named flag set.
- `Flags::enabled(name, ctx)` — boolean evaluation.
- `Flags::variant(name, ctx)` — variant evaluation.
- `Flags::evaluate(name, ctx)` — kind-dispatched evaluation returning a
  `Value`.
- `Context::new(id)` — caller identity used for deterministic bucketing.

```rust
use tinyflags::{Context, Flag, Flags};

let flags = Flags::builder()
    .add(
        "checkout-redesign",
        Flag::boolean().default(true).build().unwrap(),
    )
    .add(
        "search-ranking",
        Flag::variant(["classic", "semantic"])
            .default("classic")
            .rollout([("semantic", 100)])
            .build()
            .unwrap(),
    )
    .build()
    .unwrap();

let ctx = Context::new("user-1");
let on = flags.enabled("checkout-redesign", &ctx).unwrap();       // true
let v  = flags.variant("search-ranking", &ctx).unwrap();          // "semantic"
let val = flags.evaluate("search-ranking", &ctx).unwrap();        // Value::Variant("semantic")
# let _ = (on, v, val);
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                               |
| -------- | ------------------------------------------------- |
| Skill    | `@examples/skills/cargo-tinyflags-add-flag`       |
| Skill    | `@examples/skills/cargo-tinyflags-rollout-review` |
| Skill    | `@examples/skills/cargo-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/cargo-tinyflags-maintainer`  |
| Pack     | `@examples/packs/cargo-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:cargo/agentxm-example-tinyflags` as its companion package.

## Scenario

A framework or library author can use this layout as a model:

1. Implement the Cargo crate as usual.
2. Ship an `axm.json` sidecar at the crate root recommending the companion
   pack.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
